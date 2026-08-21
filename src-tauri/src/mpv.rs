use crate::model::{
    DecodeMode, LaunchRequest, MediaTrack, PlaybackSnapshot, PlayerCapabilities, PlayerEvent,
    PlayerSurfaceFrame, PlayerTrack,
};
use crate::redaction::safe_error;
use crate::surface;
use libmpv2::events::{Event, PropertyData};
use libmpv2::{mpv_end_file_reason, Format, Mpv, MpvStr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};
use thiserror::Error;

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
    #[error("Could not initialize libmpv 0.41 or newer: {0}")]
    Initialize(String),
    #[error("Could not set the numeric locale required by libmpv.")]
    Locale,
    #[error("No playback session is active.")]
    NotPlaying,
    #[error("The player command failed: {0}")]
    Command(String),
}

struct Session {
    id: String,
    mpv: Arc<Mutex<Mpv>>,
    finished: Arc<AtomicBool>,
}

struct ControllerInner {
    session: Mutex<Option<Session>>,
    renderer: Mutex<Result<String, String>>,
}

impl Default for ControllerInner {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            renderer: Mutex::new(Err(String::new())),
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
    }

    pub fn capabilities(&self) -> Result<PlayerCapabilities, MpvError> {
        match self
            .inner
            .renderer
            .lock()
            .expect("renderer mutex poisoned")
            .clone()
        {
            Ok(renderer) => Ok(PlayerCapabilities {
                mode: "native",
                embedded: true,
                renderer,
            }),
            Err(error) if error.is_empty() => Err(MpvError::Renderer(
                "the native renderer has not finished initializing".into(),
            )),
            Err(error) => Err(MpvError::Renderer(error)),
        }
    }

    pub fn launch(&self, app: AppHandle, request: LaunchRequest) -> Result<(), MpvError> {
        self.capabilities()?;
        {
            let session = self.inner.session.lock().expect("session mutex poisoned");
            if session.is_some() {
                return Err(MpvError::AlreadyPlaying);
            }
        }
        if request.plan.item_id.is_empty()
            || request.plan.media_source_id.is_empty()
            || request.plan.play_session_id.is_empty()
            || request.plan.title.is_empty()
        {
            return Err(MpvError::InvalidPlan);
        }

        // GTK initializes its locale after application startup and may replace
        // LC_NUMERIC with the desktop locale. libmpv requires this category to
        // use the C decimal separator at the instant mpv_create is called.
        let locale = unsafe { libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr()) };
        if locale.is_null() {
            return Err(MpvError::Locale);
        }

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
        let session_id = request.plan.play_session_id.clone();

        surface::attach(&app, mpv.clone(), session_id.clone()).map_err(MpvError::Renderer)?;

        let mut event_client = {
            let mpv_guard = mpv.lock().expect("libmpv mutex poisoned");
            mpv_guard
                .create_client(Some("fluster-events"))
                .map_err(|error| MpvError::Initialize(safe_error(error)))?
        };
        observe_properties(&event_client)
            .map_err(|error| MpvError::Initialize(safe_error(error)))?;

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
                run_event_loop(
                    &app_for_events,
                    &mut event_client,
                    &plan.tracks,
                    plan.start_position_ticks,
                    finished,
                );
                drop(event_client);
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
        self.with_mpv(|mpv| mpv.command("stop", &[]))
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
        surface::detach(app, id);
        let mut session = self.inner.session.lock().expect("session mutex poisoned");
        if session.as_ref().is_some_and(|session| session.id == id) {
            session.take();
        }
    }
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
}

impl RuntimeState {
    fn new() -> Self {
        Self {
            snapshot: PlaybackSnapshot::default(),
            decoder_drops: 0,
            output_drops: 0,
        }
    }
}

#[allow(clippy::too_many_arguments)]
fn run_event_loop(
    app: &AppHandle,
    mpv: &mut Mpv,
    jellyfin_tracks: &[MediaTrack],
    start_position_ticks: u64,
    finished: Arc<AtomicBool>,
) {
    let mut state = RuntimeState::new();
    let mut sent_end = false;
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
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Loaded {
                        snapshot: state.snapshot.clone(),
                    },
                );
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::TracksChanged {
                        snapshot: state.snapshot.clone(),
                    },
                );
            }
            Some(Ok(Event::PropertyChange { name, change, .. })) => {
                let cause = apply_property(&mut state, name, change);
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::State {
                        snapshot: state.snapshot.clone(),
                        cause,
                    },
                );
            }
            Some(Ok(Event::AudioReconfig | Event::VideoReconfig)) => {
                let tracks = read_tracks(mpv, jellyfin_tracks);
                if !tracks.is_empty() {
                    state.snapshot.tracks = tracks;
                    refresh_selected_streams(&mut state.snapshot);
                    let _ = app.emit(
                        "fluster://player-event",
                        PlayerEvent::TracksChanged {
                            snapshot: state.snapshot.clone(),
                        },
                    );
                }
            }
            Some(Ok(Event::EndFile(reason))) => {
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
) -> Option<&'static str> {
    match (name, data) {
        ("time-pos", PropertyData::Double(value)) => state.snapshot.position_seconds = value,
        ("duration", PropertyData::Double(value)) => state.snapshot.duration_seconds = Some(value),
        ("pause", PropertyData::Flag(value)) => {
            state.snapshot.paused = value;
            return Some("pause");
        }
        ("paused-for-cache", PropertyData::Flag(value)) => state.snapshot.buffering = value,
        ("volume", PropertyData::Double(value)) => state.snapshot.volume = value,
        ("mute", PropertyData::Flag(value)) => state.snapshot.muted = value,
        ("aid", PropertyData::Str(value)) => {
            update_selected_track(&mut state.snapshot, "Audio", value.parse().ok())
        }
        ("sid", PropertyData::Str(value)) => {
            update_selected_track(&mut state.snapshot, "Subtitle", value.parse().ok())
        }
        ("seeking", PropertyData::Flag(false)) => return Some("seek"),
        ("hwdec-current", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.hwdec_current = Some(value.into());
            update_decode_label(&mut state.snapshot);
        }
        ("hwdec-interop", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.hwdec_interop = Some(value.into())
        }
        ("video-params/hw-pixelformat", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.hw_pixel_format = Some(value.into())
        }
        ("current-vo", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.video_output = Some(value.into())
        }
        ("current-gpu-context", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.gpu_context = Some(value.into())
        }
        ("video-codec", PropertyData::Str(value)) => {
            state.snapshot.diagnostics.video_codec = Some(value.into())
        }
        ("video-params/bit-depth", PropertyData::Int64(value)) => {
            state.snapshot.diagnostics.bit_depth = u64::try_from(value).ok()
        }
        ("width", PropertyData::Int64(value)) => {
            state.snapshot.diagnostics.width = u64::try_from(value).ok()
        }
        ("height", PropertyData::Int64(value)) => {
            state.snapshot.diagnostics.height = u64::try_from(value).ok()
        }
        ("decoder-frame-drop-count", PropertyData::Int64(value)) => {
            state.decoder_drops = u64::try_from(value).unwrap_or(0)
        }
        ("vo-drop-frame-count", PropertyData::Int64(value)) => {
            state.output_drops = u64::try_from(value).unwrap_or(0)
        }
        _ => {}
    }
    state.snapshot.diagnostics.dropped_frames = state.decoder_drops + state.output_drops;
    None
}

fn update_selected_track(snapshot: &mut PlaybackSnapshot, kind: &str, player_id: Option<i64>) {
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
    update_selected_track(snapshot, "Audio", audio);
    update_selected_track(snapshot, "Subtitle", subtitle);
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

    #[test]
    fn runtime_properties_are_authoritative_for_decode_mode() {
        let mut state = RuntimeState::new();
        apply_property(&mut state, "hwdec-current", PropertyData::Str("nvdec"));
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
        snapshot.tracks.push(PlayerTrack {
            player_id: 2,
            jellyfin_index: Some(7),
            kind: "Audio".into(),
            title: "English".into(),
            language: Some("eng".into()),
            external: false,
            selected: false,
        });
        update_selected_track(&mut snapshot, "Audio", Some(2));
        assert_eq!(snapshot.audio_track, Some(7));
        assert!(snapshot.tracks[0].selected);
    }
}
