//! Session lifecycle: launch, typed playback commands, and shutdown.

use super::events::run_event_loop;
use super::pending::{PendingSlot, PREPARE_DEADLINE};
use super::properties::observe_properties;
use super::version::{ensure_numeric_locale, query_libmpv_version};
use super::{native_trace, MpvError};
use crate::lock::lock;
use crate::media_controls::MediaControls;
use crate::model::{LaunchRequest, PlayerCapabilities, PlayerEvent, PlayerSurfaceFrame};
use crate::redaction::safe_error;
use crate::surface;
use libmpv2::Mpv;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[path = "controller_stop.rs"]
mod stop;

struct Session {
    id: String,
    mpv: Arc<Mutex<Mpv>>,
    finished: Arc<AtomicBool>,
}

struct ControllerInner {
    session: Mutex<Option<Session>>,
    /// Lock order: `session`, then `pending`.
    pending: PendingSlot,
    session_finished: Condvar,
    renderer: Mutex<Result<String, String>>,
    capabilities: Mutex<Option<PlayerCapabilities>>,
    media: Mutex<MediaControls>,
}

impl Default for ControllerInner {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            pending: PendingSlot::default(),
            session_finished: Condvar::new(),
            renderer: Mutex::new(Err(String::new())),
            capabilities: Mutex::new(None),
            media: Mutex::new(MediaControls::default()),
        }
    }
}

#[derive(Clone, Default)]
pub(crate) struct MpvController {
    inner: Arc<ControllerInner>,
}

impl MpvController {
    pub(crate) fn set_renderer_result(&self, result: Result<String, String>) {
        *lock(&self.inner.renderer) = result;
        lock(&self.inner.capabilities).take();
    }

    /// Where session state goes for the system media controls.
    pub(crate) fn set_media_controls(&self, media: MediaControls) {
        *lock(&self.inner.media) = media;
    }

    fn media(&self) -> MediaControls {
        lock(&self.inner.media).clone()
    }

    pub(crate) fn capabilities(&self) -> Result<PlayerCapabilities, MpvError> {
        if let Some(capabilities) = lock(&self.inner.capabilities).clone() {
            return Ok(capabilities);
        }
        let renderer = match lock(&self.inner.renderer).clone() {
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
        *lock(&self.inner.capabilities) = Some(capabilities.clone());
        Ok(capabilities)
    }

    pub(crate) fn launch(&self, app: AppHandle, request: LaunchRequest) -> Result<(), MpvError> {
        if request.plan.item_id.is_empty()
            || request.plan.media_source_id.is_empty()
            || request.plan.play_session_id.is_empty()
            || request.plan.title.is_empty()
        {
            return Err(MpvError::InvalidPlan);
        }
        self.capabilities()?;
        // One launch at a time: the pending marker refuses a second launch
        // until this one becomes a session or fails, and `stop` cancels it.
        let pending = {
            let session = lock(&self.inner.session);
            if session.is_some() {
                return Err(MpvError::AlreadyPlaying);
            }
            self.inner.pending.begin()?
        };
        // For HLS this fetches and checks every playlist before any handle
        // exists; the session's loopback server lives as long as `media`.
        let media = Arc::new(pending.prepare(&request, PREPARE_DEADLINE)?);

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
            // Only the subtitles Fluster adds may appear as external tracks,
            // so their add order identifies them (see `tracks.rs`).
            init.set_option("autoload-files", false)?;
            media.configure(&init, &request)
        })
        .map_err(|error| MpvError::Initialize(safe_error(error)))?;
        pending.check()?;
        let mpv = Arc::new(Mutex::new(mpv));
        let mut event_client = {
            let mpv_guard = lock(&mpv);
            mpv_guard
                .create_client(Some("fluster-events"))
                .map_err(|error| MpvError::Initialize(safe_error(error)))?
        };
        observe_properties(&event_client)
            .map_err(|error| MpvError::Initialize(safe_error(error)))?;

        let session_id = request.plan.play_session_id.clone();
        let video_loaded = Arc::new(AtomicBool::new(false));
        if let Err(error) =
            surface::attach(&app, mpv.clone(), session_id.clone(), video_loaded.clone())
        {
            // A timed-out attach can still run later on the UI thread; this
            // detach is queued behind it and removes what it installed.
            surface::detach(&app, &session_id);
            return Err(MpvError::Renderer(error));
        }

        let finished = Arc::new(AtomicBool::new(false));
        {
            let mut session = lock(&self.inner.session);
            let refused = if session.is_some() {
                Some(MpvError::AlreadyPlaying)
            } else {
                pending.check().err()
            };
            if let Some(error) = refused {
                drop(session);
                surface::detach(&app, &session_id);
                return Err(error);
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
        let media_controls = self.media();
        let event_media = media.clone();
        thread::Builder::new()
            .name("fluster-mpv-events".into())
            .spawn(move || {
                let event_result = catch_unwind(AssertUnwindSafe(|| {
                    run_event_loop(
                        &app_for_events,
                        &mut event_client,
                        &plan,
                        &event_media,
                        &media_controls,
                        video_loaded,
                        finished,
                    );
                    drop(event_client);
                    // Closes an HLS session's loopback server.
                    drop(event_media);
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

        let result = media
            .load(&lock(&mpv))
            .map_err(|error| MpvError::Command(safe_error(error)));
        if result.is_err() {
            self.request_finish(&app, &session_id);
        }
        result
    }

    pub(crate) fn set_surface(
        &self,
        app: &AppHandle,
        frame: PlayerSurfaceFrame,
    ) -> Result<(), MpvError> {
        let frame = frame
            .validate()
            .map_err(|error| MpvError::Command(error.into()))?;
        surface::set_frame(app, frame).map_err(MpvError::Renderer)
    }

    pub(crate) fn set_paused(&self, paused: bool) -> Result<(), MpvError> {
        self.with_mpv(|mpv| mpv.set_property("pause", paused))
    }

    pub(crate) fn seek(&self, position_seconds: f64) -> Result<(), MpvError> {
        if !position_seconds.is_finite() || position_seconds < 0.0 {
            return Err(MpvError::Command(
                "The seek position must be a non-negative finite number.".into(),
            ));
        }
        let position = position_seconds.to_string();
        self.with_mpv(|mpv| mpv.command("seek", &[&position, "absolute+exact"]))
    }

    pub(crate) fn set_volume(&self, volume: f64) -> Result<(), MpvError> {
        if !volume.is_finite() {
            return Err(MpvError::Command("The volume must be finite.".into()));
        }
        self.with_mpv(|mpv| mpv.set_property("volume", volume.clamp(0.0, 100.0)))
    }

    pub(crate) fn set_muted(&self, muted: bool) -> Result<(), MpvError> {
        self.with_mpv(|mpv| mpv.set_property("mute", muted))
    }

    pub(crate) fn select_track(&self, track_type: &str, id: Option<i64>) -> Result<(), MpvError> {
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

    pub(crate) fn set_fullscreen(&self, app: &AppHandle, fullscreen: bool) -> Result<(), MpvError> {
        let window = app.get_webview_window("main").ok_or_else(|| {
            MpvError::Command("The main application window is unavailable.".into())
        })?;
        window
            .set_fullscreen(fullscreen)
            .map_err(|error| MpvError::Command(safe_error(error)))
    }

    fn with_mpv<F>(&self, operation: F) -> Result<(), MpvError>
    where
        F: FnOnce(&Mpv) -> libmpv2::Result<()>,
    {
        let mpv = {
            let session = lock(&self.inner.session);
            session
                .as_ref()
                .map(|session| session.mpv.clone())
                .ok_or(MpvError::NotPlaying)?
        };
        let result = operation(&lock(&mpv));
        result.map_err(|error| MpvError::Command(safe_error(error)))
    }
}

#[cfg(test)]
#[path = "controller_stop_tests.rs"]
mod stop_tests;
