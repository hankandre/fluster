//! Serves the validated playlist copies to libmpv on `127.0.0.1`, under a
//! random 128-bit path prefix, until the session drops the server.
//!
//! It answers `GET` for the exact paths it was given and 404 for anything
//! else. The bodies hold no token: the server never wrote one into them,
//! and `Playlist::parse` refuses a body that names a credential.

use super::HlsError;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

const MAX_REQUEST_HEAD_BYTES: usize = 8 * 1024;
const IO_TIMEOUT: Duration = Duration::from_secs(2);

/// A bound listener and its random path prefix, before it serves.
pub(super) struct BoundLoopback {
    listener: TcpListener,
    address: SocketAddr,
    prefix: String,
}

pub(super) struct LoopbackServer {
    address: SocketAddr,
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

    /// Serves `bodies` (path to playlist text) until the server is dropped.
    pub(super) fn serve(self, bodies: HashMap<String, String>) -> Result<LoopbackServer, HlsError> {
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let listener = self.listener;
        let thread = thread::Builder::new()
            .name("fluster-hls-loopback".into())
            .spawn(move || {
                for stream in listener.incoming() {
                    if stopping.load(Ordering::SeqCst) {
                        break;
                    }
                    if let Ok(stream) = stream {
                        answer(stream, &bodies);
                    }
                }
            })
            .map_err(|_| HlsError::Loopback)?;
        Ok(LoopbackServer {
            address: self.address,
            stop,
            thread: Some(thread),
        })
    }
}

impl Drop for LoopbackServer {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Wake the blocking accept so the thread sees the flag and exits.
        let _ = TcpStream::connect_timeout(&self.address, Duration::from_secs(1));
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

fn read_head(stream: &mut TcpStream) -> Option<String> {
    let mut head = Vec::new();
    let mut buffer = [0u8; 1024];
    while !head.windows(4).any(|window| window == b"\r\n\r\n") {
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

fn answer(mut stream: TcpStream, bodies: &HashMap<String, String>) {
    let _ = stream.set_read_timeout(Some(IO_TIMEOUT));
    let _ = stream.set_write_timeout(Some(IO_TIMEOUT));
    let Some(head) = read_head(&mut stream) else {
        return;
    };
    let mut request_line = head.lines().next().unwrap_or("").split(' ');
    let method = request_line.next().unwrap_or("");
    let target = request_line.next().unwrap_or("");
    let response = match (method, bodies.get(target)) {
        ("GET", Some(body)) => format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/vnd.apple.mpegurl\r\n\
             Content-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}",
            body.len()
        ),
        ("GET", None) => {
            "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".into()
        }
        _ => "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
            .into(),
    };
    let _ = stream.write_all(response.as_bytes());
}
