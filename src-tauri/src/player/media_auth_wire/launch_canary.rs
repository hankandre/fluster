//! P10-04 acceptance 6 (decision 0002, E2): a server that writes the token
//! into a playlist or subtitle body fails the launch closed, before any mpv
//! handle exists (so no player event or diagnostic can exist), and the token
//! reaches no log, error, or UI text.

use super::*;
use crate::command_allowlist::collect_rust_files;
use crate::player::hls::HlsError;
use crate::player::media::LaunchMedia;
use crate::player::test_http::{serve_routes, Route};
use crate::player::test_support::hls_launch_request;
use crate::player::MpvError;
use crate::redaction::safe_error;
use std::path::Path;

const CANARY: &str = "CANARY-b71e4d0a9c";
const ITEM: &str = "0123456789abcdef0123456789abcdef";
const PLAYLIST: &str = "application/vnd.apple.mpegurl";

fn canary_authorization() -> MediaBrowserAuthorization {
    MediaBrowserAuthorization::parse(&format!(
        "MediaBrowser Client=\"Fluster\", Device=\"Test\", DeviceId=\"d\", Version=\"0\", Token=\"{CANARY}\""
    ))
    .expect("valid canary header")
}

fn percent_encoded(text: &str) -> String {
    text.bytes().map(|byte| format!("%{byte:02X}")).collect()
}

fn assert_clean(label: &str, text: &str) {
    let lower = text.to_ascii_lowercase();
    assert!(
        !lower.contains(&CANARY.to_ascii_lowercase()) && !text.contains(&percent_encoded(CANARY)),
        "the canary leaked through {label}: {text}"
    );
}

fn media_body(segment: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:1\n\
         #EXTINF:1,\n{segment}\n#EXT-X-ENDLIST\n"
    )
}

#[test]
fn redaction_canary_in_a_playlist_body_fails_the_launch_closed() {
    let master_path = format!("/videos/{ITEM}/master.m3u8");
    let main_path = format!("/videos/{ITEM}/main.m3u8");
    let subtitle_path = format!("/videos/{ITEM}/m/Subtitles/3/0/Stream.srt");
    let plain_master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8\n".to_string();
    let plain_media = media_body("hls1/main/0.mp4");
    // (label, master, media playlist, subtitle body)
    let cases = [
        (
            "trickplay playlist with ApiKey (EnableTrickplay ignored)",
            format!(
                "{plain_master}#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,URI=\"Trickplay/320/tiles.m3u8?ApiKey={CANARY}\"\n"
            ),
            plain_media.clone(),
            None,
        ),
        (
            "variant URI with api_key",
            format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8?api_key={CANARY}\n"),
            plain_media.clone(),
            None,
        ),
        (
            "segment URI with X-Emby-Token",
            plain_master.clone(),
            media_body(&format!("hls1/main/0.mp4?X-Emby-Token={CANARY}")),
            None,
        ),
        (
            "bare token in session data",
            format!("{plain_master}#EXT-X-SESSION-DATA:DATA-ID=\"x\",VALUE=\"{CANARY}\"\n"),
            plain_media.clone(),
            None,
        ),
        (
            "percent-encoded token in a segment path",
            plain_master.clone(),
            media_body(&format!("hls1/{}/0.mp4", percent_encoded(CANARY))),
            None,
        ),
        (
            "token echoed in a subtitle",
            plain_master.clone(),
            plain_media.clone(),
            Some(format!(
                "1\r\n00:00:00,000 --> 00:00:01,000\r\n{CANARY}\r\n\r\n"
            )),
        ),
    ];
    for (label, master, media, subtitle) in cases {
        let (server, origin) = listener();
        let mut routes = vec![
            (master_path.clone(), Route::ok(PLAYLIST, master)),
            (main_path.clone(), Route::ok(PLAYLIST, media)),
        ];
        let mut subtitles = Vec::new();
        if let Some(body) = subtitle {
            routes.push((subtitle_path.clone(), Route::ok("text/plain", body)));
            subtitles.push(format!("{origin}{subtitle_path}"));
        }
        let requests = serve_routes(server, routes);
        let master_url =
            format!("{origin}{master_path}?MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false");
        let mut request = hls_launch_request(&origin, &master_url, ITEM, &subtitles);
        request.authorization = canary_authorization();

        let error = match LaunchMedia::prepare(&request) {
            Err(error) => error,
            Ok(_) => panic!("{label}: the launch did not fail closed"),
        };
        assert!(
            matches!(
                error,
                MpvError::UnsafeConversion(HlsError::CredentialInPlaylist)
            ),
            "{label}: {error:?}"
        );
        // Errors: what `launch_playback` returns to the frontend, its Debug
        // form, and its redacted form.
        let message = error.to_string();
        assert_clean(&format!("{label}: error"), &message);
        assert_clean(&format!("{label}: Debug"), &format!("{error:?}"));
        assert_clean(&format!("{label}: safe_error"), &safe_error(&message));
        // Player events and diagnostics come only from a session's event
        // loop, which needs an mpv handle; the launch failed before one
        // existed, and mpv never ran: every server request is Rust's own.
        let heads = requests.lock().expect("requests mutex").clone();
        assert!(
            heads
                .iter()
                .all(|head| head.contains("\r\nuser-agent: Fluster\r\n")),
            "{label}: libmpv reached the server"
        );
    }
}

/// Logs: Fluster installs no logger (`logger_guard`), and no production code
/// on the converted path prints or traces anything, so neither a body nor a
/// URL can reach stderr.
#[test]
fn redaction_canary_the_converted_path_never_prints() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/player");
    let mut files = Vec::new();
    collect_rust_files(&root.join("hls"), &mut files);
    files.push(root.join("media.rs"));
    let production: Vec<_> = files
        .into_iter()
        .filter(|path| !path.to_string_lossy().ends_with("_tests.rs"))
        .collect();
    assert!(production.len() >= 9, "{production:?}");
    for path in production {
        let source = std::fs::read_to_string(&path).expect("readable source");
        for call in [
            "eprintln!",
            "eprint!",
            "println!",
            "print!",
            "dbg!",
            "native_trace",
            "log::",
            "tracing::",
        ] {
            assert!(!source.contains(call), "{}: {call}", path.display());
        }
    }
}
