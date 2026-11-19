//! Ending a session: `stop`, its fallbacks, and the event loop's finalization.
//!
//! Nothing here may panic or wait on libmpv without a bound. A stop that
//! panicked before it reached the event loop once left an episode playing
//! with the window unable to close. So `stop` marks the session finished
//! before anything else, locks recover from poisoning (`crate::lock`), and a
//! session that has not ended by the deadline is paused and muted.

use super::{MpvController, MpvError};
use crate::lock::{lock, wait_timeout};
use crate::media_controls::MediaUpdate;
use crate::player::native_trace;
use crate::surface;
use std::sync::atomic::Ordering;
use std::sync::TryLockError;
use std::thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;

/// How long a stop waits for the event loop to end the session.
pub(super) const STOP_TIMEOUT: Duration = Duration::from_secs(5);

impl MpvController {
    pub(crate) fn stop(&self) -> Result<(), MpvError> {
        // Mark first: whatever fails after this, the event loop still ends
        // the session. Do not issue a synchronous mpv "stop" command while
        // the event client is unwinding; libmpv can make those two shutdown
        // paths wait on each other. The event loop owns shutdown: it releases
        // the event client, detaches the renderer, and drops the root handle.
        let Some(session_id) = self.mark_finished() else {
            return Ok(());
        };
        native_trace("stop requested");
        let result = self.wait_for_session_end(&session_id, STOP_TIMEOUT);
        if result.is_err() {
            self.silence(&session_id);
        }
        result
    }

    /// The stop for when `stop` itself did not return (its task panicked).
    /// Marks the session finished, and pauses and mutes it if it has not
    /// ended by the stop deadline. Returns at once; never panics.
    pub(crate) fn force_finish(&self) {
        let Some(session_id) = self.mark_finished() else {
            return;
        };
        let controller = self.clone();
        let spawned = thread::Builder::new()
            .name("fluster-mpv-finish".into())
            .spawn(move || {
                if controller
                    .wait_for_session_end(&session_id, STOP_TIMEOUT)
                    .is_err()
                {
                    controller.silence(&session_id);
                }
            });
        if spawned.is_err() {
            native_trace("could not start the forced finish thread");
        }
    }

    /// Tells the event loop of the active session to end it; with no
    /// session, cancels a pending launch (`stop` does not wait for it).
    /// Returns the id of the session it marked.
    pub(super) fn mark_finished(&self) -> Option<String> {
        let session = lock(&self.inner.session);
        match session.as_ref() {
            Some(session) => {
                session.finished.store(true, Ordering::Release);
                Some(session.id.clone())
            }
            None => {
                self.inner.pending.cancel();
                None
            }
        }
    }

    /// Pauses and mutes the session `id` if it is still active, so a stop
    /// that timed out does not leave it playing. Runs on its own thread and
    /// skips the session if another thread holds its handle, so the caller
    /// never waits on libmpv. True when both properties were set.
    pub(super) fn silence_now(&self, id: &str) -> bool {
        let mpv = {
            let session = lock(&self.inner.session);
            match session.as_ref() {
                Some(session) if session.id == id => session.mpv.clone(),
                _ => return false,
            }
        };
        let mpv = match mpv.try_lock() {
            Ok(guard) => guard,
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner(),
            Err(TryLockError::WouldBlock) => {
                native_trace("player handle busy; could not pause playback after a stop");
                return false;
            }
        };
        let paused = mpv.set_property("pause", true).is_ok();
        let muted = mpv.set_property("mute", true).is_ok();
        native_trace("paused and muted playback that did not stop in time");
        paused && muted
    }

    fn silence(&self, id: &str) {
        let controller = self.clone();
        let id = id.to_string();
        let spawned = thread::Builder::new()
            .name("fluster-mpv-silence".into())
            .spawn(move || {
                controller.silence_now(&id);
            });
        if spawned.is_err() {
            native_trace("could not start the silence thread");
        }
    }

    pub(super) fn request_finish(&self, app: &AppHandle, id: &str) {
        surface::detach(app, id);
        let session = lock(&self.inner.session);
        if let Some(session) = session.as_ref().filter(|session| session.id == id) {
            session.finished.store(true, Ordering::Release);
        }
    }

    pub(super) fn finalize_session(&self, app: &AppHandle, id: &str) {
        native_trace("finalizing native surface");
        surface::detach(app, id);
        native_trace("native surface detached");
        self.end_session(id);
        native_trace("playback finalized");
    }

    /// Removes the session `id`, tells the media controls, and wakes every
    /// waiting stop. True when `id` was the active session.
    pub(super) fn end_session(&self, id: &str) -> bool {
        let mut session = lock(&self.inner.session);
        if !session.as_ref().is_some_and(|session| session.id == id) {
            return false;
        }
        session.take();
        self.media().publish(MediaUpdate::Stopped);
        self.inner.session_finished.notify_all();
        true
    }

    pub(super) fn wait_for_session_end(&self, id: &str, timeout: Duration) -> Result<(), MpvError> {
        let deadline = Instant::now() + timeout;
        let mut session = lock(&self.inner.session);
        while session.as_ref().is_some_and(|session| session.id == id) {
            let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
                drop(session);
                native_trace("stop timed out");
                return Err(MpvError::StopTimeout);
            };
            session = wait_timeout(&self.inner.session_finished, session, remaining).0;
        }
        drop(session);
        native_trace("stop acknowledged");
        Ok(())
    }
}
