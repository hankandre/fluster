//! The one URL policy for everything Rust opens on a Jellyfin server:
//! HTTPS anywhere, plain HTTP only for loopback and private-LAN hosts
//! (docs/decisions/0001), and never user information or a fragment.
//!
//! The host class comes from the literal parsed host, never a DNS answer.
//! `src/domain/host-class.ts` implements the same rules, and both are tested
//! against `tests/fixtures/host-classes.json`. Rust does not see the user's
//! private-LAN confirmation; the gateway asks for it before any sign-in.

use std::net::{Ipv4Addr, Ipv6Addr};
use url::{Host, Url};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HostClass {
    Loopback,
    PrivateLan,
    Public,
}

pub fn parse_allowed_url(value: &str) -> Option<Url> {
    let url = Url::parse(value).ok()?;
    if !url.username().is_empty() || url.password().is_some() || url.fragment().is_some() {
        return None;
    }
    let host = url.host()?;
    match url.scheme() {
        "https" => Some(url),
        "http" if classify_host(&host) != HostClass::Public => Some(url),
        _ => None,
    }
}

pub fn classify_host(host: &Host<&str>) -> HostClass {
    match host {
        Host::Domain(domain) => classify_domain(domain),
        Host::Ipv4(address) => classify_ipv4(*address),
        Host::Ipv6(address) => classify_ipv6(*address),
    }
}

fn classify_ipv4(address: Ipv4Addr) -> HostClass {
    if address.is_loopback() {
        return HostClass::Loopback;
    }
    // is_private covers 10/8, 172.16/12, and 192.168/16; is_link_local is
    // 169.254/16.
    if address.is_private() || address.is_link_local() {
        return HostClass::PrivateLan;
    }
    HostClass::Public
}

fn classify_ipv6(address: Ipv6Addr) -> HostClass {
    if address.is_loopback() {
        return HostClass::Loopback;
    }
    // Only ::ffff:0:0/96 takes the class of the embedded IPv4 address.
    if let Some(mapped) = address.to_ipv4_mapped() {
        return classify_ipv4(mapped);
    }
    let first = address.segments()[0];
    let unique_local = first & 0xfe00 == 0xfc00;
    let link_local = first & 0xffc0 == 0xfe80;
    if unique_local || link_local {
        return HostClass::PrivateLan;
    }
    HostClass::Public
}

fn classify_domain(domain: &str) -> HostClass {
    // The url crate has already lowercased the name.
    if domain == "localhost" {
        return HostClass::Loopback;
    }
    let name = domain.strip_suffix('.').unwrap_or(domain);
    let labels: Vec<&str> = name.split('.').collect();
    if labels.iter().any(|label| label.is_empty()) {
        return HostClass::Public;
    }
    // Internationalized names are not admitted for plain HTTP, matching the
    // TypeScript classifier, whose URL parser accepts some punycode this
    // crate refuses.
    if labels.iter().any(|label| label.starts_with("xn--")) {
        return HostClass::Public;
    }
    let is_local = labels.len() >= 2 && labels.ends_with(&["local"]);
    let is_home_arpa = labels.len() >= 3 && labels.ends_with(&["home", "arpa"]);
    if is_local || is_home_arpa {
        return HostClass::PrivateLan;
    }
    HostClass::Public
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    const SHARED_VECTORS: &str = include_str!("../../tests/fixtures/host-classes.json");

    #[derive(Deserialize)]
    struct Table {
        vectors: Vec<Vector>,
    }

    #[derive(Deserialize)]
    struct Vector {
        url: String,
        class: String,
    }

    fn expected_class(name: &str) -> HostClass {
        match name {
            "loopback" => HostClass::Loopback,
            "private-lan" => HostClass::PrivateLan,
            "public" => HostClass::Public,
            other => panic!("unknown class {other} in host-classes.json"),
        }
    }

    fn shared_vectors() -> Vec<Vector> {
        let table: Table = serde_json::from_str(SHARED_VECTORS).expect("valid host-classes.json");
        assert!(!table.vectors.is_empty());
        table.vectors
    }

    #[test]
    fn classifies_every_shared_vector() {
        for vector in shared_vectors() {
            // A URL this crate cannot parse is refused, so it must be public.
            let Ok(url) = Url::parse(&vector.url) else {
                assert_eq!(
                    expected_class(&vector.class),
                    HostClass::Public,
                    "{}",
                    vector.url
                );
                continue;
            };
            let host = url.host().expect(&vector.url);
            assert_eq!(
                classify_host(&host),
                expected_class(&vector.class),
                "{}",
                vector.url
            );
        }
    }

    #[test]
    fn plain_http_is_allowed_only_for_loopback_and_private_lan_hosts() {
        for vector in shared_vectors() {
            let allowed = parse_allowed_url(&vector.url).is_some();
            assert_eq!(
                allowed,
                expected_class(&vector.class) != HostClass::Public,
                "{}",
                vector.url
            );
        }
    }

    #[test]
    fn https_is_allowed_for_every_host_class() {
        for vector in shared_vectors() {
            let https = vector.url.replacen("http://", "https://", 1);
            if Url::parse(&https).is_err() {
                continue;
            }
            assert!(parse_allowed_url(&https).is_some(), "{https}");
        }
    }

    #[test]
    fn credentials_fragments_and_other_schemes_are_refused() {
        for value in [
            "http://user:password@192.168.1.5/",
            "http://user@nas.local/",
            "https://user:password@media.example/",
            "http://192.168.1.5/#fragment",
            "ws://192.168.1.5/socket",
            "wss://media.example/socket",
            "file:///tmp/video.mkv",
            "ftp://192.168.1.5/video.mkv",
            "not a url",
        ] {
            assert!(parse_allowed_url(value).is_none(), "{value}");
        }
    }
}
