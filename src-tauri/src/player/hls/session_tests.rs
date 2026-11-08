//! `HlsSession` against loopback servers: every request Rust makes, what
//! the loopback copy serves, and that nothing reaches a second origin.

use super::fetch::MAX_PLAYLIST_BYTES;
use super::{HlsError, HlsRequest, HlsSession};
use crate::player::test_http::{
    authorization_lines, listener, paths, serve_routes, Requests, Route,
};
use crate::player::test_support::test_authorization;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;

pub(super) const ITEM: &str = "0123456789abcdef0123456789abcdef";
pub(super) const PLAYLIST: &str = "application/vnd.apple.mpegurl";
pub(super) const MASTER_PATH: &str = "/videos/0123456789abcdef0123456789abcdef/master.m3u8";
pub(super) const MAIN_PATH: &str = "/videos/0123456789abcdef0123456789abcdef/main.m3u8";

pub(super) fn open_with(
    server: &str,
    master: &str,
    item: &str,
    subtitles: &[String],
) -> Result<HlsSession, HlsError> {
    let authorization = test_authorization();
    HlsSession::open(&HlsRequest {
        server_url: server,
        master_url: master,
        item_id: item,
        subtitle_urls: subtitles,
        authorization: &authorization,
    })
}

/// Opens a session whose signed-in server is the master URL's own origin.
fn open(master: &str) -> Result<HlsSession, HlsError> {
    let server = url::Url::parse(master)
        .map(|url| url.origin().ascii_serialization())
        .unwrap_or_default();
    open_with(&server, master, ITEM, &[])
}

pub(super) fn master_url(origin: &str) -> String {
    format!(
        "{origin}{MASTER_PATH}?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false"
    )
}

pub(super) fn jellyfin_master() -> String {
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS=\"mp4a.40.2\"\nmain.m3u8?DeviceId=d&PlaySessionId=p&EnableTrickplay=false\n".into()
}

pub(super) fn jellyfin_media(map: &str, segment: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-MEDIA-SEQUENCE:0\n\
         #EXT-X-MAP:URI=\"{map}\"\n#EXTINF:0.25, nodesc\n{segment}\n#EXT-X-ENDLIST\n"
    )
}

/// ureq writes field names in lower case (`http` crate `HeaderName`); names
/// are case-insensitive (RFC 9110 §5.1), and the value must match exactly.
fn assert_exact_header_on_every_request(requests: &Requests) {
    let expected = format!("authorization: {}", test_authorization().expose());
    let requests = requests.lock().expect("requests mutex").clone();
    assert!(!requests.is_empty());
    for head in &requests {
        assert_eq!(authorization_lines(head), vec![expected.as_str()], "{head}");
    }
}

/// A raw GET to the loopback copy, as FFmpeg would send it.
pub(super) fn loopback_get(url: &str) -> (String, String) {
    let rest = url.strip_prefix("http://").expect("loopback http URL");
    let (address, path) = rest.split_once('/').expect("a path");
    let mut stream = TcpStream::connect(address).expect("connect to loopback");
    write!(
        stream,
        "GET /{path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n"
    )
    .expect("write");
    let mut response = String::new();
    stream.read_to_string(&mut response).expect("read");
    let (head, body) = response.split_once("\r\n\r\n").expect("a response");
    (
        head.lines().next().unwrap_or("").to_string(),
        body.to_string(),
    )
}

#[test]
fn hls_session_fetches_with_the_header_and_serves_validated_copies_on_loopback() {
    let (server, origin) = listener();
    let requests = serve_routes(
        server,
        vec![
            (MASTER_PATH.into(), Route::ok(PLAYLIST, jellyfin_master())),
            (
                MAIN_PATH.into(),
                Route::ok(
                    PLAYLIST,
                    jellyfin_media(
                        "hls1/main/-1.mp4?PlaySessionId=p",
                        "hls1/main/0.mp4?PlaySessionId=p",
                    ),
                ),
            ),
        ],
    );
    let session = open(&master_url(&origin)).expect("valid session");

    assert_exact_header_on_every_request(&requests);
    let fetched = paths(&requests);
    assert_eq!(fetched.len(), 2, "{fetched:?}");
    assert!(fetched[0].starts_with(MASTER_PATH) && fetched[1].starts_with(MAIN_PATH));
    for head in requests.lock().expect("requests mutex").iter() {
        assert!(head.contains("\r\nuser-agent: Fluster\r\n"), "{head}");
    }

    let playlist_url = session.playlist_url().to_string();
    assert!(playlist_url.starts_with("http://127.0.0.1:"));
    let prefix = playlist_url.split('/').nth(3).expect("a random prefix");
    assert_eq!(prefix.len(), 32);
    assert!(prefix
        .chars()
        .all(|character| character.is_ascii_hexdigit()));

    let (status, master) = loopback_get(&playlist_url);
    assert_eq!(status, "HTTP/1.1 200 OK");
    let variant_url = playlist_url.replace("master.m3u8", "0.m3u8");
    assert_eq!(
        master,
        format!(
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS=\"mp4a.40.2\"\n{variant_url}\n"
        )
    );
    let (status, media) = loopback_get(&variant_url);
    assert_eq!(status, "HTTP/1.1 200 OK");
    let base = format!("{origin}/videos/{ITEM}");
    assert_eq!(
        media,
        jellyfin_media(
            &format!("{base}/hls1/main/-1.mp4?PlaySessionId=p"),
            &format!("{base}/hls1/main/0.mp4?PlaySessionId=p")
        )
    );

    for wrong in [
        playlist_url.replace(prefix, &"0".repeat(32)),
        playlist_url.replace("master.m3u8", "1.m3u8"),
        format!("{playlist_url}?x=1"),
    ] {
        assert_eq!(loopback_get(&wrong).0, "HTTP/1.1 404 Not Found", "{wrong}");
    }
    // Rust fetched each playlist once; the loopback served the rest.
    assert_eq!(paths(&requests).len(), 2);

    let address = playlist_url.split('/').nth(2).expect("address").to_string();
    drop(session);
    thread::sleep(Duration::from_millis(100));
    assert!(
        TcpStream::connect(&address).is_err(),
        "the loopback server outlived its session"
    );
}

/// Acceptance 4: a cross-origin variant, segment, map, or key URI refuses
/// the playlist, and the second origin receives nothing.
#[test]
fn hls_session_refuses_cross_origin_uris_and_never_contacts_the_other_origin() {
    let (other, other_origin) = listener();
    let other_requests = serve_routes(
        other,
        vec![(
            "/main.m3u8".into(),
            Route::ok(PLAYLIST, jellyfin_media("init.mp4", "0.mp4")),
        )],
    );
    let cases = [
        (
            "variant",
            format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n{other_origin}/main.m3u8\n"),
            None,
        ),
        (
            "scheme-relative variant",
            format!(
                "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n{}/main.m3u8\n",
                other_origin.replace("http:", "")
            ),
            None,
        ),
        (
            "segment",
            jellyfin_master(),
            Some(jellyfin_media(
                "hls1/main/-1.mp4",
                &format!("{other_origin}/0.mp4"),
            )),
        ),
        (
            "map",
            jellyfin_master(),
            Some(jellyfin_media(
                &format!("{other_origin}/init.mp4"),
                "hls1/main/0.mp4",
            )),
        ),
        (
            "key",
            jellyfin_master(),
            Some(
                jellyfin_media("hls1/main/-1.mp4", "hls1/main/0.mp4").replace(
                    "#EXT-X-MAP",
                    &format!("#EXT-X-KEY:METHOD=AES-128,URI=\"{other_origin}/key\"\n#EXT-X-MAP"),
                ),
            ),
        ),
    ];
    for (label, master, media) in cases {
        let (server, origin) = listener();
        let mut routes = vec![(MASTER_PATH.to_string(), Route::ok(PLAYLIST, master))];
        if let Some(media) = media {
            routes.push((MAIN_PATH.into(), Route::ok(PLAYLIST, media)));
        }
        let requests = serve_routes(server, routes);
        let result = open(&master_url(&origin));
        assert_eq!(result.err(), Some(HlsError::UnsafeUri), "{label}");
        assert_exact_header_on_every_request(&requests);
    }
    thread::sleep(Duration::from_millis(100));
    assert!(
        other_requests.lock().expect("requests mutex").is_empty(),
        "the second origin was contacted"
    );
}

#[test]
fn hls_session_refuses_redirects_without_following_them() {
    let (other, other_origin) = listener();
    let other_requests = serve_routes(
        other,
        vec![(MAIN_PATH.into(), Route::ok(PLAYLIST, jellyfin_master()))],
    );
    for redirect_master in [true, false] {
        let (server, origin) = listener();
        let redirect = Route::redirect(format!("{other_origin}{MAIN_PATH}"));
        let routes = if redirect_master {
            vec![(MASTER_PATH.to_string(), redirect)]
        } else {
            vec![
                (
                    MASTER_PATH.to_string(),
                    Route::ok(PLAYLIST, jellyfin_master()),
                ),
                (MAIN_PATH.into(), redirect),
            ]
        };
        let requests = serve_routes(server, routes);
        let result = open(&master_url(&origin));
        assert_eq!(result.err(), Some(HlsError::Redirect));
        assert_exact_header_on_every_request(&requests);
    }
    thread::sleep(Duration::from_millis(100));
    assert!(
        other_requests.lock().expect("requests mutex").is_empty(),
        "a redirect was followed"
    );
}

#[test]
fn hls_session_fails_closed_on_credentials_status_and_size() {
    let canary_master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8?PlaySessionId=p\n\
                         #EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,URI=\"Trickplay/320/tiles.m3u8?ApiKey=canary-7f3a\"\n";
    let oversized = format!("#EXTM3U\n#{}", "x".repeat(MAX_PLAYLIST_BYTES as usize));
    let cases: [(Vec<(String, Route)>, HlsError); 4] = [
        (
            vec![(MASTER_PATH.into(), Route::ok(PLAYLIST, canary_master))],
            HlsError::CredentialInPlaylist,
        ),
        (
            vec![
                (MASTER_PATH.into(), Route::ok(PLAYLIST, jellyfin_master())),
                (
                    MAIN_PATH.into(),
                    Route::ok(
                        PLAYLIST,
                        jellyfin_media("i.mp4", "0.mp4?api_key=canary-7f3a"),
                    ),
                ),
            ],
            HlsError::CredentialInPlaylist,
        ),
        (vec![], HlsError::Status(404)),
        (
            vec![(MASTER_PATH.into(), Route::ok(PLAYLIST, oversized))],
            HlsError::TooLarge,
        ),
    ];
    for (routes, expected) in cases {
        let (server, origin) = listener();
        let _requests = serve_routes(server, routes);
        let error = open(&master_url(&origin))
            .err()
            .expect("the session must fail");
        assert_eq!(error, expected);
        assert!(!error.to_string().contains("canary"));
    }
}

#[test]
fn hls_master_urls_follow_the_hls_url_rules() {
    let origin = "http://192.168.1.5:8096";
    let good = master_url(origin);
    for (url, item) in [
        (good.clone(), "0123456789ABCDEF0123456789ABCDEF"),
        (
            good.replace("/videos/", "/Videos/")
                .replace("master.m3u8", "Master.m3u8"),
            ITEM,
        ),
        (good.replace("/videos/", "/audio/"), ITEM),
        (
            good.replace(ITEM, "01234567-89ab-cdef-0123-456789abcdef"),
            ITEM,
        ),
        (
            good.replace("EnableTrickplay=false", "enabletrickplay=False"),
            ITEM,
        ),
    ] {
        assert!(
            super::master_url::validate_master_url(&url, item).is_ok(),
            "{url}"
        );
    }
    for url in [
        good.replace("http://192.168.1.5", "http://8.8.8.8"),
        good.replace("http://", "http://user@"),
        good.replace("master.m3u8", "main.m3u8"),
        good.replace("master.m3u8", "x/master.m3u8"),
        good.replace(ITEM, "fedcba9876543210fedcba9876543210"),
        good.replace("/videos/", "/Audio/universal/"),
        good.replace("/videos/", "/items/"),
        good.replace("&EnableTrickplay=false", ""),
        good.replace("EnableTrickplay=false", "EnableTrickplay=true"),
        format!("{good}&EnableTrickplay=false"),
        format!("{good}&EnableSubtitlesInManifest=false"),
        format!("{good}&SubtitleMethod=Hls"),
        format!("{good}&ApiKey=secret"),
        format!("{good}&api_key=secret"),
        format!("{good}#fragment"),
        good.replace("http://", "file://"),
    ] {
        let error = open_with(origin, &url, ITEM, &[]).err();
        assert_eq!(error, Some(HlsError::UnsafeMasterUrl), "{url}");
    }
    assert_eq!(
        open_with(origin, &good, "", &[]).err(),
        Some(HlsError::UnsafeMasterUrl)
    );
    // The master must be on the signed-in server's origin.
    for server in [
        "http://192.168.1.6:8096",
        "https://192.168.1.5:8096",
        "http://192.168.1.5:8920",
        "not a url",
    ] {
        assert_eq!(
            open_with(server, &good, ITEM, &[]).err(),
            Some(HlsError::UnsafeMasterUrl),
            "{server}"
        );
    }
}
