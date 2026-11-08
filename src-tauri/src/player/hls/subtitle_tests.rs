//! External subtitles on converted sessions and the token-echo check.

use super::session_tests::{
    jellyfin_master, jellyfin_media, loopback_get, master_url, open_with, ITEM, MAIN_PATH,
    MASTER_PATH, PLAYLIST,
};
use super::subtitle::check_subtitle;
use super::uri::contains_secret;
use super::HlsError;
use crate::player::test_http::{authorization_lines, listener, paths, serve_routes, Route};
use crate::player::test_support::test_authorization;
use std::thread;
use std::time::Duration;

const SRT: &str = "1\r\n00:00:00,000 --> 00:00:00,400\r\nHello\r\n\r\n";
const SUBTITLE_PATH: &str = "/Videos/0123456789abcdef0123456789abcdef/m/Subtitles/2/0/Stream.srt";

#[test]
fn hls_subtitle_bodies_must_look_like_a_subtitle_and_name_no_reference() {
    for body in [
        SRT.as_bytes().to_vec(),
        b"\xEF\xBB\xBF1\n00:00:00,000 --> 00:00:01,000\nHi\n".to_vec(),
        b"WEBVTT\n\n00:00.000 --> 00:01.000\nHi\n".to_vec(),
        b"[Script Info]\nScriptType: v4.00+\n".to_vec(),
        b"{0}{25}Hello\n".to_vec(),
        b"PG\x00\x00\x00\x00\x00\x00\x00\x00\x16".to_vec(),
        b"  \n2\n00:00:01,000 --> 00:00:02,000\nhttp words are fine\n".to_vec(),
    ] {
        assert_eq!(check_subtitle(&body), Ok(()), "{body:?}");
    }
    for body in [
        "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXTINF:1,\nhttp://other.example/x.ts\n",
        "#EXTM3U\nhttp://other.example/x.wav\n",
        "# mpv EDL v0\nhttp://other.example/x.wav\n",
        "edl://http://other.example/x.wav",
        "[playlist]\nFile1=http://other.example/x.wav\n",
        "ffconcat version 1.0\nfile http://other.example/x.wav\n",
        "<ASX version=\"3.0\"><entry><ref href=\"http://other.example\"/></entry></ASX>",
        "1\n00:00:00,000 --> 00:00:01,000\n#EXT-X-MAP:URI=\"x\"\n",
        "http://other.example/x.wav\n",
        "",
        "<?xml version=\"1.0\"?><tt/>",
    ] {
        assert_eq!(
            check_subtitle(body.as_bytes()),
            Err(HlsError::UnsafeSubtitle),
            "{body:?}"
        );
    }
}

#[test]
fn hls_bodies_echoing_the_token_are_detected_in_any_case_or_encoding() {
    let token = "0a1b2c3d4e5f";
    for body in [
        "#EXTM3U\nmain.m3u8?x=0a1b2c3d4e5f\n",
        "#EXTM3U\n# 0A1B2C3D4E5F\n",
        "#EXTM3U\nmain.m3u8?x=%30a1b2c3d4e5f\n",
        "#EXTM3U\nmain.m3u8?x=%2530a1b2c3d4e5f\n",
    ] {
        assert!(contains_secret(body, token), "{body}");
    }
    assert!(!contains_secret("#EXTM3U\nmain.m3u8?x=0a1b2c\n", token));
    assert!(!contains_secret("anything", ""));
}

#[test]
fn hls_session_serves_checked_subtitles_from_loopback() {
    let (server, origin) = listener();
    let requests = serve_routes(
        server,
        vec![
            (MASTER_PATH.into(), Route::ok(PLAYLIST, jellyfin_master())),
            (
                MAIN_PATH.into(),
                Route::ok(
                    PLAYLIST,
                    jellyfin_media("hls1/main/-1.mp4", "hls1/main/0.mp4"),
                ),
            ),
            (SUBTITLE_PATH.into(), Route::ok("text/plain", SRT)),
        ],
    );
    let subtitles = vec![format!("{origin}{SUBTITLE_PATH}?PlaySessionId=p")];
    let session =
        open_with(&origin, &master_url(&origin), ITEM, &subtitles).expect("valid session");

    let served = session.subtitle_urls();
    assert_eq!(served.len(), 1);
    assert!(served[0].starts_with("http://127.0.0.1:") && served[0].ends_with("/sub0.srt"));
    let (status, body) = loopback_get(&served[0]);
    assert_eq!(status, "HTTP/1.1 200 OK");
    assert_eq!(body, SRT);
    let expected = format!("authorization: {}", test_authorization().expose());
    let heads = requests.lock().expect("requests mutex").clone();
    assert_eq!(heads.len(), 3);
    for head in &heads {
        assert_eq!(authorization_lines(head), vec![expected.as_str()], "{head}");
    }
}

#[test]
fn hls_session_refuses_unsafe_subtitles_and_token_echoes() {
    let (other, other_origin) = listener();
    let other_requests = serve_routes(
        other,
        vec![(SUBTITLE_PATH.into(), Route::ok("text/plain", SRT))],
    );
    let token = test_authorization().token().expect("a token").to_string();
    let reference_body = format!("#EXTM3U\n#EXTINF:1,\n{other_origin}/steal.ts\n");
    let cases = [
        // (subtitle path served, subtitle URL suffix or other origin, body, expected)
        (
            "cross-origin",
            true,
            String::new(),
            SRT.to_string(),
            HlsError::UnsafeSubtitleUrl,
        ),
        (
            "credential query",
            false,
            "?api_key=x".into(),
            SRT.into(),
            HlsError::UnsafeSubtitleUrl,
        ),
        (
            "playlist body",
            false,
            String::new(),
            reference_body,
            HlsError::UnsafeSubtitle,
        ),
        (
            "token echo",
            false,
            String::new(),
            format!("{SRT}{token}\n"),
            HlsError::CredentialInPlaylist,
        ),
    ];
    for (label, cross_origin, suffix, body, expected) in cases {
        let (server, origin) = listener();
        let _requests = serve_routes(
            server,
            vec![
                (MASTER_PATH.into(), Route::ok(PLAYLIST, jellyfin_master())),
                (
                    MAIN_PATH.into(),
                    Route::ok(
                        PLAYLIST,
                        jellyfin_media("hls1/main/-1.mp4", "hls1/main/0.mp4"),
                    ),
                ),
                (SUBTITLE_PATH.into(), Route::ok("text/plain", body)),
            ],
        );
        let host = if cross_origin { &other_origin } else { &origin };
        let subtitles = vec![format!("{host}{SUBTITLE_PATH}{suffix}")];
        let error = open_with(&origin, &master_url(&origin), ITEM, &subtitles).err();
        assert_eq!(error, Some(expected), "{label}");
    }
    // A playlist that echoes the token is refused too.
    let (server, origin) = listener();
    let echo = jellyfin_media("hls1/main/-1.mp4", &format!("hls1/main/0.mp4?x={token}"));
    let requests = serve_routes(
        server,
        vec![
            (MASTER_PATH.into(), Route::ok(PLAYLIST, jellyfin_master())),
            (MAIN_PATH.into(), Route::ok(PLAYLIST, echo)),
        ],
    );
    let error = open_with(&origin, &master_url(&origin), ITEM, &[]).err();
    assert_eq!(error, Some(HlsError::CredentialInPlaylist));
    assert_eq!(paths(&requests).len(), 2);
    thread::sleep(Duration::from_millis(100));
    assert!(other_requests.lock().expect("requests mutex").is_empty());
}
