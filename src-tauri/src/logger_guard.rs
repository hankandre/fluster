//! Fails when a logger crate enters the dependency tree.
//!
//! tungstenite trace-logs the full handshake request, including the
//! `Authorization` header (tungstenite 0.29.0, src/handshake/client.rs:197),
//! and ureq debug-logs each HLS playlist request URI and request (ureq 3.5.1,
//! src/run.rs:153 and 174). That is harmless only while nothing installs a
//! `log`/`tracing` logger.

const LOGGER_CRATES: [&str; 9] = [
    "env_logger",
    "pretty_env_logger",
    "tauri-plugin-log",
    "tracing-subscriber",
    "tracing-log",
    "fern",
    "simplelog",
    "log4rs",
    "flexi_logger",
];

fn locked_package_names() -> Vec<&'static str> {
    include_str!("../Cargo.lock")
        .lines()
        .filter_map(|line| line.strip_prefix("name = \""))
        .filter_map(|rest| rest.strip_suffix('"'))
        .collect()
}

#[test]
fn no_logger_can_capture_the_socket_authorization_header() {
    let packages = locked_package_names();
    assert!(
        packages.contains(&"tungstenite"),
        "lockfile should be parsed"
    );
    let loggers: Vec<&str> = LOGGER_CRATES
        .iter()
        .copied()
        .filter(|logger| packages.contains(logger))
        .collect();
    assert!(
        loggers.is_empty(),
        "Logger crates {loggers:?} are now in Cargo.lock. tungstenite trace-logs the \
         socket handshake with the Authorization header. Before adding a logger, cap the \
         `tungstenite` and `tokio_tungstenite` targets below trace (for example \
         `tungstenite=info`), add a canary test that the header never reaches the log \
         output, update docs/security.md, then extend this check."
    );
}
