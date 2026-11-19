//! Mutex access that survives a panic on another thread.
//!
//! A poisoned lock means some thread panicked while holding it. Every value
//! these locks guard is replaced or taken whole, never left half-written, so
//! the value is still sound and stop, window close, and the media controls
//! keep working instead of panicking in turn.

use std::sync::{Condvar, Mutex, MutexGuard, PoisonError, WaitTimeoutResult};
use std::time::Duration;

pub(crate) fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) fn wait_timeout<'a, T>(
    condvar: &Condvar,
    guard: MutexGuard<'a, T>,
    timeout: Duration,
) -> (MutexGuard<'a, T>, WaitTimeoutResult) {
    condvar
        .wait_timeout(guard, timeout)
        .unwrap_or_else(PoisonError::into_inner)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::thread;

    fn poisoned(value: i32) -> Arc<Mutex<i32>> {
        let mutex = Arc::new(Mutex::new(value));
        let held = mutex.clone();
        let _ = thread::spawn(move || {
            let _guard = held.lock().unwrap();
            panic!("poison the lock on purpose");
        })
        .join();
        assert!(mutex.is_poisoned());
        mutex
    }

    #[test]
    fn a_poisoned_lock_still_gives_its_value() {
        let mutex = poisoned(7);
        assert_eq!(*lock(&mutex), 7);
        *lock(&mutex) = 8;
        assert_eq!(*lock(&mutex), 8);
    }

    #[test]
    fn a_wait_on_a_poisoned_lock_times_out_instead_of_panicking() {
        let mutex = poisoned(1);
        let condvar = Condvar::new();
        let (guard, result) = wait_timeout(&condvar, lock(&mutex), Duration::from_millis(5));
        assert!(result.timed_out());
        assert_eq!(*guard, 1);
    }
}
