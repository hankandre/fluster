use crate::model::{
    DecodeMode, LaunchRequest, MediaTrack, PlaybackSnapshot, PlayerCapabilities, PlayerEvent,
    PlayerSurfaceFrame, PlayerTrack,
};
use crate::redaction::safe_error;
use crate::surface;
use libmpv2::events::{Event, PropertyData};
use libmpv2::{mpv_end_file_reason, Format, Mpv, MpvStr};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;
use url::{Host, Url};

const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const STATE_EVENT_INTERVAL: Duration = Duration::from_millis(200);

#[derive(Debug, Error)]
pub enum MpvError {
    #[error("The embedded player is unavailable: {0}")]
    Renderer(String),
    #[error("Another playback session is already active.")]
    AlreadyPlaying,
    #[error(
        "The playback plan is missing its item, title, media source, or play-session identity."
    )]
    InvalidPlan,
    #[error("The playback stream URL is not allowed. Use HTTPS, or HTTP only for a loopback Jellyfin server.")]
    UnsafeStreamUrl,
    #[error("An external subtitle URL is not allowed. Subtitles must use the same server origin as the playback stream.")]
    UnsafeSubtitleUrl,
    #[error("Could not initialize libmpv 0.41 or newer: {0}")]
    Initialize(String),
    #[error("Fluster requires libmpv 0.41 or newer, but found {0}. Install a current libmpv development/runtime package or use the release AppImage.")]
    UnsupportedVersion(String),
    #[error("Could not set the numeric locale required by libmpv.")]
    Locale,
    #[error("No playback session is active.")]
    NotPlaying,
    #[error("The player command failed: {0}")]
    Command(String),
    #[error("The playback session did not stop within five seconds.")]
    StopTimeout,
}

struct Session {
    id: String,
    mpv: Arc<Mutex<Mpv>>,
    finished: Arc<AtomicBool>,
}

struct ControllerInner {
    session: Mutex<Option<Session>>,
    session_finished: Condvar,
    renderer: Mutex<Result<String, String>>,
    capabilities: Mutex<Option<PlayerCapabilities>>,
}

impl Default for ControllerInner {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            session_finished: Condvar::new(),
            renderer: Mutex::new(Err(String::new())),
            capabilities: Mutex::new(None),
        }
    }
}

#[derive(Clone, Default)]
pub struct MpvController {
    inner: Arc<ControllerInner>,
}

impl MpvController {
    pub fn set_renderer_result(&self, result: Result<String, String>) {
        *self.inner.renderer.lock().expect("renderer mutex poisoned") = result;
        self.inner
            .capabilities
            .lock()
            .expect("capabilities mutex poisoned")
            .take();
    }

    pub fn capabilities(&self) -> Result<PlayerCapabilities, MpvError> {
        if let Some(capabilities) = self
            .inner
            .capabilities
            .lock()
            .expect("capabilities mutex poisoned")
            .clone()
        {
            return Ok(capabilities);
        }
        let renderer = match self
            .inner
            .renderer
            .lock()
            .expect("renderer mutex poisoned")
            .clone()
        {
            Ok(renderer) => renderer,
            Err(error) if error.is_empty() => {
                return Err(MpvError::Renderer(
                    "the native renderer has not finished initializing".into(),
                ))
            }
            Err(error) => return Err(MpvError::Renderer(error)),
        };
        let libmpv_version = query_libmpv_version()?;
        let capabilities = PlayerCapabilities {
            mode: "native",
            embedded: true,
            renderer: renderer.clone(),
            native_renderer: renderer,
            libmpv_version: Some(libmpv_version),
        };
        *self
            .inner
            .capabilities
            .lock()
            .expect("capabilities mutex poisoned") = Some(capabilities.clone());
        Ok(capabilities)
    }

    pub fn launch(&self, app: AppHandle, request: LaunchRequest) -> Result<(), MpvError> {
        if request.plan.item_id.is_empty()
            || request.plan.media_source_id.is_empty()
            || request.plan.play_session_id.is_empty()
            || request.plan.title.is_empty()
        {
            return Err(MpvError::InvalidPlan);
        }
        validate_playback_urls(&request)?;
        self.capabilities()?;
        {
            let session = self.inner.session.lock().expect("session mutex poisoned");
            if session.is_some() {
                return Err(MpvError::AlreadyPlaying);
            }
        }

        // GTK initializes its locale after application startup and may replace
        // LC_NUMERIC with the desktop locale. libmpv requires this category to
        // use the C decimal separator at the instant mpv_create is called.
        ensure_numeric_locale()?;

        let force_software = request.test_force_software;
        let mpv = Mpv::with_initializer(|init| {
            init.set_option("config", false)?;
            init.set_option("vo", "libmpv")?;
            init.set_option("hwdec", if force_software { "no" } else { "auto" })?;
            init.set_option("osc", false)?;
            init.set_option("input-default-bindings", false)?;
            init.set_option("input-vo-keyboard", false)?;
            init.set_option("keep-open", false)?;
            Ok(())
        })
        .map_err(|error| MpvError::Initialize(safe_error(error)))?;
        let mpv = Arc::new(Mutex::new(mpv));
        let mut event_client = {
            let mpv_guard = mpv.lock().expect("libmpv mutex poisoned");
            mpv_guard
                .create_client(Some("fluster-events"))
                .map_err(|error| MpvError::Initialize(safe_error(error)))?
        };
        observe_properties(&event_client)
            .map_err(|error| MpvError::Initialize(safe_error(error)))?;

        let session_id = request.plan.play_session_id.clone();
        let video_loaded = Arc::new(AtomicBool::new(false));
        surface::attach(&app, mpv.clone(), session_id.clone(), video_loaded.clone())
            .map_err(MpvError::Renderer)?;

        let finished = Arc::new(AtomicBool::new(false));
        {
            let mut session = self.inner.session.lock().expect("session mutex poisoned");
            if session.is_some() {
                surface::detach(&app, &session_id);
                return Err(MpvError::AlreadyPlaying);
            }
            *session = Some(Session {
                id: session_id.clone(),
                mpv: mpv.clone(),
                finished: finished.clone(),
            });
        }

        let controller = self.clone();
        let app_for_events = app.clone();
        let plan = request.plan.clone();
        let event_session_id = session_id.clone();
        thread::Builder::new()
            .name("fluster-mpv-events".into())
            .spawn(move || {
                let event_result = catch_unwind(AssertUnwindSafe(|| {
                    run_event_loop(
                        &app_for_events,
                        &mut event_client,
                        &plan.tracks,
                        plan.start_position_ticks,
                        video_loaded,
                        finished,
                    );
                    drop(event_client);
                }));
                if event_result.is_err() {
                    native_trace("libmpv event thread panicked; forcing finalization");
                    let _ = app_for_events.emit(
                        "fluster://player-event",
                        PlayerEvent::Error {
                            message: "The native player event loop stopped unexpectedly.".into(),
                        },
                    );
                }
                controller.finalize_session(&app_for_events, &event_session_id);
            })
            .map_err(|error| {
                self.finalize_session(&app, &session_id);
                MpvError::Initialize(safe_error(error))
            })?;

        let result = mpv
            .lock()
            .expect("libmpv mutex poisoned")
            .command("loadfile", &[&request.plan.stream_url, "replace"])
            .map_err(|error| MpvError::Command(safe_error(error)));
        if result.is_err() {
            self.request_finish(&app, &session_id);
        }
        result
    }

    pub fn set_surface(&self, app: &AppHandle, frame: PlayerSurfaceFrame) -> Result<(), MpvError> {
        let frame = frame
            .validate()
            .map_err(|error| MpvError::Command(error.into()))?;
        surface::set_frame(app, frame).map_err(MpvError::Renderer)
    }

    pub fn set_paused(&self, paused: bool) -> Result<(), MpvError> {
        self.with_mpv(|mpv| mpv.set_property("pause", paused))
    }

    pub fn seek(&self, position_seconds: f64) -> Result<(), MpvError> {
        if !position_seconds.is_finite() || position_seconds < 0.0 {
            return Err(MpvError::Command(
                "The seek position must be a non-negative finite number.".into(),
            ));
        }
        let position = position_seconds.to_string();
        self.with_mpv(|mpv| mpv.command("seek", &[&position, "absolute+exact"]))
    }

    pub fn set_volume(&self, volume: f64) -> Result<(), MpvError> {
        if !volume.is_finite() {
            return Err(MpvError::Command("The volume must be finite.".into()));
        }
        self.with_mpv(|mpv| mpv.set_property("volume", volume.clamp(0.0, 100.0)))
    }

    pub fn set_muted(&self, muted: bool) -> Result<(), MpvError> {
        self.with_mpv(|mpv| mpv.set_property("mute", muted))
    }

    pub fn select_track(&self, track_type: &str, id: Option<i64>) -> Result<(), MpvError> {
        let property = match track_type {
            "audio" => "aid",
            "subtitle" => "sid",
            _ => {
                return Err(MpvError::Command(
                    "Only audio and subtitle track selection is allowed.".into(),
                ))
            }
        };
        self.with_mpv(|mpv| match id {
            Some(id) if id > 0 => mpv.set_property(property, id),
            Some(_) => Err(libmpv2::Error::Null),
            None => mpv.set_property(property, "no"),
        })
    }

    pub fn set_fullscreen(&self, app: &AppHandle, fullscreen: bool) -> Result<(), MpvError> {
        let window = app.get_webview_window("main").ok_or_else(|| {
            MpvError::Command("The main application window is unavailable.".into())
        })?;
        window
            .set_fullscreen(fullscreen)
            .map_err(|error| MpvError::Command(safe_error(error)))
    }

    pub fn stop(&self) -> Result<(), MpvError> {
        let (session_id, finished) = {
            let session = self.inner.session.lock().expect("session mutex poisoned");
            let Some(session) = session.as_ref() else {
                return Ok(());
            };
            (session.id.clone(), session.finished.clone())
        };

        native_trace("stop requested");
        // Do not issue a synchronous mpv "stop" command while the event client
        // is unwinding. libmpv can make those two shutdown paths wait on each
        // other. The event loop owns shutdown: it releases the event client,
        // detaches the renderer, and finally drops the root mpv handle.
        finished.store(true, Ordering::Release);
        self.wait_for_session_end(&session_id, STOP_TIMEOUT)
    }

    fn with_mpv<F>(&self, operation: F) -> Result<(), MpvError>
    where
        F: FnOnce(&Mpv) -> libmpv2::Result<()>,
    {
        let mpv = {
            let session = self.inner.session.lock().expect("session mutex poisoned");
            session
                .as_ref()
                .map(|session| session.mpv.clone())
                .ok_or(MpvError::NotPlaying)?
        };
        let result = operation(&mpv.lock().expect("libmpv mutex poisoned"));
        result.map_err(|error| MpvError::Command(safe_error(error)))
    }

    fn request_finish(&self, app: &AppHandle, id: &str) {
        surface::detach(app, id);
        let session = self.inner.session.lock().expect("session mutex poisoned");
        if session.as_ref().is_some_and(|session| session.id == id) {
            session
                .as_ref()
                .expect("checked active session")
                .finished
                .store(true, Ordering::Release);
        }
    }

    fn finalize_session(&self, app: &AppHandle, id: &str) {
        native_trace("finalizing native surface");
        surface::detach(app, id);
        native_trace("native surface detached");
        let mut session = self.inner.session.lock().expect("session mutex poisoned");
        if session.as_ref().is_some_and(|session| session.id == id) {
            session.take();
            self.inner.session_finished.notify_all();
        }
        native_trace("playback finalized");
    }

    fn wait_for_session_end(&self, id: &str, timeout: Duration) -> Result<(), MpvError> {
        let deadline = Instant::now() + timeout;
        let mut session = self.inner.session.lock().expect("session mutex poisoned");
        while session.as_ref().is_some_and(|session| session.id == id) {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                native_trace("stop timed out");
                return Err(MpvError::StopTimeout);
            };
            let (next_session, result) = self
                .inner
                .session_finished
                .wait_timeout(session, remaining)
                .expect("session mutex poisoned");
            session = next_session;
            if result.timed_out() && session.as_ref().is_some_and(|session| session.id == id) {
                native_trace("stop timed out");
                return Err(MpvError::StopTimeout);
            }
        }
        native_trace("stop acknowledged");
        Ok(())
    }
}

#[cfg(debug_assertions)]
fn native_trace(message: &str) {
    eprintln!("[fluster native] {message}");
}

#[cfg(not(debug_assertions))]
fn native_trace(_message: &str) {}

fn validate_playback_urls(request: &LaunchRequest) -> Result<(), MpvError> {
    let stream_url =
        parse_allowed_media_url(&request.plan.stream_url).ok_or(MpvError::UnsafeStreamUrl)?;
    for track in request
        .plan
        .tracks
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
    {
        let Some(delivery_url) = track.delivery_url.as_deref() else {
            continue;
        };
        let subtitle_url =
            parse_allowed_media_url(delivery_url).ok_or(MpvError::UnsafeSubtitleUrl)?;
        if subtitle_url.origin() != stream_url.origin() {
            return Err(MpvError::UnsafeSubtitleUrl);
        }
    }
    Ok(())
}

fn parse_allowed_media_url(value: &str) -> Option<Url> {
    let url = Url::parse(value).ok()?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return None;
    }
    match url.scheme() {
        "https" if url.host().is_some() => Some(url),
        "http" if url.host().is_some_and(is_loopback_host) => Some(url),
        _ => None,
    }
}

fn is_loopback_host(host: Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(address) => address == std::net::Ipv4Addr::LOCALHOST,
        Host::Ipv6(_) => false,
    }
}

fn query_libmpv_version() -> Result<String, MpvError> {
    ensure_numeric_locale()?;
    let mpv = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        Ok(())
    })
    .map_err(|error| MpvError::Initialize(safe_error(error)))?;
    let version = string_property(&mpv, "mpv-version")
        .ok_or_else(|| MpvError::Initialize("the runtime did not expose mpv-version".into()))?;
    if !is_supported_mpv_version(&version) {
        return Err(MpvError::UnsupportedVersion(version));
    }
    Ok(version)
}

fn ensure_numeric_locale() -> Result<(), MpvError> {
    // SAFETY: `c"C"` is a valid NUL-terminated string that outlives the call;
    // setlocale copies it. The returned pointer is only checked for null.
    let locale = unsafe { libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr()) };
    if locale.is_null() {
        return Err(MpvError::Locale);
    }
    Ok(())
}

fn is_supported_mpv_version(version: &str) -> bool {
    parse_mpv_version(version).is_some_and(|(major, minor, _)| major > 0 || minor >= 41)
}

fn parse_mpv_version(version: &str) -> Option<(u64, u64, u64)> {
    let start = version.find(|character: char| character.is_ascii_digit())?;
    let numeric = version[start..]
        .split(|character: char| !character.is_ascii_digit() && character != '.')
        .next()?;
    let mut parts = numeric.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts.next().unwrap_or("0").parse().ok()?;
    Some((major, minor, patch))
}

fn observe_properties(mpv: &Mpv) -> libmpv2::Result<()> {
    let properties = [
        ("time-pos", Format::Double),
        ("duration", Format::Double),
        ("pause", Format::Flag),
        ("paused-for-cache", Format::Flag),
        ("volume", Format::Double),
        ("mute", Format::Flag),
        ("aid", Format::String),
        ("sid", Format::String),
        ("seeking", Format::Flag),
        ("hwdec-current", Format::String),
        ("hwdec-interop", Format::String),
        ("video-params/hw-pixelformat", Format::String),
        ("current-vo", Format::String),
        ("current-gpu-context", Format::String),
        ("video-codec", Format::String),
        ("video-params/bit-depth", Format::Int64),
        ("width", Format::Int64),
        ("height", Format::Int64),
        ("decoder-frame-drop-count", Format::Int64),
        ("vo-drop-frame-count", Format::Int64),
    ];
    for (id, (name, format)) in properties.into_iter().enumerate() {
        mpv.observe_property(name, format, id as u64 + 1)?;
    }
    Ok(())
}

struct RuntimeState {
    snapshot: PlaybackSnapshot,
    decoder_drops: u64,
    output_drops: u64,
    seeking: bool,
}

impl RuntimeState {
    fn new() -> Self {
        Self {
            snapshot: PlaybackSnapshot::default(),
            decoder_drops: 0,
            output_drops: 0,
            seeking: false,
        }
    }
}

#[derive(Debug, PartialEq)]
enum PropertyUpdate {
    Ordinary,
    Immediate(&'static str),
    TracksChanged,
}

#[allow(clippy::too_many_arguments)]
fn run_event_loop(
    app: &AppHandle,
    mpv: &mut Mpv,
    jellyfin_tracks: &[MediaTrack],
    start_position_ticks: u64,
    video_loaded: Arc<AtomicBool>,
    finished: Arc<AtomicBool>,
) {
    let mut state = RuntimeState::new();
    let mut sent_end = false;
    let mut pending_state = false;
    let mut last_state_event = Instant::now();
    while !finished.load(Ordering::Acquire) {
        match mpv.wait_event(0.2) {
            Some(Ok(Event::FileLoaded)) => {
                if start_position_ticks > 0 {
                    let seconds = (start_position_ticks as f64 / 10_000_000.0).to_string();
                    let _ = mpv.command("seek", &[&seconds, "absolute+exact"]);
                    state.snapshot.position_seconds = start_position_ticks as f64 / 10_000_000.0;
                }
                load_external_subtitles(mpv, jellyfin_tracks);
                state.snapshot.tracks = read_tracks(mpv, jellyfin_tracks);
                refresh_selected_streams(&mut state.snapshot);
                video_loaded.store(true, Ordering::Release);
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Loaded {
                        snapshot: state.snapshot.clone(),
                    },
                );
                pending_state = false;
                last_state_event = Instant::now();
            }
            Some(Ok(Event::PropertyChange { name, change, .. })) => {
                match apply_property(&mut state, name, change) {
                    Some(PropertyUpdate::Ordinary) => pending_state = true,
                    Some(PropertyUpdate::Immediate(cause)) => {
                        emit_state(app, &state.snapshot, Some(cause));
                        pending_state = false;
                        last_state_event = Instant::now();
                    }
                    Some(PropertyUpdate::TracksChanged) => {
                        let _ = app.emit(
                            "fluster://player-event",
                            PlayerEvent::TracksChanged {
                                snapshot: state.snapshot.clone(),
                            },
                        );
                        pending_state = false;
                    }
                    None => {}
                }
            }
            Some(Ok(Event::AudioReconfig | Event::VideoReconfig)) => {
                let tracks = read_tracks(mpv, jellyfin_tracks);
                if !tracks.is_empty() && tracks != state.snapshot.tracks {
                    state.snapshot.tracks = tracks;
                    refresh_selected_streams(&mut state.snapshot);
                    let _ = app.emit(
                        "fluster://player-event",
                        PlayerEvent::TracksChanged {
                            snapshot: state.snapshot.clone(),
                        },
                    );
                    pending_state = false;
                }
            }
            Some(Ok(Event::EndFile(reason))) => {
                native_trace("libmpv emitted EndFile");
                let failed =
                    reason == mpv_end_file_reason::Error || reason == mpv_end_file_reason::Redirect;
                let reason = if reason == mpv_end_file_reason::Eof {
                    "eof"
                } else if reason == mpv_end_file_reason::Stop {
                    "stopped"
                } else if reason == mpv_end_file_reason::Quit {
                    "quit"
                } else {
                    "error"
                };
                if failed {
                    let _ = app.emit(
                        "fluster://player-event",
                        PlayerEvent::Error {
                            message: "libmpv could not play the original file. Server conversion remains disabled."
                                .into(),
                        },
                    );
                }
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Ended {
                        snapshot: state.snapshot.clone(),
                        reason: reason.into(),
                    },
                );
                sent_end = true;
                break;
            }
            Some(Ok(Event::Shutdown)) => break,
            Some(Err(error)) => {
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Error {
                        message: format!("libmpv reported a playback error: {}", safe_error(error)),
                    },
                );
                break;
            }
            _ => {}
        }
        if pending_state && last_state_event.elapsed() >= STATE_EVENT_INTERVAL {
            emit_state(app, &state.snapshot, None);
            pending_state = false;
            last_state_event = Instant::now();
        }
    }
    if !sent_end && !finished.load(Ordering::Acquire) {
        let _ = app.emit(
            "fluster://player-event",
            PlayerEvent::Ended {
                snapshot: state.snapshot,
                reason: "error".into(),
            },
        );
    }
}

fn emit_state(app: &AppHandle, snapshot: &PlaybackSnapshot, cause: Option<&'static str>) {
    let _ = app.emit(
        "fluster://player-event",
        PlayerEvent::State {
            snapshot: snapshot.clone(),
            cause,
        },
    );
}

fn load_external_subtitles(mpv: &Mpv, jellyfin_tracks: &[MediaTrack]) {
    for track in jellyfin_tracks
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
    {
        let Some(url) = track.delivery_url.as_deref() else {
            continue;
        };
        let language = track.language.as_deref().unwrap_or("und");
        let _ = mpv.command(
            "sub-add",
            &[url, "auto", track.display_title.as_str(), language],
        );
    }
}

fn read_tracks(mpv: &Mpv, jellyfin_tracks: &[MediaTrack]) -> Vec<PlayerTrack> {
    let count = mpv
        .get_property::<i64>("track-list/count")
        .unwrap_or(0)
        .max(0);
    (0..count)
        .filter_map(|position| {
            let prefix = format!("track-list/{position}");
            let kind = string_property(mpv, &format!("{prefix}/type"))?;
            let kind = match kind.as_str() {
                "audio" => "Audio",
                "sub" => "Subtitle",
                "video" => "Video",
                _ => return None,
            }
            .to_string();
            let player_id = mpv.get_property::<i64>(&format!("{prefix}/id")).ok()?;
            let ff_index = mpv.get_property::<i64>(&format!("{prefix}/ff-index")).ok();
            let jellyfin = ff_index.and_then(|index| {
                jellyfin_tracks
                    .iter()
                    .find(|track| track.index == index && track.kind == kind)
            });
            Some(PlayerTrack {
                player_id,
                jellyfin_index: jellyfin.map(|track| track.index),
                kind,
                title: string_property(mpv, &format!("{prefix}/title"))
                    .or_else(|| jellyfin.map(|track| track.display_title.clone()))
                    .unwrap_or_else(|| format!("Track {player_id}")),
                language: string_property(mpv, &format!("{prefix}/lang"))
                    .or_else(|| jellyfin.and_then(|track| track.language.clone())),
                external: mpv
                    .get_property::<bool>(&format!("{prefix}/external"))
                    .unwrap_or(false),
                selected: mpv
                    .get_property::<bool>(&format!("{prefix}/selected"))
                    .unwrap_or(false),
            })
        })
        .collect()
}

fn string_property(mpv: &Mpv, property: &str) -> Option<String> {
    mpv.get_property::<MpvStr<'_>>(property)
        .ok()
        .map(|value| value.to_string())
}

fn apply_property(
    state: &mut RuntimeState,
    name: &str,
    data: PropertyData<'_>,
) -> Option<PropertyUpdate> {
    match (name, data) {
        ("time-pos", PropertyData::Double(value)) => {
            if state.snapshot.position_seconds == value {
                return None;
            }
            state.snapshot.position_seconds = value;
        }
        ("duration", PropertyData::Double(value)) => {
            if state.snapshot.duration_seconds == Some(value) {
                return None;
            }
            state.snapshot.duration_seconds = Some(value);
        }
        ("pause", PropertyData::Flag(value)) => {
            if state.snapshot.paused == value {
                return None;
            }
            state.snapshot.paused = value;
            return Some(PropertyUpdate::Immediate("pause"));
        }
        ("paused-for-cache", PropertyData::Flag(value)) => {
            if state.snapshot.buffering == value {
                return None;
            }
            state.snapshot.buffering = value;
            return Some(PropertyUpdate::Immediate("property"));
        }
        ("volume", PropertyData::Double(value)) => {
            if state.snapshot.volume == value {
                return None;
            }
            state.snapshot.volume = value;
        }
        ("mute", PropertyData::Flag(value)) => {
            if state.snapshot.muted == value {
                return None;
            }
            state.snapshot.muted = value;
        }
        ("aid", PropertyData::Str(value)) => {
            let changed = update_selected_track(&mut state.snapshot, "Audio", value.parse().ok());
            return changed.then_some(PropertyUpdate::TracksChanged);
        }
        ("sid", PropertyData::Str(value)) => {
            let changed =
                update_selected_track(&mut state.snapshot, "Subtitle", value.parse().ok());
            return changed.then_some(PropertyUpdate::TracksChanged);
        }
        ("seeking", PropertyData::Flag(value)) => {
            let completed = state.seeking && !value;
            state.seeking = value;
            if completed {
                return Some(PropertyUpdate::Immediate("seek"));
            }
            return None;
        }
        ("hwdec-current", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hwdec_current.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hwdec_current = Some(value.into());
            update_decode_label(&mut state.snapshot);
        }
        ("hwdec-interop", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hwdec_interop.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hwdec_interop = Some(value.into())
        }
        ("video-params/hw-pixelformat", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hw_pixel_format.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hw_pixel_format = Some(value.into())
        }
        ("current-vo", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.video_output.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.video_output = Some(value.into())
        }
        ("current-gpu-context", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.gpu_context.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.gpu_context = Some(value.into())
        }
        ("video-codec", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.video_codec.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.video_codec = Some(value.into())
        }
        ("video-params/bit-depth", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.bit_depth == value {
                return None;
            }
            state.snapshot.diagnostics.bit_depth = value;
        }
        ("width", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.width == value {
                return None;
            }
            state.snapshot.diagnostics.width = value;
        }
        ("height", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.height == value {
                return None;
            }
            state.snapshot.diagnostics.height = value;
        }
        ("decoder-frame-drop-count", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).unwrap_or(0);
            if state.decoder_drops == value {
                return None;
            }
            state.decoder_drops = value;
        }
        ("vo-drop-frame-count", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).unwrap_or(0);
            if state.output_drops == value {
                return None;
            }
            state.output_drops = value;
        }
        _ => return None,
    }
    state.snapshot.diagnostics.dropped_frames = state.decoder_drops + state.output_drops;
    Some(PropertyUpdate::Ordinary)
}

fn update_selected_track(
    snapshot: &mut PlaybackSnapshot,
    kind: &str,
    player_id: Option<i64>,
) -> bool {
    let previous_player_id = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == kind && track.selected)
        .map(|track| track.player_id);
    for track in snapshot
        .tracks
        .iter_mut()
        .filter(|track| track.kind == kind)
    {
        track.selected = Some(track.player_id) == player_id;
    }
    let jellyfin_index = player_id.and_then(|id| {
        snapshot
            .tracks
            .iter()
            .find(|track| track.kind == kind && track.player_id == id)
            .and_then(|track| track.jellyfin_index)
    });
    if kind == "Audio" {
        snapshot.audio_track = jellyfin_index;
    } else {
        snapshot.subtitle_track = jellyfin_index;
    }
    let selected_player_id = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == kind && track.selected)
        .map(|track| track.player_id);
    previous_player_id != selected_player_id
}

fn refresh_selected_streams(snapshot: &mut PlaybackSnapshot) {
    let audio = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == "Audio" && track.selected)
        .map(|track| track.player_id);
    let subtitle = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == "Subtitle" && track.selected)
        .map(|track| track.player_id);
    let _ = update_selected_track(snapshot, "Audio", audio);
    let _ = update_selected_track(snapshot, "Subtitle", subtitle);
}

fn update_decode_label(snapshot: &mut PlaybackSnapshot) {
    let current = snapshot
        .diagnostics
        .hwdec_current
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    if current.is_empty() || current == "no" {
        snapshot.diagnostics.decode_mode = DecodeMode::Software;
        snapshot.diagnostics.decode_label = "Software — CPU".into();
        snapshot.diagnostics.warning = Some(
            "Hardware decoding is not active. libmpv is decoding locally on the CPU; server transcoding remains disabled."
                .into(),
        );
        return;
    }
    snapshot.diagnostics.decode_mode = DecodeMode::Hardware;
    snapshot.diagnostics.warning = None;
    let backend = if current.contains("nvdec") || current.contains("cuda") {
        "NVDEC"
    } else if current.contains("vaapi") {
        "VA-API"
    } else if current.contains("vulkan") {
        "Vulkan"
    } else if current.contains("videotoolbox") {
        "VideoToolbox"
    } else {
        current.as_str()
    };
    snapshot.diagnostics.decode_label = format!("Hardware — {backend}");
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn launch_request(stream_url: &str, subtitle_url: Option<&str>) -> LaunchRequest {
        let tracks = subtitle_url
            .map(|delivery_url| MediaTrack {
                index: 4,
                kind: "Subtitle".into(),
                display_title: "English".into(),
                language: Some("eng".into()),
                external: true,
                delivery_url: Some(delivery_url.into()),
            })
            .into_iter()
            .collect();
        LaunchRequest {
            plan: crate::model::PlaybackPlan {
                item_id: "item".into(),
                title: "Test video".into(),
                stream_url: stream_url.into(),
                media_source_id: "source".into(),
                play_session_id: "session".into(),
                start_position_ticks: 0,
                tracks,
            },
            test_force_software: false,
        }
    }

    fn player_track(id: i64, jellyfin_index: i64, selected: bool) -> PlayerTrack {
        PlayerTrack {
            player_id: id,
            jellyfin_index: Some(jellyfin_index),
            kind: "Audio".into(),
            title: format!("Audio {id}"),
            language: Some("eng".into()),
            external: false,
            selected,
        }
    }

    #[test]
    fn runtime_properties_are_authoritative_for_decode_mode() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "hwdec-current", PropertyData::Str("nvdec")),
            Some(PropertyUpdate::Ordinary)
        );
        assert!(matches!(
            state.snapshot.diagnostics.decode_mode,
            DecodeMode::Hardware
        ));
        assert_eq!(state.snapshot.diagnostics.decode_label, "Hardware — NVDEC");
        apply_property(&mut state, "hwdec-current", PropertyData::Str("no"));
        assert!(matches!(
            state.snapshot.diagnostics.decode_mode,
            DecodeMode::Software
        ));
    }

    #[test]
    fn selected_player_track_reports_jellyfin_stream_index() {
        let mut snapshot = PlaybackSnapshot::default();
        snapshot.tracks.push(player_track(2, 7, false));
        assert!(update_selected_track(&mut snapshot, "Audio", Some(2)));
        assert_eq!(snapshot.audio_track, Some(7));
        assert!(snapshot.tracks[0].selected);
        assert!(!update_selected_track(&mut snapshot, "Audio", Some(2)));
    }

    #[test]
    fn parses_and_gates_runtime_mpv_versions() {
        assert_eq!(parse_mpv_version("0.41.0"), Some((0, 41, 0)));
        assert_eq!(parse_mpv_version("mpv 0.42.1-12-gabcdef"), Some((0, 42, 1)));
        assert!(is_supported_mpv_version("0.41.0"));
        assert!(is_supported_mpv_version("mpv 1.0.0"));
        assert!(!is_supported_mpv_version("0.40.0"));
        assert!(!is_supported_mpv_version("unknown"));
    }

    #[test]
    fn media_urls_allow_https_and_exact_loopback_http() {
        for stream_url in [
            "https://media.example/video.mkv?api_key=secret",
            "http://localhost:8096/video.mkv",
            "http://127.0.0.1:8096/video.mkv",
        ] {
            assert!(validate_playback_urls(&launch_request(stream_url, None)).is_ok());
        }
    }

    #[test]
    fn media_urls_reject_plaintext_remote_hosts_and_embedded_credentials() {
        for stream_url in [
            "http://media.example/video.mkv?api_key=secret",
            "http://localhost.example/video.mkv",
            "http://127.12.34.56:8096/video.mkv",
            "http://[::1]:8096/video.mkv",
            "https://user:password@media.example/video.mkv",
            "https://media.example/video.mkv#fragment",
            "file:///tmp/video.mkv",
        ] {
            let error = validate_playback_urls(&launch_request(stream_url, None))
                .expect_err("unsafe stream must be rejected");
            assert!(matches!(error, MpvError::UnsafeStreamUrl));
            assert!(!error.to_string().contains("secret"));
            assert!(!error.to_string().contains("password"));
        }
    }

    #[test]
    fn external_subtitles_must_share_the_stream_origin() {
        let same_origin = launch_request(
            "https://media.example/video.mkv?api_key=stream-secret",
            Some("https://media.example/subtitle.ass?api_key=subtitle-secret"),
        );
        assert!(validate_playback_urls(&same_origin).is_ok());

        let cross_origin = launch_request(
            "https://media.example/video.mkv?api_key=stream-secret",
            Some("https://cdn.example/subtitle.ass?api_key=subtitle-secret"),
        );
        let error = validate_playback_urls(&cross_origin)
            .expect_err("cross-origin subtitle must be rejected");
        assert!(matches!(error, MpvError::UnsafeSubtitleUrl));
        assert!(!error.to_string().contains("stream-secret"));
        assert!(!error.to_string().contains("subtitle-secret"));
    }

    #[test]
    fn property_updates_separate_immediate_events_from_coalesced_state() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "time-pos", PropertyData::Double(1.5)),
            Some(PropertyUpdate::Ordinary)
        );
        assert_eq!(
            apply_property(&mut state, "pause", PropertyData::Flag(true)),
            Some(PropertyUpdate::Immediate("pause"))
        );
        assert_eq!(
            apply_property(&mut state, "paused-for-cache", PropertyData::Flag(true)),
            Some(PropertyUpdate::Immediate("property"))
        );

        assert_eq!(
            apply_property(&mut state, "seeking", PropertyData::Flag(true)),
            None
        );
        assert_eq!(
            apply_property(&mut state, "seeking", PropertyData::Flag(false)),
            Some(PropertyUpdate::Immediate("seek"))
        );
    }

    #[test]
    fn track_events_are_emitted_only_when_the_selection_changes() {
        let mut state = RuntimeState::new();
        state.snapshot.tracks = vec![player_track(1, 4, true), player_track(2, 7, false)];
        state.snapshot.audio_track = Some(4);

        assert_eq!(
            apply_property(&mut state, "aid", PropertyData::Str("1")),
            None
        );
        assert_eq!(
            apply_property(&mut state, "aid", PropertyData::Str("2")),
            Some(PropertyUpdate::TracksChanged)
        );
        assert_eq!(state.snapshot.audio_track, Some(7));
    }

    #[test]
    fn stop_is_idempotent_without_an_active_session() {
        assert!(MpvController::default().stop().is_ok());
    }
}

#[cfg(test)]
mod redaction_canary {
    use super::tests::launch_request;
    use super::*;

    const CANARY: &str = "CANARY-7f3a9c1e5b";

    /// Every place the code knows a credential can sit inside a URL.
    fn canary_urls() -> Vec<String> {
        let mut urls = vec![
            format!("https://user:{CANARY}@media.example/video.mkv"),
            format!("https://{CANARY}@media.example/video.mkv"),
        ];
        for key in ["api_key", "ApiKey", "access_token", "token", "X-Emby-Token"] {
            urls.push(format!(
                "https://media.example/Videos/1/stream?{key}={CANARY}"
            ));
            urls.push(format!(
                "https://media.example/Videos/1/stream?Static=true&{key}={CANARY}&PlaySessionId=s"
            ));
            urls.push(format!("http://127.0.0.1:8096/video.mkv?{key}={CANARY}"));
        }
        urls
    }

    /// Texts libmpv or the platform might produce around a URL.
    fn error_texts(url: &str) -> Vec<String> {
        vec![
            url.to_string(),
            format!("loadfile failed for {url}"),
            format!("Failed to open {url}: HTTP error 403"),
            format!("Failed to open {url}."),
            format!("failed to open ({url})"),
            // Variants without a scheme: only the credential markers can catch these.
            // (Userinfo without a scheme is not a form libmpv reports.)
            if url.contains('?') {
                url.replacen("https://", "", 1).replacen("http://", "", 1)
            } else {
                "unrelated failure".to_string()
            },
            format!("GET /Videos/1/stream?PlaySessionId={CANARY}&Static=true failed"),
        ]
    }

    fn assert_clean(label: &str, text: &str) {
        assert!(
            !text.contains(CANARY),
            "canary leaked through {label}: {text}"
        );
    }

    fn assert_error_clean(label: &str, error: &MpvError) {
        assert_clean(&format!("{label} to_string"), &error.to_string());
        assert_clean(&format!("{label} Debug"), &format!("{error:?}"));
    }

    #[test]
    fn redaction_canary_stays_out_of_url_carrying_error_variants() {
        for url in canary_urls() {
            for text in error_texts(&url) {
                assert_error_clean("Initialize", &MpvError::Initialize(safe_error(&text)));
                assert_error_clean("Command", &MpvError::Command(safe_error(&text)));
            }
        }
    }

    #[test]
    fn redaction_canary_stays_out_of_credential_header_errors() {
        for text in [
            format!("request failed, X-Emby-Token: {CANARY}"),
            format!("Authorization: MediaBrowser Client=\"Fluster\", Token=\"{CANARY}\""),
            format!("Authorization: Bearer {CANARY}"),
            format!("bad query ?ApiKey={CANARY}&x=1"),
            format!("bad query ?access_token={CANARY}"),
            format!("X-MediaBrowser-Token: {CANARY}"),
            format!("token: \"{CANARY}\""),
            format!("api-key={CANARY}"),
            format!("password {CANARY}"),
            format!("{{\"AccessToken\":\"{CANARY}\"}}"),
            format!("PlaySessionId {CANARY}"),
        ] {
            assert_error_clean("Command", &MpvError::Command(safe_error(&text)));
        }
    }

    #[test]
    fn redaction_canary_stays_out_of_validation_failures() {
        for url in canary_urls() {
            for request in [
                launch_request(&url, None),
                launch_request("https://media.example/video.mkv", Some(&url)),
            ] {
                if let Err(error) = validate_playback_urls(&request) {
                    assert_error_clean("validate_playback_urls", &error);
                }
            }
        }
        // The rejected-URL variants must exist for at least the userinfo cases.
        let error = validate_playback_urls(&launch_request(&canary_urls()[0], None)).unwrap_err();
        assert!(matches!(error, MpvError::UnsafeStreamUrl));
    }

    #[test]
    fn redaction_canary_stays_out_of_redact_url() {
        for url in canary_urls() {
            assert_clean("redact_url", &crate::redaction::redact_url(&url));
        }
        assert_clean(
            "redact_url (unparseable)",
            &crate::redaction::redact_url(&format!("not a url?api_key={CANARY}")),
        );
    }

    #[test]
    fn redaction_canary_stays_out_of_serialized_snapshots_and_events() {
        // Snapshots are built from libmpv properties and fixed text, never from
        // plan URLs. Serialize one produced by the production decode-label
        // builder and assert the canary (a plan field) is absent.
        let request = launch_request(&canary_urls()[2], None);
        let mut snapshot = PlaybackSnapshot::default();
        snapshot.diagnostics.hwdec_current = Some("no".into());
        update_decode_label(&mut snapshot);
        let events = [
            PlayerEvent::Loaded {
                snapshot: snapshot.clone(),
            },
            PlayerEvent::Ended {
                snapshot: snapshot.clone(),
                reason: "error".into(),
            },
        ];
        for event in events {
            assert_clean(
                "serialized PlayerEvent",
                &serde_json::to_string(&event).expect("event serializes"),
            );
        }
        assert_clean(
            "serialized PlaybackSnapshot",
            &serde_json::to_string(&snapshot).expect("snapshot serializes"),
        );
        assert!(request.plan.stream_url.contains(CANARY));
    }

    #[test]
    fn redaction_canary_keeps_play_session_ids_out_of_native_traces() {
        // Trace output is eprintln!/native_trace text; none of it may name a
        // session, so a play-session ID can never be logged.
        for (name, source) in [
            ("mpv.rs", include_str!("mpv.rs")),
            ("surface/linux.rs", include_str!("surface/linux.rs")),
            ("surface/macos.rs", include_str!("surface/macos.rs")),
        ] {
            let production = source.split("#[cfg(test)]").next().unwrap_or(source);
            for line in production.lines().filter(|line| {
                let line = line.trim_start();
                line.starts_with("eprintln!") || line.starts_with("native_trace(")
            }) {
                let lowered = line.to_ascii_lowercase();
                assert!(
                    !lowered.contains("session") && !line.contains("{id}"),
                    "{name} traces a session identifier: {line}"
                );
            }
        }
    }
}
