//! Server conversion over HLS (decision 0002, E1-B): Rust fetches the master
//! and every variant playlist with the header and no redirects, validates
//! every URI in them, and serves the validated copies to libmpv from a
//! `127.0.0.1` loopback server on a random per-session path. libmpv never
//! reads a playlist straight from the server; it fetches only the segments
//! and init sections that Rust checked, with the header (P10-01 evidence in
//! `docs/plans/active/002-transcoding-fallback-and-parity.md`). External
//! subtitles take the same path: fetched, checked, and served from loopback.

mod attributes;
mod fetch;
mod loopback;
mod master_url;
mod playlist;
mod session;
mod subtitle;
mod uri;

pub(crate) use session::{HlsRequest, HlsSession};
use thiserror::Error;

/// Why an HLS session did not start. No variant carries a URL, a playlist
/// line, or a server message, so none can carry a token.
#[derive(Debug, Error, PartialEq, Eq)]
pub(crate) enum HlsError {
    #[error("The conversion stream address is not one Fluster accepts.")]
    UnsafeMasterUrl,
    #[error("Could not fetch the conversion playlist from the server.")]
    Fetch,
    #[error("The server answered the conversion playlist request with HTTP status {0}.")]
    Status(u16),
    #[error("The server redirected a conversion playlist. Fluster follows no redirects.")]
    Redirect,
    #[error("The conversion playlist is larger than Fluster accepts.")]
    TooLarge,
    #[error("The conversion playlist is not a playlist Fluster can check.")]
    Malformed,
    #[error("The conversion playlist is live; Fluster plays only complete playlists.")]
    NotComplete,
    #[error(
        "The conversion playlist names an address on another server or with user information."
    )]
    UnsafeUri,
    #[error("The conversion playlist carries a credential, so Fluster stopped before using it.")]
    CredentialInPlaylist,
    #[error("An external subtitle address is not on the signed-in server.")]
    UnsafeSubtitleUrl,
    #[error("An external subtitle is not a subtitle file Fluster can check.")]
    UnsafeSubtitle,
    #[error("The local playlist server could not start.")]
    Loopback,
}

#[cfg(test)]
mod attributes_tests;
#[cfg(test)]
mod loopback_tests;
#[cfg(test)]
mod master_url_tests;
#[cfg(test)]
mod playlist_tests;
#[cfg(test)]
mod session_tests;
#[cfg(test)]
mod subtitle_tests;
#[cfg(test)]
mod uri_tests;
