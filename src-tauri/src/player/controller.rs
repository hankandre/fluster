//! Session lifecycle: launch, typed playback commands, and shutdown.

use super::events::run_event_loop;
use super::media::LaunchMedia;
use super::properties::observe_properties;
use super::version::{ensure_numeric_locale, query_libmpv_version};
use super::{native_trace, MpvError};
use crate::media_controls::{MediaControls, MediaUpdate};
use crate::model::{LaunchRequest, PlayerCapabilities, PlayerEvent, PlayerSurfaceFrame};
use crate::redaction::safe_error;
use crate::surface;
use libmpv2::Mpv;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const STOP_TIMEOUT: Duration = Duration::from_secs(5);

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
    media: Mutex<MediaControls>,
}

impl Default for ControllerInner {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
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
        *self.inner.renderer.lock().expect("renderer mutex poisoned") = result;
        self.inner
            .capabilities
            .lock()
            .expect("capabilities mutex poisoned")
            .take();
    }

    /// Where session state goes for the system media controls.
    pub(crate) fn set_media_controls(&self, media: MediaControls) {
        *self
            .inner
            .media
            .lock()
            .expect("media controls mutex poisoned") = media;
    }

    fn media(&self) -> MediaControls {
        self.inner
            .media
            .lock()
            .expect("media controls mutex poisoned")
            .clone()
    }

    pub(crate) fn capabilities(&self) -> Result<PlayerCapabilities, MpvError> {
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

    pub(crate) fn launch(&self, app: AppHandle, request: LaunchRequest) -> Result<(), MpvError> {
        if request.plan.item_id.is_empty()
            || request.plan.media_source_id.is_empty()
            || request.plan.play_session_id.is_empty()
            || request.plan.title.is_empty()
        {
            return Err(MpvError::InvalidPlan);
        }
        self.capabilities()?;
        {
            let session = self.inner.session.lock().expect("session mutex poisoned");
            if session.is_some() {
                return Err(MpvError::AlreadyPlaying);
            }
        }
        // For HLS this fetches and checks every playlist before any handle
        // exists; the session's loopback server lives as long as `media`.
        let media = Arc::new(LaunchMedia::prepare(&request)?);

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
            .load(&mpv.lock().expect("libmpv mutex poisoned"))
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

    pub(crate) fn stop(&self) -> Result<(), MpvError> {
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
            self.media().publish(MediaUpdate::Stopped);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stop_is_idempotent_without_an_active_session() {
        assert!(MpvController::default().stop().is_ok());
    }
}
