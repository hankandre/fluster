//! Media URL checks and the network options libmpv accepts.

use super::super::test_support::{launch_request, probed_http_stacks, test_authorization};
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
    let error =
        validate_playback_urls(&cross_origin).expect_err("cross-origin subtitle must be rejected");
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
        "delivery": "static",
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
    let Some(http) = probed_http_stacks() else {
        return;
    };
    ensure_numeric_locale().expect("numeric locale");
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        harden_network_options(&init, MediaDelivery::Static, http)?;
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
    let tls_verify: bool = mpv.get_property("tls-verify").expect("tls-verify");
    assert!(tls_verify);
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
        let error =
            validate_playback_urls(&launch_request(stream, Some(subtitle))).expect_err(subtitle);
        assert!(matches!(error, MpvError::UnsafeSubtitleUrl));
    }
}
