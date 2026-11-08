//! Serves the validated playlist and subtitle copies to libmpv on
//! `127.0.0.1`, under a random 128-bit path prefix, until the session drops
//! the server.
//!
//! It answers `GET` for the exact paths it was given and 404 for anything
//! else. The bodies hold no token: `HlsSession` refuses any body that names
//! a credential or contains the token. Each connection runs on its own
//! thread with a fixed deadline, so a slow client delays neither other
//! clients nor `Drop`.

use super::HlsError;
use std::collections::HashMap;
use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const MAX_REQUEST_HEAD_BYTES: usize = 8 * 1024;
/// The whole request head must arrive within this time.
pub(super) const HEAD_DEADLINE: Duration = Duration::from_secs(2);
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const ACCEPT_POLL: Duration = Duration::from_millis(10);
const MAX_CONNECTIONS: usize = 16;

/// One body to serve and its media type.
pub(super) struct Served {
    pub(super) content_type: &'static str,
    pub(super) body: Vec<u8>,
}

/// A bound listener and its random path prefix, before it serves.
pub(super) struct BoundLoopback {
    listener: TcpListener,
    address: SocketAddr,
    prefix: String,
}

pub(super) struct LoopbackServer {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

fn random_prefix() -> Result<String, HlsError> {
    let mut bytes = [0u8; 16];
    rustls::crypto::ring::default_provider()
        .secure_random
        .fill(&mut bytes)
        .map_err(|_| HlsError::Loopback)?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

impl BoundLoopback {
    pub(super) fn bind() -> Result<Self, HlsError> {
        let listener =
            TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).map_err(|_| HlsError::Loopback)?;
        let address = listener.local_addr().map_err(|_| HlsError::Loopback)?;
        listener
            .set_nonblocking(true)
            .map_err(|_| HlsError::Loopback)?;
        Ok(Self {
            listener,
            address,
            prefix: format!("/{}", random_prefix()?),
        })
    }

    /// The path under the session prefix, for example `/{random}/master.m3u8`.
    pub(super) fn path(&self, name: &str) -> String {
        format!("{}/{name}", self.prefix)
    }

    pub(super) fn url(&self, name: &str) -> String {
        format!("http://{}{}", self.address, self.path(name))
    }

    /// Serves `bodies` (path to body) until the server is dropped.
    pub(super) fn serve(self, bodies: HashMap<String, Served>) -> Result<LoopbackServer, HlsError> {
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let listener = self.listener;
        let bodies = Arc::new(bodies);
        let thread = thread::Builder::new()
            .name("fluster-hls-loopback".into())
            .spawn(move || accept_until_stopped(&listener, &stopping, &bodies))
            .map_err(|_| HlsError::Loopback)?;
        Ok(LoopbackServer {
            stop,
            thread: Some(thread),
        })
    }
}

fn accept_until_stopped(
    listener: &TcpListener,
    stopping: &AtomicBool,
    bodies: &Arc<HashMap<String, Served>>,
) {
    let active = Arc::new(AtomicUsize::new(0));
    while !stopping.load(Ordering::SeqCst) {
        let stream = match listener.accept() {
            Ok((stream, _)) => stream,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(_) => {
                thread::sleep(ACCEPT_POLL);
                continue;
            }
        };
        // Over the limit, the connection is closed unanswered.
        if active.fetch_add(1, Ordering::SeqCst) >= MAX_CONNECTIONS {
            active.fetch_sub(1, Ordering::SeqCst);
            continue;
        }
        let bodies = bodies.clone();
        let finished = active.clone();
        let spawned = thread::Builder::new()
            .name("fluster-hls-loopback-conn".into())
            .spawn(move || {
                answer(stream, &bodies);
                finished.fetch_sub(1, Ordering::SeqCst);
            });
        if spawned.is_err() {
            active.fetch_sub(1, Ordering::SeqCst);
        }
    }
}

impl Drop for LoopbackServer {
    /// Stops accepting within one poll interval. Connections already
    /// accepted finish on their own threads within their deadlines.
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn read_head(stream: &mut TcpStream) -> Option<String> {
    let deadline = Instant::now() + HEAD_DEADLINE;
    let mut head = Vec::new();
    let mut buffer = [0u8; 1024];
    while !head.windows(4).any(|window| window == b"\r\n\r\n") {
        let remaining = deadline.checked_duration_since(Instant::now())?;
        if remaining.is_zero() {
            return None;
        }
        stream.set_read_timeout(Some(remaining)).ok()?;
        let read = stream.read(&mut buffer).ok()?;
        if read == 0 {
            return None;
        }
        head.extend_from_slice(&buffer[..read]);
        if head.len() > MAX_REQUEST_HEAD_BYTES {
            return None;
        }
    }
    String::from_utf8(head).ok()
}

const NOT_FOUND: &[u8] =
    b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
const NOT_ALLOWED: &[u8] =
    b"HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";

fn answer(mut stream: TcpStream, bodies: &HashMap<String, Served>) {
    // Accepted sockets may inherit the listener's non-blocking mode.
    if stream.set_nonblocking(false).is_err() {
        return;
    }
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let Some(head) = read_head(&mut stream) else {
        return;
    };
    let mut request_line = head.lines().next().unwrap_or("").split(' ');
    let method = request_line.next().unwrap_or("");
    let target = request_line.next().unwrap_or("");
    match (method, bodies.get(target)) {
        ("GET", Some(served)) => {
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\
                 Cache-Control: no-store\r\nConnection: close\r\n\r\n",
                served.content_type,
                served.body.len()
            );
            let _ = stream.write_all(head.as_bytes());
            let _ = stream.write_all(&served.body);
        }
        ("GET", None) => {
            let _ = stream.write_all(NOT_FOUND);
        }
        _ => {
            let _ = stream.write_all(NOT_ALLOWED);
        }
    }
}
