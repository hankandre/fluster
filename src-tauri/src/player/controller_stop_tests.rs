//! Stop must end or silence the session and never panic, even with poisoned
//! locks. These tests drive the controller without a Tauri app: a helper
//! thread stands in for the event loop and calls `end_session`.

use super::stop::STOP_TIMEOUT;
use super::{MpvController, Session};
use crate::player::MpvError;
use libmpv2::Mpv;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// An mpv core with no output, or None where the loaded libmpv is older than
/// the linked API (CI's Ubuntu 22.04 runner).
fn idle_mpv() -> Option<Arc<Mutex<Mpv>>> {
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        Ok(())
    });
    match created {
        Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
            eprintln!("SKIP controller stop test: loaded libmpv API {loaded:#x} is older than linked {linked:#x}");
            None
        }
        other => Some(Arc::new(Mutex::new(other.expect("libmpv starts")))),
    }
}

fn install(controller: &MpvController, id: &str, mpv: Arc<Mutex<Mpv>>) -> Arc<AtomicBool> {
    let finished = Arc::new(AtomicBool::new(false));
    *controller.inner.session.lock().unwrap() = Some(Session {
        id: id.into(),
        mpv,
        finished: finished.clone(),
    });
    finished
}

fn poison_session_lock(controller: &MpvController) {
    let held = controller.clone();
    let _ = thread::spawn(move || {
        let _guard = held.inner.session.lock().unwrap();
        panic!("poison the session lock on purpose");
    })
    .join();
    assert!(controller.inner.session.is_poisoned());
}

/// Ends session `id` the way the event loop does once `finished` is set.
fn fake_event_loop(
    controller: &MpvController,
    id: &str,
    finished: Arc<AtomicBool>,
) -> thread::JoinHandle<()> {
    let controller = controller.clone();
    let id = id.to_string();
    thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(2);
        while !finished.load(Ordering::Acquire) && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(2));
        }
        if finished.load(Ordering::Acquire) {
            assert!(controller.end_session(&id));
        }
    })
}

#[test]
fn stop_is_idempotent_without_an_active_session() {
    let controller = MpvController::default();
    assert!(controller.stop().is_ok());
    assert!(controller.stop().is_ok());
}

#[test]
fn stop_with_a_poisoned_session_lock_and_no_session_returns_ok() {
    let controller = MpvController::default();
    poison_session_lock(&controller);
    assert!(controller.stop().is_ok());
}

#[test]
fn stop_with_a_poisoned_pending_lock_does_not_panic() {
    let controller = MpvController::default();
    controller.inner.pending.poison();
    assert!(controller.inner.pending.is_poisoned());
    assert!(controller.stop().is_ok());
    controller.force_finish();
}

#[test]
fn stop_tells_the_event_loop_to_end_the_session_and_returns_once_it_has() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    let finished = install(&controller, "a", mpv);
    let event_loop = fake_event_loop(&controller, "a", finished.clone());
    assert!(controller.stop().is_ok());
    assert!(finished.load(Ordering::Acquire));
    assert!(controller.inner.session.lock().unwrap().is_none());
    event_loop.join().expect("event loop stand-in");
}

#[test]
fn stop_with_a_poisoned_session_lock_still_ends_the_session() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    let finished = install(&controller, "a", mpv);
    poison_session_lock(&controller);
    let event_loop = fake_event_loop(&controller, "a", finished.clone());
    assert!(controller.stop().is_ok());
    assert!(finished.load(Ordering::Acquire));
    event_loop.join().expect("event loop stand-in");
}

#[test]
fn a_session_that_does_not_end_in_time_is_paused_and_muted() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    let finished = install(&controller, "a", mpv.clone());
    assert_eq!(controller.mark_finished().as_deref(), Some("a"));
    assert!(finished.load(Ordering::Acquire));
    assert!(matches!(
        controller.wait_for_session_end("a", Duration::from_millis(20)),
        Err(MpvError::StopTimeout)
    ));
    assert!(controller.silence_now("a"));
    let mpv = mpv.lock().unwrap();
    assert!(mpv.get_property::<bool>("pause").expect("pause"));
    assert!(mpv.get_property::<bool>("mute").expect("mute"));
}

#[test]
fn silencing_skips_a_handle_another_thread_holds() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    install(&controller, "a", mpv.clone());
    let _held = mpv.lock().unwrap();
    let started = Instant::now();
    assert!(!controller.silence_now("a"));
    assert!(started.elapsed() < Duration::from_secs(1));
}

#[test]
fn silencing_leaves_another_session_alone() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    install(&controller, "b", mpv);
    assert!(!controller.silence_now("a"));
}

#[test]
fn force_finish_marks_the_session_and_returns_at_once() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    let finished = install(&controller, "a", mpv);
    poison_session_lock(&controller);
    let started = Instant::now();
    controller.force_finish();
    assert!(started.elapsed() < STOP_TIMEOUT);
    assert!(finished.load(Ordering::Acquire));
    assert!(controller.end_session("a"));
}

#[test]
fn ending_a_session_wakes_a_waiting_stop() {
    let Some(mpv) = idle_mpv() else { return };
    let controller = MpvController::default();
    install(&controller, "a", mpv);
    let ender = controller.clone();
    let event_loop = thread::spawn(move || {
        thread::sleep(Duration::from_millis(20));
        ender.end_session("a")
    });
    assert!(controller.wait_for_session_end("a", STOP_TIMEOUT).is_ok());
    assert!(event_loop.join().expect("ender"));
    assert!(!controller.end_session("a"));
}
