//! The one URL policy for everything Rust opens on a Jellyfin server:
//! HTTPS anywhere, plain HTTP only for this device's loopback address, and
//! never user information or a fragment.

use url::{Host, Url};

pub fn parse_allowed_url(value: &str) -> Option<Url> {
    let url = Url::parse(value).ok()?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return None;
    }
    match url.scheme() {
        "https" if url.host().is_some() => Some(url),
        "http" if url.host().is_some_and(is_loopback_host) => Some(url),
        _ => None,
    }
}

fn is_loopback_host(host: Host<&str>) -> bool {
    match host {
        Host::Domain(domain) => domain.eq_ignore_ascii_case("localhost"),
        Host::Ipv4(address) => address == std::net::Ipv4Addr::LOCALHOST,
        Host::Ipv6(_) => false,
    }
}
