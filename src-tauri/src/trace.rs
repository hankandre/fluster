//! Debug-build trace lines on stderr that never panic.
//!
//! `eprintln!` panics when stderr cannot be written: a closed pipe (the dev
//! CLI that read it has exited) or a non-blocking descriptor that is full.
//! A trace inside `MpvController::stop` once panicked that way before the
//! stop reached the event loop, so the episode kept playing. Every trace goes
//! through `write_trace`, which drops write errors; clippy's `print_stderr`
//! and `print_stdout` lints keep the print macros out of production code.

/// Writes `prefix message` to stderr and ignores any failure.
#[cfg(debug_assertions)]
pub(crate) fn write_trace(prefix: &'static str, message: &str) {
    let _ = write_line(&mut std::io::stderr().lock(), prefix, message);
}

#[cfg(not(debug_assertions))]
pub(crate) fn write_trace(_prefix: &'static str, _message: &str) {}

#[cfg(any(debug_assertions, test))]
fn write_line(out: &mut impl std::io::Write, prefix: &str, message: &str) -> std::io::Result<()> {
    writeln!(out, "{prefix} {message}")
}

/// A native-player trace from outside `player/` (the GTK surface).
pub(crate) fn native_trace(message: &'static str) {
    write_trace("[fluster native]", message);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{self, Write};

    struct BrokenPipe;

    impl Write for BrokenPipe {
        fn write(&mut self, _buf: &[u8]) -> io::Result<usize> {
            Err(io::Error::from(io::ErrorKind::BrokenPipe))
        }
        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::from(io::ErrorKind::BrokenPipe))
        }
    }

    #[test]
    fn a_trace_to_a_closed_pipe_returns_its_error_instead_of_panicking() {
        let result =
            std::panic::catch_unwind(|| write_line(&mut BrokenPipe, "[p]", "stop requested"));
        let written = result.expect("writing a trace must not panic");
        assert_eq!(
            written.map_err(|error| error.kind()),
            Err(io::ErrorKind::BrokenPipe)
        );
    }

    #[test]
    fn a_trace_line_is_the_prefix_and_the_message() {
        let mut out = Vec::new();
        write_line(&mut out, "[fluster native]", "stop requested").expect("vec write");
        assert_eq!(out, b"[fluster native] stop requested\n");
    }

    #[test]
    fn write_trace_never_panics() {
        write_trace("[fluster native]", "stop requested");
    }
}
