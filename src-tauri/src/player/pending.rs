//! The launch between its checks and its session: one pending launch at a
//! time, cancellable by `stop`, and a converted launch's network checks run
//! on their own thread so a cancel or the deadline returns at once.

use super::media::LaunchMedia;
use super::MpvError;
use crate::model::{Delivery, LaunchRequest};
use crate::redaction::safe_error;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// The longest a converted launch may spend fetching and checking its
/// playlists and subtitles (each request has its own shorter timeout).
pub(super) const PREPARE_DEADLINE: Duration = Duration::from_secs(60);
const POLL: Duration = Duration::from_millis(25);

/// The cancel flag of the launch that has not become a session yet.
#[derive(Default)]
pub(super) struct PendingSlot(Mutex<Option<Arc<AtomicBool>>>);

impl PendingSlot {
    /// Claims the slot, or refuses when another launch is pending. Callers
    /// hold the session lock and have checked that no session exists.
    pub(super) fn begin(&self) -> Result<PendingLaunch<'_>, MpvError> {
        let mut slot = self.0.lock().expect("pending launch mutex poisoned");
        if slot.is_some() {
            return Err(MpvError::AlreadyPlaying);
        }
        let cancel = Arc::new(AtomicBool::new(false));
        *slot = Some(cancel.clone());
        Ok(PendingLaunch { slot: self, cancel })
    }

    /// Cancels the pending launch, if any. True when there was one.
    pub(super) fn cancel(&self) -> bool {
        let slot = self.0.lock().expect("pending launch mutex poisoned");
        if let Some(cancel) = slot.as_ref() {
            cancel.store(true, Ordering::Release);
            return true;
        }
        false
    }
}

/// Clears its slot on every exit from `launch`.
pub(super) struct PendingLaunch<'a> {
    slot: &'a PendingSlot,
    cancel: Arc<AtomicBool>,
}

impl PendingLaunch<'_> {
    pub(super) fn check(&self) -> Result<(), MpvError> {
        if self.cancel.load(Ordering::Acquire) {
            return Err(MpvError::Cancelled);
        }
        Ok(())
    }

    /// Prepares the launch's media. A static launch has no network checks;
    /// a converted one runs them on their own thread and this returns as
    /// soon as they finish, the launch is cancelled, or `deadline` passes.
    /// An abandoned check stops before its next request, and its session
    /// (with its loopback server) is dropped unused.
    pub(super) fn prepare(
        &self,
        request: &LaunchRequest,
        deadline: Duration,
    ) -> Result<LaunchMedia, MpvError> {
        if request.plan.delivery == Delivery::Static {
            return LaunchMedia::prepare_until(request, &|| false);
        }
        let (sender, receiver) = mpsc::channel();
        let owned = request.clone();
        let cancel = self.cancel.clone();
        thread::Builder::new()
            .name("fluster-hls-check".into())
            .spawn(move || {
                let stopped = || cancel.load(Ordering::Acquire);
                let _ = sender.send(LaunchMedia::prepare_until(&owned, &stopped));
            })
            .map_err(|error| MpvError::Initialize(safe_error(error)))?;
        self.wait(&receiver, deadline)
    }

    fn wait(
        &self,
        receiver: &Receiver<Result<LaunchMedia, MpvError>>,
        deadline: Duration,
    ) -> Result<LaunchMedia, MpvError> {
        let deadline = Instant::now() + deadline;
        loop {
            self.check()?;
            match receiver.recv_timeout(POLL) {
                Ok(result) => {
                    self.check()?;
                    return result;
                }
                Err(RecvTimeoutError::Timeout) if Instant::now() >= deadline => {
                    self.cancel.store(true, Ordering::Release);
                    return Err(MpvError::LaunchTimedOut);
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(MpvError::Initialize(
                        "the converted stream check stopped unexpectedly".into(),
                    ))
                }
            }
        }
    }
}

impl Drop for PendingLaunch<'_> {
    fn drop(&mut self) {
        let mut slot = self.slot.0.lock().expect("pending launch mutex poisoned");
        if slot
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, &self.cancel))
        {
            slot.take();
        }
    }
}

#[cfg(test)]
#[path = "pending_tests.rs"]
mod tests;
