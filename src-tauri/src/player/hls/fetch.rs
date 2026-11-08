//! Fetches one playlist with the header: no redirects, no proxy, no cookies,
//! a size and a time limit, and a typed error that never names the URL.

use super::HlsError;
use crate::auth_header::MediaBrowserAuthorization;
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use ureq::tls::{Certificate, RootCerts, TlsConfig, TlsProvider};
use ureq::Agent;
use url::Url;

/// Jellyfin lists every segment with its full query string, about 300 to 600
/// bytes each; 8 MiB covers more than ten hours of 2-second segments.
pub(super) const MAX_PLAYLIST_BYTES: u64 = 8 * 1024 * 1024;
/// PGS subtitles for a long film can reach tens of MiB.
pub(super) const MAX_SUBTITLE_BYTES: u64 = 64 * 1024 * 1024;
/// What one session holds in memory for all its subtitles together.
pub(super) const MAX_SUBTITLE_TOTAL_BYTES: u64 = 96 * 1024 * 1024;
pub(super) const PLAYLIST_TIMEOUT: Duration = Duration::from_secs(20);
/// A large PGS file over a slow link takes longer than a playlist.
pub(super) const SUBTITLE_TIMEOUT: Duration = Duration::from_secs(45);

/// The platform roots, as the server socket uses (`rustls-native-certs`).
fn native_roots() -> Vec<Certificate<'static>> {
    static ROOTS: OnceLock<Vec<Certificate<'static>>> = OnceLock::new();
    ROOTS
        .get_or_init(|| {
            rustls_native_certs::load_native_certs()
                .certs
                .iter()
                .map(|certificate| Certificate::from_der(certificate.as_ref()).to_owned())
                .collect()
        })
        .clone()
}

pub(super) struct PlaylistFetcher {
    agent: Agent,
}

impl PlaylistFetcher {
    pub(super) fn new() -> Self {
        let tls = TlsConfig::builder()
            .provider(TlsProvider::Rustls)
            .root_certs(RootCerts::new_with_certs(&native_roots()))
            .unversioned_rustls_crypto_provider(Arc::new(rustls::crypto::ring::default_provider()))
            .build();
        let agent = Agent::config_builder()
            .tls_config(tls)
            .max_redirects(0)
            .proxy(None)
            .http_status_as_error(false)
            .timeout_global(Some(PLAYLIST_TIMEOUT))
            .user_agent("Fluster")
            .build()
            .new_agent();
        Self { agent }
    }

    /// GETs a playlist as UTF-8 text (see `fetch_bytes`).
    pub(super) fn fetch(
        &self,
        url: &Url,
        authorization: &MediaBrowserAuthorization,
        timeout: Duration,
    ) -> Result<String, HlsError> {
        let body = self.fetch_bytes(url, authorization, MAX_PLAYLIST_BYTES, timeout)?;
        String::from_utf8(body).map_err(|_| HlsError::Malformed)
    }

    /// GETs `url` with exactly one `Authorization` header and returns at most
    /// `limit` bytes of body. A 3xx is refused, never followed.
    pub(super) fn fetch_bytes(
        &self,
        url: &Url,
        authorization: &MediaBrowserAuthorization,
        limit: u64,
        timeout: Duration,
    ) -> Result<Vec<u8>, HlsError> {
        let mut response = self
            .agent
            .get(url.as_str())
            .config()
            .timeout_global(Some(timeout))
            .build()
            .header("Authorization", authorization.expose())
            .call()
            .map_err(|_| HlsError::Fetch)?;
        let status = response.status().as_u16();
        if (300..400).contains(&status) {
            return Err(HlsError::Redirect);
        }
        if status != 200 {
            return Err(HlsError::Status(status));
        }
        response
            .body_mut()
            .with_config()
            .limit(limit)
            .read_to_vec()
            .map_err(|error| match error {
                ureq::Error::BodyExceedsLimit(_) => HlsError::TooLarge,
                _ => HlsError::Fetch,
            })
    }
}
