//! What libmpv's HLS demuxer sends on nested opens: the header on every
//! playlist, map, and segment request, redirects, and the protocol whitelist.
//! These serve hand-written playlists straight to mpv, so they measure mpv
//! and FFmpeg themselves; `player::hls` tests cover Rust's validation.

use super::*;
use crate::player::network::MediaDelivery;
use crate::player::test_http::{paths, serve_routes, Route};

pub(super) const PLAYLIST: &str = "application/vnd.apple.mpegurl";

/// A WAV header for `silent_wav` (the `EXT-X-MAP` init section) and its
/// PCM body split into two media segments.
pub(super) fn wav_init_and_segments() -> (Vec<u8>, Vec<u8>, Vec<u8>) {
    let mut wav = silent_wav();
    let pcm = wav.split_off(44);
    let half = pcm.len() / 2;
    (wav, pcm[..half].to_vec(), pcm[half..].to_vec())
}

pub(super) fn media_playlist(server: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n\
         #EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI=\"{server}/hls1/main/-1.mp4?PlaySessionId=p\"\n\
         #EXTINF:0.25,\n{server}/hls1/main/0.mp4?PlaySessionId=p\n\
         #EXTINF:0.25,\n{server}/hls1/main/1.mp4?PlaySessionId=p\n#EXT-X-ENDLIST\n"
    )
}

pub(super) fn master_playlist(variant: &str) -> String {
    format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=128000,AVERAGE-BANDWIDTH=128000\n{variant}\n")
}

/// The server origin's routes: init section, two segments.
pub(super) fn server_routes() -> Vec<(String, Route)> {
    let (init, first, second) = wav_init_and_segments();
    vec![
        ("/hls1/main/-1.mp4".into(), Route::ok("video/mp4", init)),
        ("/hls1/main/0.mp4".into(), Route::ok("video/mp4", first)),
        ("/hls1/main/1.mp4".into(), Route::ok("video/mp4", second)),
    ]
}

pub(super) enum Network {
    /// The production options for a validated HLS session.
    Production,
    /// Production without `max_redirects=0`, to show the test can see a redirect.
    WithoutRedirectLimit,
    /// Production without the protocol whitelist.
    WithoutWhitelist,
}

pub(super) fn hls_player(network: Network) -> Option<Mpv> {
    hls_player_with(network, &test_authorization())
}

pub(super) fn hls_player_with(
    network: Network,
    authorization: &MediaBrowserAuthorization,
) -> Option<Mpv> {
    ensure_numeric_locale().expect("numeric locale");
    let created = Mpv::with_initializer(|init| {
        init.set_option("config", false)?;
        init.set_option("vo", "null")?;
        init.set_option("ao", "null")?;
        init.set_option("autoload-files", false)?;
        harden_network_options(&init, MediaDelivery::ValidatedHls)?;
        match network {
            Network::Production => {}
            Network::WithoutRedirectLimit => init.set_option("stream-lavf-o", "")?,
            Network::WithoutWhitelist => init.set_option("demuxer-lavf-o", "")?,
        }
        set_media_authorization(&init, authorization)
    });
    match created {
        Err(libmpv2::Error::VersionMismatch { linked, loaded }) => {
            eprintln!(
                "SKIP hls wire: loaded libmpv API {loaded:#x} is older than linked {linked:#x}"
            );
            None
        }
        other => Some(other.expect("libmpv starts headless")),
    }
}

/// Plays `url` until the file ends; true when it loaded and reached its end.
pub(super) fn play_to_end(mpv: &mut Mpv, url: &str) -> bool {
    mpv.command("loadfile", &[url, "replace"])
        .expect("loadfile");
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut loaded = false;
    while Instant::now() < deadline {
        match mpv.wait_event(0.2) {
            Some(Ok(Event::FileLoaded)) => loaded = true,
            Some(Ok(Event::EndFile(_))) => return loaded,
            Some(Err(_)) => return false,
            _ => {}
        }
    }
    panic!("libmpv neither finished nor failed the HLS file in time");
}

#[test]
fn hls_nested_opens_send_exactly_the_typed_header() {
    let Some(mut mpv) = hls_player(Network::Production) else {
        return;
    };
    let (server, server_origin) = listener();
    let server_requests = serve_routes(server, server_routes());
    let (local, local_origin) = listener();
    let local_requests = serve_routes(
        local,
        vec![
            (
                "/s/master.m3u8".into(),
                Route::ok(
                    PLAYLIST,
                    master_playlist(&format!("{local_origin}/s/v0.m3u8")),
                ),
            ),
            (
                "/s/v0.m3u8".into(),
                Route::ok(PLAYLIST, media_playlist(&server_origin)),
            ),
        ],
    );

    assert!(play_to_end(
        &mut mpv,
        &format!("{local_origin}/s/master.m3u8")
    ));

    let local_paths = paths(&local_requests);
    let server_paths = paths(&server_requests);
    eprintln!("hls loopback requests: {local_paths:?}; server requests: {server_paths:?}");
    assert!(local_paths.iter().any(|path| path == "/s/v0.m3u8"));
    for segment in ["/hls1/main/-1.mp4", "/hls1/main/0.mp4", "/hls1/main/1.mp4"] {
        assert!(
            server_paths.iter().any(|path| path.starts_with(segment)),
            "{segment} was never requested: {server_paths:?}"
        );
    }
    let local_requests = local_requests.lock().expect("requests mutex").clone();
    let server_requests = server_requests.lock().expect("requests mutex").clone();
    for head in local_requests.iter().chain(server_requests.iter()) {
        assert_single_exact_header(head);
    }
}

/// `max_redirects=0` from `stream-lavf-o` reaches FFmpeg's nested segment
/// opens: a 302 on a segment sends nothing to the target. Without it, the
/// same playlist does reach the target, so the test can see a redirect.
#[test]
fn hls_segment_redirects_are_refused_on_nested_opens() {
    for (network, expect_followed) in [
        (Network::Production, false),
        (Network::WithoutRedirectLimit, true),
    ] {
        let Some(mut mpv) = hls_player(network) else {
            return;
        };
        let (other, other_origin) = listener();
        let other_requests = serve_routes(other, server_routes());
        let (server, server_origin) = listener();
        let mut routes = server_routes();
        routes[1].1 = Route::redirect(format!("{other_origin}/hls1/main/0.mp4"));
        let server_requests = serve_routes(server, routes);
        let (local, local_origin) = listener();
        let _local = serve_routes(
            local,
            vec![
                (
                    "/s/master.m3u8".into(),
                    Route::ok(
                        PLAYLIST,
                        master_playlist(&format!("{local_origin}/s/v0.m3u8")),
                    ),
                ),
                (
                    "/s/v0.m3u8".into(),
                    Route::ok(PLAYLIST, media_playlist(&server_origin)),
                ),
            ],
        );

        play_to_end(&mut mpv, &format!("{local_origin}/s/master.m3u8"));
        thread::sleep(Duration::from_millis(200));

        let redirected = paths(&server_requests)
            .iter()
            .any(|path| path.starts_with("/hls1/main/0.mp4"));
        assert!(redirected, "the redirecting segment was never requested");
        let followed = !other_requests.lock().expect("requests mutex").is_empty();
        eprintln!("hls segment redirect followed (expected {expect_followed}): {followed}");
        assert_eq!(followed, expect_followed);
    }
}

/// The `demuxer-lavf-o` protocol whitelist is set on HLS handles and a
/// `file:` segment inside an HTTP playlist is never played. FFmpeg already
/// refuses it without the option: a nested open inherits the http protocol's
/// default whitelist (`http,https,tls,rtp,tcp,udp,crypto,httpproxy,data` in
/// FFmpeg 9.0.2's log); with it, the log names `http,https,tcp,tls`.
#[test]
fn hls_file_segments_are_refused_with_and_without_the_whitelist() {
    let dir = std::env::temp_dir().join(format!("fluster-hls-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("temp dir");
    let segment = dir.join("segment.wav");
    std::fs::write(&segment, silent_wav()).expect("write segment");
    let variant = format!(
        "#EXTM3U\n#EXT-X-TARGETDURATION:1\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXTINF:0.5,\nfile://{}\n#EXT-X-ENDLIST\n",
        segment.display()
    );
    for network in [Network::Production, Network::WithoutWhitelist] {
        let Some(mut mpv) = hls_player(network) else {
            return;
        };
        let options: String = mpv.get_property("demuxer-lavf-o").expect("demuxer-lavf-o");
        let (local, local_origin) = listener();
        let _local = serve_routes(
            local,
            vec![
                (
                    "/s/master.m3u8".into(),
                    Route::ok(
                        PLAYLIST,
                        master_playlist(&format!("{local_origin}/s/v0.m3u8")),
                    ),
                ),
                ("/s/v0.m3u8".into(), Route::ok(PLAYLIST, variant.clone())),
            ],
        );
        let played = play_to_end(&mut mpv, &format!("{local_origin}/s/master.m3u8"));
        eprintln!("hls file: segment with demuxer-lavf-o {options:?} played: {played}");
        assert!(!played, "a file: segment played with {options:?}");
    }
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn hls_handles_set_the_protocol_whitelist_and_references() {
    let Some(mpv) = hls_player(Network::Production) else {
        return;
    };
    let options: String = mpv.get_property("demuxer-lavf-o").expect("demuxer-lavf-o");
    assert_eq!(options, "protocol_whitelist=http,https,tcp,tls");
    let access_references: bool = mpv
        .get_property("access-references")
        .expect("access-references");
    assert!(access_references);
    let redirects: String = mpv.get_property("stream-lavf-o").expect("stream-lavf-o");
    assert_eq!(redirects, "max_redirects=0,http_proxy=direct://");
}
