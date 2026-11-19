//! Bounds a window close, so Fluster always exits once the user closes it.
//!
//! While a session plays, the frontend holds the close (`src/app/window-close.ts`)
//! to stop the player and send the Stopped report, then destroys the window
//! (`core:window:allow-destroy`, owner decision 2026-11-19). Destroying the
//! last window ends the event loop and the process, and this guard's thread
//! with it, so a close that succeeds never reaches the deadline.
//! If the app is still running `CLOSE_DEADLINE` after the first close request
//! (a stop that failed, a report that hung, a destroy the frontend could not
//! make), Rust marks the session finished and asks the app to exit. If the
//! event loop cannot exit either, the process ends after `EXIT_GRACE`.

use crate::player::MpvController;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tauri::AppHandle;

/// Longer than the frontend's own bounded close: the native stop (5 s) and
/// the report drain (progress 5 s, Stopped 5 s, encoding stop 3 s, in
/// `src/lib/player/playstate-reporter.ts`), with margin.
pub(crate) const CLOSE_DEADLINE: Duration = Duration::from_secs(25);
const EXIT_GRACE: Duration = Duration::from_secs(3);

/// Arms one deadline per run; later close requests reuse it.
#[derive(Clone, Default)]
pub(crate) struct CloseGuard {
    armed: Arc<AtomicBool>,
}

impl CloseGuard {
    pub(crate) fn arm(&self, app: AppHandle, controller: MpvController) {
        if self.armed.swap(true, Ordering::AcqRel) {
            return;
        }
        let spawned = thread::Builder::new()
            .name("fluster-close-guard".into())
            .spawn(move || {
                exit_after(
                    CLOSE_DEADLINE,
                    EXIT_GRACE,
                    // On its own thread: the exit must not wait on a stuck lock.
                    move || {
                        let _ = thread::Builder::new()
                            .name("fluster-close-finish".into())
                            .spawn(move || controller.force_finish());
                    },
                    || app.exit(FORCED_EXIT_STATUS),
                    hard_exit,
                );
            });
        if spawned.is_err() {
            crate::trace::native_trace("could not start the close deadline");
        }
    }
}

/// After `deadline`: ends playback, requests a normal exit, and if the
/// process is still alive after `grace`, ends it.
fn exit_after(
    deadline: Duration,
    grace: Duration,
    end_playback: impl FnOnce(),
    request_exit: impl FnOnce(),
    end_process: impl FnOnce(),
) {
    thread::sleep(deadline);
    crate::trace::native_trace("window close deadline passed; exiting");
    end_playback();
    request_exit();
    thread::sleep(grace);
    end_process();
}

/// EX_SOFTWARE from sysexits.h: a forced exit shows as a failure in logs.
const FORCED_EXIT_STATUS: i32 = 70;

fn hard_exit() {
    // SAFETY: `_exit` takes no pointers and only ends the process; it is
    // async-signal-safe and sound to call from any thread. It skips atexit
    // handlers on purpose, since a stuck one is what this path escapes.
    unsafe { libc::_exit(FORCED_EXIT_STATUS) }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn the_deadline_ends_playback_then_exits_then_ends_the_process() {
        let steps = RefCell::new(Vec::new());
        exit_after(
            Duration::from_millis(1),
            Duration::from_millis(1),
            || steps.borrow_mut().push("end playback"),
            || steps.borrow_mut().push("request exit"),
            || steps.borrow_mut().push("end process"),
        );
        assert_eq!(
            steps.into_inner(),
            ["end playback", "request exit", "end process"]
        );
    }

    #[test]
    fn the_deadline_outlasts_the_frontend_close() {
        // Native stop 5 s + progress drain 5 s + Stopped 5 s + encoding stop 3 s.
        assert!(CLOSE_DEADLINE > Duration::from_secs(18));
    }

    #[test]
    fn a_forced_exit_is_not_a_success() {
        assert_eq!(FORCED_EXIT_STATUS, 70);
    }

    /// The frontend destroys the window after a held close; without this
    /// permission every close during playback waits for the deadline. The
    /// list is exact so any other widening is a deliberate change here too.
    #[test]
    fn the_window_may_be_destroyed_and_nothing_else_is_granted() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json"))
                .expect("capability JSON");
        assert_eq!(
            capability["permissions"],
            serde_json::json!(["core:default", "core:window:allow-destroy"])
        );
        assert_eq!(capability["windows"], serde_json::json!(["main"]));
    }

    #[test]
    fn a_guard_arms_once() {
        let guard = CloseGuard::default();
        assert!(!guard.armed.swap(true, Ordering::AcqRel));
        let copy = guard.clone();
        assert!(copy.armed.load(Ordering::Acquire));
    }
}
