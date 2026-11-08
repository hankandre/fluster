//! libmpv plays only what `HlsSession` validated: Rust fetches the server's
//! playlists and subtitles, mpv reads the loopback copies through the `hls`
//! demuxer only, and mpv fetches the segments from the server itself with
//! the header (decision 0002 E1-B, P10-01).

use super::hls::{hls_player, server_routes, Network, PLAYLIST};
use super::*;
use crate::model::{HlsMediaKind, MediaTrack};
use crate::player::hls::{HlsRequest, HlsSession};
use crate::player::network::{allow_subtitle_formats, load_validated_hls};
use crate::player::test_http::{paths, serve_routes, Route};
use crate::player::track_list::load_external_subtitles;

const ITEM: &str = "0123456789abcdef0123456789abcdef";

fn is_rust_request(head: &str) -> bool {
    head.contains("\r\nuser-agent: Fluster\r\n")
}

fn open_session(origin: &str, routes_master: &str, subtitles: &[String]) -> HlsSession {
    let authorization = test_authorization();
    HlsSession::open(&HlsRequest {
        server_url: origin,
        master_url: routes_master,
        item_id: ITEM,
        media_source_id: "m",
        play_session_id: "p",
        media_kind: HlsMediaKind::Videos,
        subtitle_urls: subtitles,
        authorization: &authorization,
    })
    .expect("valid session")
}

struct Played {
    loaded: bool,
    start_files: usize,
}

/// Loads the session as production will and waits for the end, then a
/// little longer, so a fallback that starts further entries is seen.
fn play_validated(mpv: &mut Mpv, session: &HlsSession, forced: bool) -> Played {
    if forced {
        load_validated_hls(mpv, session).expect("loadfile");
    } else {
        mpv.command("loadfile", &[session.playlist_url(), "replace"])
            .expect("loadfile");
    }
    let mut played = Played {
        loaded: false,
        start_files: 0,
    };
    let mut deadline = Instant::now() + Duration::from_secs(15);
    let mut ended = false;
    while Instant::now() < deadline {
        match mpv.wait_event(0.1) {
            Some(Ok(Event::StartFile)) => played.start_files += 1,
            Some(Ok(Event::FileLoaded)) => played.loaded = true,
            Some(Ok(Event::EndFile(_))) | Some(Err(_)) if !ended => {
                ended = true;
                deadline = Instant::now() + Duration::from_millis(2500);
            }
            _ => {}
        }
    }
    assert!(
        ended,
        "libmpv neither finished nor failed the HLS file in time"
    );
    played
}

fn videos() -> String {
    format!("/videos/{ITEM}")
}

fn master_route() -> (String, Route) {
    (
        format!("{}/master.m3u8", videos()),
        Route::ok(
            PLAYLIST,
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000\nmain.m3u8?PlaySessionId=p&EnableTrickplay=false\n",
        ),
    )
}

fn master_url(origin: &str) -> String {
    format!(
        "{origin}{}/master.m3u8?MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false",
        videos()
    )
}

#[test]
fn hls_validated_session_plays_and_every_server_request_carries_the_header() {
    let Some(mut mpv) = hls_player(Network::Production) else {
        return;
    };
    let (server, origin) = listener();
    let videos = videos();
    let mut routes: Vec<(String, Route)> = server_routes()
        .into_iter()
        .map(|(path, route)| (format!("{videos}{path}"), route))
        .collect();
    routes.push(master_route());
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
    let session = open_session(&origin, &master_url(&origin), &[]);

    let played = play_validated(&mut mpv, &session, true);
    assert!(played.loaded);
    assert_eq!(played.start_files, 1);

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

/// Review probe, kept as a regression test. A server makes the `hls` open
/// fail (segment 0 cannot be probed, or every segment is a playlist) and
/// serves an HLS playlist naming another origin as a segment body. With a
/// plain `loadfile`, mpv falls back to its playlist demuxer, plays each
/// segment as a top-level file with references on, and the header reaches
/// the other origin. `load_validated_hls` confines the load to FFmpeg's
/// `hls` demuxer, whose segment demuxers may not open anything.
#[test]
fn hls_failed_hls_open_never_falls_back_to_playlist_entries() {
    for (mode, forced, expect_leak) in [
        ("garbage first segment", true, false),
        ("playlist segments", true, false),
        ("garbage first segment", false, true),
    ] {
        let Some(mut mpv) = hls_player(Network::Production) else {
            return;
        };
        let (evil, evil_origin) = listener();
        let evil_requests = serve_routes(evil, vec![]);
        let (server, origin) = listener();
        let videos = videos();
        let hostile = format!(
            "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:1,\n{evil_origin}/steal.ts\n#EXT-X-ENDLIST\n"
        );
        let first = if mode == "playlist segments" {
            Route::ok(PLAYLIST, hostile.clone())
        } else {
            Route::ok("video/mp2t", vec![0u8; 16])
        };
        let routes = vec![
            master_route(),
            (
                format!("{videos}/main.m3u8"),
                Route::ok(
                    PLAYLIST,
                    "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:1\n\
                     #EXTINF:1,\nhls1/main/0.ts?PlaySessionId=p\n\
                     #EXTINF:1,\nhls1/main/1.ts?PlaySessionId=p\n#EXT-X-ENDLIST\n",
                ),
            ),
            (format!("{videos}/hls1/main/0.ts"), first),
            (
                format!("{videos}/hls1/main/1.ts"),
                Route::ok(PLAYLIST, hostile),
            ),
        ];
        let _requests = serve_routes(server, routes);
        let session = open_session(&origin, &master_url(&origin), &[]);

        let played = play_validated(&mut mpv, &session, forced);
        thread::sleep(Duration::from_millis(300));
        let leaked = evil_requests.lock().expect("requests mutex").len();
        eprintln!(
            "hls fallback probe ({mode}, forced {forced}): other origin requests {leaked}, start-file events {}",
            played.start_files
        );
        assert_eq!(leaked > 0, expect_leak, "{mode}, forced {forced}");
        if forced {
            assert_eq!(played.start_files, 1, "{mode}");
            let count: i64 = mpv.get_property("playlist-count").expect("playlist-count");
            assert!(count <= 1, "{mode}: playlist expanded to {count} entries");
        }
    }
}

/// Subtitles on an HLS handle come from Rust's loopback copy: they load
/// with `sub-add`, and the server sees only Rust's fetch.
#[test]
fn hls_loopback_subtitles_load_on_an_hls_handle() {
    let Some(mut mpv) = hls_player(Network::Production) else {
        return;
    };
    let (server, origin) = listener();
    let videos = videos();
    let mut routes: Vec<(String, Route)> = server_routes()
        .into_iter()
        .map(|(path, route)| (format!("{videos}{path}"), route))
        .collect();
    routes.push(master_route());
    routes.push((
        format!("{videos}/main.m3u8"),
        Route::ok(
            PLAYLIST,
            super::hls::media_playlist(&format!("{origin}{videos}")),
        ),
    ));
    let subtitle_path = format!("{videos}/m/Subtitles/2/0/Stream.srt");
    routes.push((
        subtitle_path.clone(),
        Route::ok(
            "text/plain",
            "1\r\n00:00:00,000 --> 00:00:00,400\r\nHello\r\n\r\n",
        ),
    ));
    let requests = serve_routes(server, routes);
    let subtitles = vec![format!("{origin}{subtitle_path}")];
    let session = open_session(&origin, &master_url(&origin), &subtitles);

    load_validated_hls(&mpv, &session).expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
    let format: String = mpv.get_property("file-format").expect("file-format");
    assert_eq!(format, "hls");
    let forced: String = mpv
        .get_property("file-local-options/demuxer-lavf-format")
        .expect("file-local format");
    assert_eq!(forced, "hls");
    allow_subtitle_formats(&mpv).expect("clear the per-file format");
    let track = MediaTrack {
        index: 2,
        kind: "Subtitle".into(),
        display_title: "English".into(),
        codec: Some("subrip".into()),
        language: Some("eng".into()),
        external: true,
        delivery_url: session.subtitle_urls()[0].clone(),
    };
    assert_eq!(load_external_subtitles(&mpv, &[track]), vec![2]);
    let subtitle_fetches: Vec<_> = paths(&requests)
        .into_iter()
        .filter(|path| path.contains("Subtitles"))
        .collect();
    assert_eq!(subtitle_fetches.len(), 1, "{subtitle_fetches:?}");
}
