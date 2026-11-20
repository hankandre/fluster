//! Network hardening, the media Authorization header, and media URL checks.

use super::hls::HlsSession;
use super::MpvError;
use crate::auth_header::MediaBrowserAuthorization;
use crate::model::LaunchRequest;
use crate::redaction::safe_error;
use crate::url_policy::parse_allowed_url;
use libmpv2::{Mpv, MpvInitializer};

// FFmpeg http protocol AVOptions (libavformat/http.c, FFmpeg 6.1 and 7.1+).
// FFmpeg re-sends custom headers to every redirect target, whatever its
// origin, so redirects are refused. It also tunnels through the `http_proxy`
// environment variable unless the option is set; any value that does not
// start with `http://` turns the proxy off (http.c `http_open_cnx_internal`).
const STREAM_LAVF_OPTIONS: &str = "max_redirects=0,http_proxy=direct://";
// mpv 0.42 adds a libcurl backend for HTTP(S), on by default when mpv is
// built with libcurl and libavformat is >= 62.15.101, or in the FFmpeg 8.1
// and 8.0 backport ranges [62.12.102, 62.13) and [62.3.103, 62.4)
// (`stream/stream_curl.c` v0.42.0 lines 91-97, 124). It sets `CURLOPT_FOLLOWLOCATION` with
// `--curl-max-redirects` (default 16, lines 127, 972-973) and sends
// `http-header-fields` (lines 932-934), and demux_lavf routes nested opens
// such as HLS segments through it (`demux/demux_lavf.c` lines 1016-1023).
// `curl-enabled=no` makes both the stream and the nested opens fall back to
// FFmpeg (stream_curl.c lines 1145-1146, 1361-1364; `stream/stream.c` lines
// 455-460 move on to the next backend), the one HTTP path the
// options above harden; `curl-max-redirects=0` stays as a second guard for
// redirects only. libcurl's own proxy handling is never reached, because
// curl serves nothing.
const CURL_ENABLED: &str = "curl-enabled";
const CURL_MAX_REDIRECTS: &str = "curl-max-redirects";
// FFmpeg AVFormatContext option, copied onto every nested open by mpv
// (`nested_io_open`). mpv quotes a list value that holds commas with `[ ]`.
const HLS_PROTOCOL_WHITELIST: &str = "protocol_whitelist=[http,https,tcp,tls]";

/// What a session's handle may open besides its one stream URL.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum MediaDelivery {
    /// The original file: nothing named inside a body is ever opened.
    Static,
    /// A master playlist that Rust validated and serves from loopback
    /// (`player::hls`). FFmpeg must open its variants and segments.
    ValidatedHls,
}

/// The HTTP stacks the loaded libmpv has (`version::http_stacks`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum HttpStacks {
    /// FFmpeg's http protocol only (mpv 0.41 without the curl backend).
    LavfOnly,
    /// mpv's libcurl backend too, which must be turned off on every handle.
    LavfAndCurl,
}

/// Why a handle's network options could not be set.
#[derive(Debug)]
pub(super) enum HardeningError {
    /// The curl backend could not be turned off: the handle must not play.
    CurlGuard(libmpv2::Error),
    Option(libmpv2::Error),
}

impl From<libmpv2::Error> for HardeningError {
    fn from(error: libmpv2::Error) -> Self {
        Self::Option(error)
    }
}

impl From<HardeningError> for libmpv2::Error {
    fn from(error: HardeningError) -> Self {
        match error {
            HardeningError::CurlGuard(error) | HardeningError::Option(error) => error,
        }
    }
}

pub(super) fn harden_network_options(
    init: &MpvInitializer,
    delivery: MediaDelivery,
    http: HttpStacks,
) -> Result<(), HardeningError> {
    refuse_curl_backend(init, http).map_err(HardeningError::CurlGuard)?;
    init.set_option("stream-lavf-o", STREAM_LAVF_OPTIONS)?;
    // The builtin ytdl_hook script retries a failed load by running yt-dlp
    // with the full stream URL as a process argument.
    init.set_option("ytdl", false)?;
    // The Authorization header goes to every network open on this handle.
    // Without this, a playlist, EDL, or HLS body served as the "movie" (or as
    // a subtitle) makes mpv or FFmpeg open the URLs inside it, which never
    // passed validate_playback_urls, and send them the header.
    match delivery {
        MediaDelivery::Static => init.set_option("access-references", false)?,
        MediaDelivery::ValidatedHls => {
            init.set_option("access-references", true)?;
            init.set_option("demuxer-lavf-o", HLS_PROTOCOL_WHITELIST)?;
        }
    }
    Ok(())
}

/// The launch error for a failed handle: a curl guard failure is its own
/// typed refusal, never a generic initialization error.
pub(super) fn initialize_error(error: libmpv2::Error, curl_guard_failed: bool) -> MpvError {
    if curl_guard_failed {
        MpvError::RedirectGuard
    } else {
        MpvError::Initialize(safe_error(error))
    }
}

// Decided from the probed runtime, never from a failed `set_option`: on
// `LavfAndCurl` a failure here fails the launch.
pub(super) fn refuse_curl_backend(init: &MpvInitializer, http: HttpStacks) -> libmpv2::Result<()> {
    match http {
        HttpStacks::LavfOnly => Ok(()),
        HttpStacks::LavfAndCurl => {
            init.set_option(CURL_ENABLED, false)?;
            init.set_option(CURL_MAX_REDIRECTS, 0i64)
        }
    }
}

// Per-file options for the validated master playlist: only FFmpeg's `hls`
// demuxer may read it. Without them a failed `hls` open falls back to mpv's
// playlist demuxer, which turns the variant and its segments into playlist
// entries opened as top-level files with references on.
const HLS_FILE_OPTIONS: &str = "demuxer=lavf,demuxer-lavf-format=hls";

/// Loads a validated original-file URL on a `MediaDelivery::Static` handle.
/// With `load_validated_hls`, the only `loadfile` in production code
/// (`media_tests::loadfile_is_issued_only_by_the_two_typed_loaders`).
pub(super) fn load_static(mpv: &Mpv, url: &str) -> libmpv2::Result<()> {
    mpv.command("loadfile", &[url, "replace"])
}

/// Loads the loopback master of a validated session on a
/// `MediaDelivery::ValidatedHls` handle.
pub(super) fn load_validated_hls(mpv: &Mpv, session: &HlsSession) -> libmpv2::Result<()> {
    // loadfile <url> <flags> <index> <options> (mpv 0.38+; -1 means none).
    mpv.command(
        "loadfile",
        &[session.playlist_url(), "replace", "-1", HLS_FILE_OPTIONS],
    )
}

/// Clears the per-file `hls` format once the master is open, so `sub-add`
/// can open the loopback subtitle copies. Call it after `FileLoaded` and
/// before `sub-add`; `demuxer=lavf` stays for the file.
pub(super) fn allow_subtitle_formats(mpv: &Mpv) -> libmpv2::Result<()> {
    mpv.set_property("file-local-options/demuxer-lavf-format", "")
}

/// Sends the signed-in header with every HTTP request this handle makes: the
/// stream and each `sub-add` subtitle (mpv builds FFmpeg's `headers` option
/// from `http-header-fields` for every network open). The handle lives for
/// one session, so the header is gone once the session ends.
pub(super) fn set_media_authorization(
    init: &MpvInitializer,
    authorization: &MediaBrowserAuthorization,
) -> libmpv2::Result<()> {
    init.set_option(
        "http-header-fields",
        escape_list_item(&format!("Authorization: {}", authorization.expose())),
    )
}

// mpv splits string-list options on commas, and the MediaBrowser header has
// several. A backslash right before a comma keeps it in the item and is itself
// removed (`get_nextsep` in mpv `options/m_option.c`); other backslashes stay.
fn escape_list_item(item: &str) -> String {
    item.replace(',', "\\,")
}

// Query names Jellyfin accepts as a token, compared in lower case.
pub(super) const CREDENTIAL_QUERY_NAMES: [&str; 5] =
    ["apikey", "api_key", "access_token", "token", "x-emby-token"];

pub(super) fn has_credential_query(url: &url::Url) -> bool {
    url.query_pairs()
        .any(|(name, _)| CREDENTIAL_QUERY_NAMES.contains(&name.to_ascii_lowercase().as_str()))
}

pub(super) fn validate_playback_urls(request: &LaunchRequest) -> Result<(), MpvError> {
    let stream_url =
        parse_allowed_url(&request.plan.stream_url).ok_or(MpvError::UnsafeStreamUrl)?;
    if has_credential_query(&stream_url) {
        return Err(MpvError::CredentialInUrl);
    }
    for track in request
        .plan
        .tracks
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
    {
        let Some(delivery_url) = track.delivery_url.as_deref() else {
            continue;
        };
        let subtitle_url = parse_allowed_url(delivery_url).ok_or(MpvError::UnsafeSubtitleUrl)?;
        if subtitle_url.origin() != stream_url.origin() {
            return Err(MpvError::UnsafeSubtitleUrl);
        }
        if has_credential_query(&subtitle_url) {
            return Err(MpvError::CredentialInUrl);
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "network_curl_tests.rs"]
mod curl_tests;

#[cfg(test)]
#[path = "network_tests.rs"]
mod tests;
