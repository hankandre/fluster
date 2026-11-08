//! LAN server discovery (P3-03, `discover_servers`).
//!
//! Jellyfin answers the UDP datagram `who is JellyfinServer?` on port 7359
//! with `{"Address","Id","Name","EndpointAddress"}` (`AutoDiscoveryHost.cs`
//! and `ServerDiscoveryInfo.cs`, identical at v10.11.7 and v12.4). It listens
//! on `IPAddress.Any` only, so discovery is IPv4 broadcast only.
//!
//! Everything here is bounded: one socket on an ephemeral port for at most
//! `LISTEN_TIME`, at most `MAX_DATAGRAMS` datagrams read, replies over
//! `MAX_REPLY_BYTES` dropped, and at most `MAX_SERVERS` servers returned. A
//! reply is kept only when its address passes the URL policy
//! (`url_policy::parse_allowed_url`). Nothing here traces addresses, ids,
//! names, or reply bodies, and errors are fixed text.

use crate::model::DiscoveredServer;
use crate::url_policy::parse_allowed_url;
use serde::Deserialize;
use std::collections::HashSet;
use std::io::ErrorKind;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::time::{Duration, Instant};

pub const DISCOVERY_PORT: u16 = 7359;
/// The exact text Jellyfin matches (case-insensitive `Contains`).
pub const DISCOVERY_MESSAGE: &[u8] = b"who is JellyfinServer?";
pub const LISTEN_TIME: Duration = Duration::from_secs(2);
const MAX_REPLY_BYTES: usize = 4096;
const MAX_DATAGRAMS: usize = 64;
const MAX_SERVERS: usize = 16;
const MAX_ADDRESS_BYTES: usize = 2048;
const MAX_ID_CHARS: usize = 64;
const MAX_NAME_CHARS: usize = 128;
const UNNAMED_SERVER: &str = "Jellyfin server";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DiscoveryError {
    #[error("Fluster could not search this network for servers.")]
    Socket,
}

#[derive(Deserialize)]
struct Reply {
    #[serde(rename = "Address")]
    address: String,
    #[serde(rename = "Id")]
    id: String,
    #[serde(rename = "Name")]
    name: String,
}

/// Broadcasts the discovery datagram on the local IPv4 network.
pub fn discover_on_lan() -> Result<Vec<DiscoveredServer>, DiscoveryError> {
    let broadcast = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT));
    discover(broadcast, LISTEN_TIME)
}

/// Sends one discovery datagram to `target` and collects replies until
/// `listen_for` has passed. `target` is injectable so tests can use a
/// responder on loopback.
pub fn discover(
    target: SocketAddr,
    listen_for: Duration,
) -> Result<Vec<DiscoveredServer>, DiscoveryError> {
    let socket = UdpSocket::bind(SocketAddrV4::new(Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|_| DiscoveryError::Socket)?;
    socket
        .set_broadcast(true)
        .map_err(|_| DiscoveryError::Socket)?;
    socket
        .send_to(DISCOVERY_MESSAGE, target)
        .map_err(|_| DiscoveryError::Socket)?;

    let deadline = Instant::now() + listen_for;
    // One spare byte shows that a datagram was larger than the limit.
    let mut buffer = [0_u8; MAX_REPLY_BYTES + 1];
    let mut collector = Collector::default();
    for _ in 0..MAX_DATAGRAMS {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() || collector.is_full() {
            break;
        }
        socket
            .set_read_timeout(Some(remaining))
            .map_err(|_| DiscoveryError::Socket)?;
        match socket.recv_from(&mut buffer) {
            Ok((length, _)) => collector.accept(&buffer[..length]),
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                break
            }
            // A single bad datagram (for example one too large on Windows)
            // must not end the search; the deadline still bounds the loop.
            Err(_) => continue,
        }
    }
    Ok(collector.servers)
}

/// Keeps the first valid reply for each server id.
#[derive(Default)]
struct Collector {
    ids: HashSet<String>,
    servers: Vec<DiscoveredServer>,
}

impl Collector {
    fn is_full(&self) -> bool {
        self.servers.len() >= MAX_SERVERS
    }

    fn accept(&mut self, datagram: &[u8]) {
        if self.is_full() {
            return;
        }
        let Some(server) = parse_reply(datagram) else {
            return;
        };
        if self.ids.insert(server.id.clone()) {
            self.servers.push(server);
        }
    }
}

/// Parses one reply datagram. Returns `None` for anything oversized,
/// malformed, or whose address the URL policy refuses.
pub fn parse_reply(datagram: &[u8]) -> Option<DiscoveredServer> {
    if datagram.len() > MAX_REPLY_BYTES {
        return None;
    }
    let reply: Reply = serde_json::from_slice(datagram).ok()?;
    let id = valid_id(&reply.id)?;
    let address = allowed_address(&reply.address)?;
    Some(DiscoveredServer {
        name: display_name(&reply.name),
        id,
        address,
    })
}

/// Jellyfin sends its system id as a GUID; accept only short ASCII ids.
fn valid_id(value: &str) -> Option<String> {
    let id = value.trim();
    let valid = !id.is_empty()
        && id.len() <= MAX_ID_CHARS
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-');
    valid.then(|| id.to_ascii_lowercase())
}

/// HTTPS anywhere, plain HTTP only for loopback and private-LAN hosts, no
/// credentials, fragment, or query. The frontend still asks the user to
/// confirm plain HTTP to a private-LAN host before sign-in.
fn allowed_address(value: &str) -> Option<String> {
    if value.len() > MAX_ADDRESS_BYTES {
        return None;
    }
    let url = parse_allowed_url(value.trim())?;
    if url.query().is_some() {
        return None;
    }
    Some(url.as_str().trim_end_matches('/').to_string())
}

fn display_name(value: &str) -> String {
    let name: String = value
        .chars()
        .filter(|c| !c.is_control())
        .take(MAX_NAME_CHARS)
        .collect();
    let name = name.trim();
    if name.is_empty() {
        UNNAMED_SERVER.to_string()
    } else {
        name.to_string()
    }
}

#[cfg(test)]
mod tests;
