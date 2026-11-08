//! The embedded libmpv player: one session at a time, driven by typed commands.

mod controller;
mod diagnostics;
mod events;
mod hls;
mod media;
mod network;
mod properties;
mod track_list;
mod tracks;
mod version;

pub(crate) use controller::MpvController;
use hls::HlsError;
use libmpv2::{Mpv, MpvStr};
use thiserror::Error;

#[derive(Debug, Error)]
pub(crate) enum MpvError {
    #[error("The embedded player is unavailable: {0}")]
    Renderer(String),
    #[error("Another playback session is already active.")]
    AlreadyPlaying,
    #[error(
        "The playback plan is missing its item, title, media source, or play-session identity."
    )]
    InvalidPlan,
    #[error("The playback stream URL is not allowed. Use HTTPS, or HTTP only for this device or a private home-network server.")]
    UnsafeStreamUrl,
    #[error("An external subtitle URL is not allowed. Subtitles must use the same server origin as the playback stream.")]
    UnsafeSubtitleUrl,
    #[error("A media URL must not carry a credential. Fluster authenticates media requests with a header.")]
    CredentialInUrl,
    /// The frontend (`src/lib/player/native-player.ts`) turns this prefix
    /// into the `unsafe-transcoding-url` refusal. Never carries a URL or body.
    #[error("Fluster refused the converted stream: {0}")]
    UnsafeConversion(HlsError),
    #[error("Could not start the converted stream: {0}")]
    Conversion(HlsError),
    #[error("Could not initialize libmpv 0.41 or newer: {0}")]
    Initialize(String),
    #[error("Fluster requires libmpv 0.41 or newer, but found {0}. Install a current libmpv development/runtime package or use the release AppImage.")]
    UnsupportedVersion(String),
    #[error("Could not set the numeric locale required by libmpv.")]
    Locale,
    #[error("No playback session is active.")]
    NotPlaying,
    #[error("The player command failed: {0}")]
    Command(String),
    #[error("The playback session did not stop within five seconds.")]
    StopTimeout,
}

#[cfg(debug_assertions)]
fn native_trace(message: &str) {
    eprintln!("[fluster native] {message}");
}

#[cfg(not(debug_assertions))]
fn native_trace(_message: &str) {}

fn string_property(mpv: &Mpv, property: &str) -> Option<String> {
    mpv.get_property::<MpvStr<'_>>(property)
        .ok()
        .map(|value| value.to_string())
}

#[cfg(test)]
mod media_auth_wire;
#[cfg(test)]
mod redaction_canary;
#[cfg(test)]
mod test_http;
#[cfg(test)]
mod test_support;
