//! Network hardening, the media Authorization header, and media URL checks.

use super::hls::HlsSession;
use super::MpvError;
use crate::auth_header::MediaBrowserAuthorization;
use crate::model::LaunchRequest;
use crate::url_policy::parse_allowed_url;
use libmpv2::{Mpv, MpvInitializer};

// FFmpeg http protocol AVOptions (libavformat/http.c, FFmpeg 6.1 and 7.1+).
// FFmpeg re-sends custom headers to every redirect target, whatever its
// origin, so redirects are refused. It also tunnels through the `http_proxy`
// environment variable unless the option is set; any value that does not
// start with `http://` turns the proxy off (http.c `http_open_cnx_internal`).
const STREAM_LAVF_OPTIONS: &str = "max_redirects=0,http_proxy=direct://";
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
    #[cfg_attr(not(test), allow(dead_code))]
    ValidatedHls,
}

pub(super) fn harden_network_options(
    init: &MpvInitializer,
    delivery: MediaDelivery,
) -> libmpv2::Result<()> {
    init.set_option("stream-lavf-o", STREAM_LAVF_OPTIONS)?;
    // The builtin ytdl_hook script retries a failed load by running yt-dlp
    // with the full stream URL as a process argument.
    init.set_option("ytdl", false)?;
    // The Authorization header goes to every network open on this handle.
    // Without this, a playlist, EDL, or HLS body served as the "movie" (or as
    // a subtitle) makes mpv or FFmpeg open the URLs inside it, which never
    // passed validate_playback_urls, and send them the header.
    match delivery {
        MediaDelivery::Static => init.set_option("access-references", false),
        MediaDelivery::ValidatedHls => {
            init.set_option("access-references", true)?;
            init.set_option("demuxer-lavf-o", HLS_PROTOCOL_WHITELIST)
        }
    }
}

// Per-file options for the validated master playlist: only FFmpeg's `hls`
// demuxer may read it. Without them a failed `hls` open falls back to mpv's
// playlist demuxer, which turns the variant and its segments into playlist
// entries opened as top-level files with references on.
const HLS_FILE_OPTIONS: &str = "demuxer=lavf,demuxer-lavf-format=hls";

/// Loads the loopback master of a validated session on a
/// `MediaDelivery::ValidatedHls` handle.
#[cfg_attr(not(test), allow(dead_code))]
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
#[cfg_attr(not(test), allow(dead_code))]
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
mod tests {
    use super::super::test_support::{launch_request, test_authorization};
    use super::super::version::ensure_numeric_locale;
    use super::*;
    use libmpv2::Mpv;

    #[test]
    fn media_urls_allow_https_and_loopback_or_private_lan_http() {
        for stream_url in [
            "https://media.example/Videos/1/stream?Static=true&MediaSourceId=s&PlaySessionId=p",
            "http://localhost:8096/video.mkv",
            "http://127.0.0.1:8096/video.mkv",
            "http://127.12.34.56:8096/video.mkv",
            "http://[::1]:8096/video.mkv",
            "http://192.168.1.5:8096/video.mkv?Static=true",
            "http://10.0.0.7/video.mkv",
            "http://172.16.0.2/video.mkv",
            "http://169.254.3.4/video.mkv",
            "http://[fd00::5]:8096/video.mkv",
            "http://[fe80::5]:8096/video.mkv",
            "http://nas.local:8096/video.mkv",
            "http://jellyfin.home.arpa/video.mkv",
        ] {
            assert!(validate_playback_urls(&launch_request(stream_url, None)).is_ok());
        }
    }

    #[test]
    fn media_urls_reject_plaintext_public_hosts_and_embedded_credentials() {
        for stream_url in [
            "http://media.example/video.mkv?api_key=secret",
            "http://localhost.example/video.mkv",
            "http://100.64.0.1:8096/video.mkv",
            "http://8.8.8.8/video.mkv",
            "http://[::ffff:8.8.8.8]/video.mkv",
            "http://jellyfin.lan/video.mkv",
            "http://192.168.1.5.nip.io/video.mkv",
            "https://user:password@media.example/video.mkv",
            "https://media.example/video.mkv#fragment",
            "file:///tmp/video.mkv",
        ] {
            let error = validate_playback_urls(&launch_request(stream_url, None))
                .expect_err("unsafe stream must be rejected");
            assert!(matches!(error, MpvError::UnsafeStreamUrl));
            assert!(!error.to_string().contains("secret"));
            assert!(!error.to_string().contains("password"));
        }
    }

    #[test]
    fn external_subtitles_must_share_the_stream_origin() {
        let same_origin = launch_request(
            "https://media.example/video.mkv",
            Some("https://media.example/subtitle.ass?format=ass"),
        );
        assert!(validate_playback_urls(&same_origin).is_ok());

        let cross_origin = launch_request(
            "https://media.example/video.mkv",
            Some("https://cdn.example/subtitle.ass?api_key=subtitle-secret"),
        );
        let error = validate_playback_urls(&cross_origin)
            .expect_err("cross-origin subtitle must be rejected");
        assert!(matches!(error, MpvError::UnsafeSubtitleUrl));
        assert!(!error.to_string().contains("stream-secret"));
        assert!(!error.to_string().contains("subtitle-secret"));
    }

    #[test]
    fn media_urls_must_not_carry_a_credential_in_any_case() {
        for key in [
            "api_key",
            "ApiKey",
            "apikey",
            "API_KEY",
            "access_token",
            "Token",
            "token",
            "X-Emby-Token",
            "x-emby-token",
        ] {
            let stream = format!("https://media.example/Videos/1/stream?Static=true&{key}=secret");
            let error = validate_playback_urls(&launch_request(&stream, None))
                .expect_err("a stream URL credential must be rejected");
            assert!(matches!(error, MpvError::CredentialInUrl), "{key}");

            let subtitle = format!("https://media.example/Subtitles/0/Stream.srt?{key}=secret");
            let error = validate_playback_urls(&launch_request(
                "https://media.example/video.mkv",
                Some(&subtitle),
            ))
            .expect_err("a subtitle URL credential must be rejected");
            assert!(matches!(error, MpvError::CredentialInUrl), "{key}");
            assert!(!error.to_string().contains("secret"));
        }
        // Names that only contain a credential word are not credentials.
        assert!(validate_playback_urls(&launch_request(
            "https://media.example/video.mkv?PlaySessionId=p&tokenless=1",
            None
        ))
        .is_ok());
    }

    #[test]
    fn launch_requests_require_a_valid_authorization_header() {
        let plan = serde_json::json!({
            "itemId": "item",
            "title": "Test video",
            "streamUrl": "https://media.example/video.mkv",
            "mediaSourceId": "source",
            "playSessionId": "session",
            "startPositionTicks": 0,
            "tracks": [],
        });
        let valid: LaunchRequest = serde_json::from_value(serde_json::json!({
            "plan": plan,
            "authorization": test_authorization().expose(),
        }))
        .expect("a launch request with a header deserializes");
        assert_eq!(valid.authorization, test_authorization());
        assert!(!format!("{valid:?}").contains("header-secret"));

        for authorization in [
            serde_json::Value::Null,
            serde_json::json!("Bearer header-secret"),
            serde_json::json!("MediaBrowser Token=\"header-secret\"\r\nX-Injected: 1"),
        ] {
            let error = serde_json::from_value::<LaunchRequest>(serde_json::json!({
                "plan": plan,
                "authorization": authorization,
            }))
            .expect_err("an invalid header must be rejected");
            assert!(!error.to_string().contains("header-secret"));
        }
        let missing = serde_json::from_value::<LaunchRequest>(serde_json::json!({ "plan": plan }));
        assert!(missing.is_err());
    }

    #[test]
    fn libmpv_accepts_the_network_hardening_options() {
        ensure_numeric_locale().expect("numeric locale");
        let created = Mpv::with_initializer(|init| {
            init.set_option("config", false)?;
            init.set_option("vo", "null")?;
            init.set_option("ao", "null")?;
            harden_network_options(&init, MediaDelivery::Static)?;
            set_media_authorization(&init, &test_authorization())
        });
        // CI's Ubuntu 22.04 runner ships libmpv 0.34, older than the API this
        // crate links. Only that mismatch is skipped; mpv 0.41+ runs the test.
        let mpv = match created {
            Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
                eprintln!("SKIP libmpv_accepts_the_network_hardening_options: loaded libmpv API {loaded:#x} is older than linked {linked:#x}");
                return;
            }
            other => other.expect("libmpv accepts the options"),
        };
        let lavf_options: String = mpv.get_property("stream-lavf-o").expect("stream-lavf-o");
        assert_eq!(lavf_options, STREAM_LAVF_OPTIONS);
        let ytdl: bool = mpv.get_property("ytdl").expect("ytdl");
        assert!(!ytdl);
        let access_references: bool = mpv
            .get_property("access-references")
            .expect("access-references");
        assert!(!access_references);
        let headers: String = mpv
            .get_property("http-header-fields")
            .expect("http-header-fields");
        assert_eq!(
            headers,
            format!("Authorization: {}", test_authorization().expose())
        );
    }

    #[test]
    fn private_lan_subtitles_must_share_the_stream_scheme_host_and_port() {
        let stream = "http://192.168.1.5:8096/video.mkv?Static=true";
        assert!(validate_playback_urls(&launch_request(
            stream,
            Some("http://192.168.1.5:8096/subtitle.ass")
        ))
        .is_ok());
        for subtitle in [
            "https://192.168.1.5:8096/subtitle.ass",
            "http://192.168.1.5:8920/subtitle.ass",
            "http://192.168.1.6:8096/subtitle.ass",
            "http://media.example:8096/subtitle.ass",
        ] {
            let error = validate_playback_urls(&launch_request(stream, Some(subtitle)))
                .expect_err(subtitle);
            assert!(matches!(error, MpvError::UnsafeSubtitleUrl));
        }
    }
}
