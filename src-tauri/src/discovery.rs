//! LAN server discovery (P3-03, `discover_servers`).
//!
//! Jellyfin answers the UDP datagram `who is JellyfinServer?` on port 7359
//! with `{"Address","Id","Name","EndpointAddress"}` (`AutoDiscoveryHost.cs`
//! and `ServerDiscoveryInfo.cs`, identical at v10.11.7 and v12.4). It listens
//! on `IPAddress.Any` only, so discovery is IPv4 broadcast only.
//!
//! Everything here is bounded: one socket on an ephemeral port for at most
//! `LISTEN_TIME`, datagrams over `MAX_REPLY_BYTES` dropped, at most
//! `MAX_SERVERS` valid replies kept, and one search at a time. Junk
//! datagrams do not end the search early; only the deadline does. A reply is
//! kept only when its address passes the URL policy
//! (`url_policy::parse_allowed_url`), and a loopback address only when the
//! reply itself came from loopback. Any device on the network can reply, so
//! each entry carries the IPv4 sender, and two replies that name the same id
//! with different addresses are both kept and marked as conflicting. Nothing
//! here traces addresses, ids, names, or reply bodies, and errors are fixed
//! text.

use crate::model::{DiscoveredServer, DiscoveryResult};
use crate::url_policy::{classify_host, parse_allowed_url, HostClass};
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::io::ErrorKind;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, SocketAddrV4, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use url::Host;

pub const DISCOVERY_PORT: u16 = 7359;
/// The exact text Jellyfin matches (case-insensitive `Contains`).
pub const DISCOVERY_MESSAGE: &[u8] = b"who is JellyfinServer?";
pub const LISTEN_TIME: Duration = Duration::from_secs(2);
const MAX_REPLY_BYTES: usize = 4096;
const MAX_SERVERS: usize = 16;
const MAX_ADDRESS_BYTES: usize = 2048;
const MAX_ID_CHARS: usize = 64;
const MAX_NAME_CHARS: usize = 128;
const UNNAMED_SERVER: &str = "Jellyfin server";

static SEARCHING: AtomicBool = AtomicBool::new(false);

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum DiscoveryError {
    #[error("Fluster could not search this network for servers.")]
    Socket,
    #[error("Fluster is already searching this network for servers.")]
    Busy,
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

/// What one datagram turned out to be.
#[derive(Debug, PartialEq, Eq)]
pub enum ParsedReply {
    Server(DiscoveredServer),
    /// A well-formed reply whose address Fluster will not use.
    Refused,
    Invalid,
}

/// Holds the one-search-at-a-time flag until dropped.
struct SearchGuard<'a>(&'a AtomicBool);

impl<'a> SearchGuard<'a> {
    fn acquire(flag: &'a AtomicBool) -> Result<Self, DiscoveryError> {
        flag.compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| SearchGuard(flag))
            .map_err(|_| DiscoveryError::Busy)
    }
}

impl Drop for SearchGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

/// Broadcasts the discovery datagram on the local IPv4 network.
pub fn discover_on_lan() -> Result<DiscoveryResult, DiscoveryError> {
    let _guard = SearchGuard::acquire(&SEARCHING)?;
    let broadcast = SocketAddr::V4(SocketAddrV4::new(Ipv4Addr::BROADCAST, DISCOVERY_PORT));
    discover(broadcast, LISTEN_TIME)
}

/// Sends one discovery datagram to `target` and collects replies until
/// `listen_for` has passed. `target` is injectable so tests can use a
/// responder on loopback.
pub fn discover(
    target: SocketAddr,
    listen_for: Duration,
) -> Result<DiscoveryResult, DiscoveryError> {
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
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() || collector.is_full() {
            break;
        }
        socket
            .set_read_timeout(Some(remaining))
            .map_err(|_| DiscoveryError::Socket)?;
        match socket.recv_from(&mut buffer) {
            Ok((length, sender)) => collector.accept(&buffer[..length], sender),
            Err(error) if matches!(error.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                break
            }
            // A single bad datagram (for example one too large on Windows)
            // must not end the search; the deadline still bounds the loop.
            Err(_) => continue,
        }
    }
    Ok(collector.finish())
}

/// Keeps each distinct (id, address) pair once, up to `MAX_SERVERS`.
#[derive(Default)]
struct Collector {
    pairs: HashSet<(String, String)>,
    servers: Vec<DiscoveredServer>,
    refused: u32,
}

impl Collector {
    fn is_full(&self) -> bool {
        self.servers.len() >= MAX_SERVERS
    }

    fn accept(&mut self, datagram: &[u8], sender: SocketAddr) {
        match parse_reply(datagram, sender) {
            ParsedReply::Server(server) => {
                if self.is_full() {
                    return;
                }
                if self
                    .pairs
                    .insert((server.id.clone(), server.address.clone()))
                {
                    self.servers.push(server);
                }
            }
            ParsedReply::Refused => self.refused = self.refused.saturating_add(1),
            ParsedReply::Invalid => {}
        }
    }

    fn finish(mut self) -> DiscoveryResult {
        let mut addresses_per_id: HashMap<&str, usize> = HashMap::new();
        for server in &self.servers {
            *addresses_per_id.entry(server.id.as_str()).or_default() += 1;
        }
        let conflicting: HashSet<String> = addresses_per_id
            .into_iter()
            .filter(|(_, count)| *count > 1)
            .map(|(id, _)| id.to_string())
            .collect();
        for server in &mut self.servers {
            server.conflicting = conflicting.contains(&server.id);
        }
        DiscoveryResult {
            servers: self.servers,
            refused: self.refused,
        }
    }
}

/// Parses one reply datagram from `sender`.
pub fn parse_reply(datagram: &[u8], sender: SocketAddr) -> ParsedReply {
    if datagram.len() > MAX_REPLY_BYTES {
        return ParsedReply::Invalid;
    }
    let Ok(reply) = serde_json::from_slice::<Reply>(datagram) else {
        return ParsedReply::Invalid;
    };
    let Some(id) = valid_id(&reply.id) else {
        return ParsedReply::Invalid;
    };
    let Some((address, address_is_sender)) = allowed_address(&reply.address, sender.ip()) else {
        return ParsedReply::Refused;
    };
    ParsedReply::Server(DiscoveredServer {
        name: display_name(&reply.name),
        id,
        address,
        advertised_by: sender.ip().to_string(),
        address_is_sender,
        conflicting: false,
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
/// credentials, fragment, or query, and loopback only from a loopback
/// sender. The frontend still asks the user to confirm plain HTTP to a
/// private-LAN host before sign-in. Returns the address and whether its
/// host is the sender's IP address.
fn allowed_address(value: &str, sender: IpAddr) -> Option<(String, bool)> {
    if value.len() > MAX_ADDRESS_BYTES {
        return None;
    }
    let url = parse_allowed_url(value.trim())?;
    if url.query().is_some() {
        return None;
    }
    let host = url.host()?;
    if classify_host(&host) == HostClass::Loopback && !sender.is_loopback() {
        return None;
    }
    let host_ip = match host {
        Host::Ipv4(address) => Some(IpAddr::V4(address)),
        Host::Ipv6(address) => Some(
            address
                .to_ipv4_mapped()
                .map_or(IpAddr::V6(address), IpAddr::V4),
        ),
        Host::Domain(_) => None,
    };
    let address_is_sender = host_ip == Some(sender);
    Some((
        url.as_str().trim_end_matches('/').to_string(),
        address_is_sender,
    ))
}

/// Invisible and bidirectional-control characters that could make a name
/// read as something else.
fn is_hidden(c: char) -> bool {
    c.is_control()
        || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2069}' | '\u{FEFF}')
}

fn display_name(value: &str) -> String {
    let name: String = value
        .chars()
        .filter(|c| !is_hidden(*c))
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
