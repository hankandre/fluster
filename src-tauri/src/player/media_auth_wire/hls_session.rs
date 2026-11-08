//! libmpv plays only what `HlsSession` validated: Rust fetches the server's
//! playlists, mpv reads the loopback copies, and mpv fetches the segments
//! from the server itself with the header (decision 0002 E1-B, P10-01).

use super::hls::{hls_player, hls_player_with, play_to_end, server_routes, Network, PLAYLIST};
use super::*;
use crate::player::hls::HlsSession;
use crate::player::test_http::{paths, serve_routes, Route};

const ITEM: &str = "0123456789abcdef0123456789abcdef";

fn is_rust_request(head: &str) -> bool {
    head.contains("\r\nuser-agent: Fluster\r\n")
}

#[test]
fn hls_validated_session_plays_and_every_server_request_carries_the_header() {
    let Some(mut mpv) = hls_player(Network::Production) else {
        return;
    };
    let (server, origin) = listener();
    let videos = format!("/videos/{ITEM}");
    let mut routes: Vec<(String, Route)> = server_routes()
        .into_iter()
        .map(|(path, route)| (format!("{videos}{path}"), route))
        .collect();
    routes.push((
        format!("{videos}/master.m3u8"),
        Route::ok(
            PLAYLIST,
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nmain.m3u8?PlaySessionId=p&EnableTrickplay=false\n",
        ),
    ));
    routes.push((
        format!("{videos}/main.m3u8"),
        Route::ok(
            PLAYLIST,
            "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n\
             #EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI=\"hls1/main/-1.mp4?PlaySessionId=p\"\n\
             #EXTINF:0.25, nodesc\nhls1/main/0.mp4?PlaySessionId=p\n\
             #EXTINF:0.25, nodesc\nhls1/main/1.mp4?PlaySessionId=p\n#EXT-X-ENDLIST\n",
        ),
    ));
    let requests = serve_routes(server, routes);
    let master_url = format!("{origin}{videos}/master.m3u8?PlaySessionId=p&EnableTrickplay=false");
    let session =
        HlsSession::open(&master_url, ITEM, &test_authorization()).expect("valid session");

    assert!(play_to_end(&mut mpv, session.playlist_url()));

    let heads = requests.lock().expect("requests mutex").clone();
    let fetched = paths(&requests);
    eprintln!("hls session server requests: {fetched:?}");
    let value = test_authorization().expose().to_string();
    for head in &heads {
        let target = head.split_whitespace().nth(1).unwrap_or("");
        let is_playlist = target.contains(".m3u8");
        if is_rust_request(head) {
            // ureq writes the field name in lower case.
            assert!(is_playlist, "Rust fetched a non-playlist: {target}");
            assert_eq!(
                authorization_lines(head),
                vec![format!("authorization: {value}").as_str()]
            );
        } else {
            assert!(!is_playlist, "libmpv read a server playlist: {target}");
            assert_single_exact_header(head);
        }
    }
    assert_eq!(heads.iter().filter(|head| is_rust_request(head)).count(), 2);
    for segment in ["-1.mp4", "0.mp4", "1.mp4"] {
        let path = format!("{videos}/hls1/main/{segment}?PlaySessionId=p");
        assert!(fetched.contains(&path), "libmpv never fetched {path}");
    }
}

/// Acceptance 6 (P10-01). `FLUSTER_HLS_SESSION_FILE` names a private JSON
/// file `{ "masterUrl", "itemId", "authorization" }`: a `master.m3u8` URL
/// rebuilt from a recorded `TranscodingUrl` with every credential removed
/// and `EnableTrickplay=false`. Plays to the first video frame with the
/// header only, on a fixture server.
#[test]
#[ignore = "needs a live Jellyfin fixture server"]
fn live_fixture_hls_session_plays_to_first_frame() {
    let path = std::env::var("FLUSTER_HLS_SESSION_FILE").expect("set FLUSTER_HLS_SESSION_FILE");
    let json: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(path).expect("read the session file"))
            .expect("JSON");
    let field = |name: &str| json[name].as_str().expect(name).to_string();
    let authorization =
        MediaBrowserAuthorization::parse(&field("authorization")).expect("a MediaBrowser header");
    let session = HlsSession::open(&field("masterUrl"), &field("itemId"), &authorization)
        .expect("the server's playlists pass validation");
    let Some(mut mpv) = hls_player_with(Network::Production, &authorization) else {
        return;
    };
    mpv.command("loadfile", &[session.playlist_url(), "replace"])
        .expect("loadfile");
    assert!(matches!(
        wait_for(&mut mpv, |event| matches!(event, Event::PlaybackRestart)),
        LoadOutcome::Loaded
    ));
    let width: i64 = mpv
        .get_property("video-params/w")
        .expect("a decoded video frame");
    let codec: String = mpv.get_property("video-codec").unwrap_or_default();
    let format: String = mpv.get_property("file-format").unwrap_or_default();
    eprintln!("live hls first frame: width {width}, codec {codec}, file-format {format}");
    assert!(width > 0);
}
