//! Rust-only checks of the served copy: children replaced by loopback URLs.
//! Every verdict and every copy with absolute child URLs lives in
//! `tests/fixtures/hls-playlists.json` (`playlist_vectors_tests.rs`).

use super::playlist::{Kind, Playlist};
use super::HlsError;
use url::Url;

const SERVER: &str = "http://127.0.0.1:8096";
const MASTER_URL: &str =
    "http://127.0.0.1:8096/videos/abc/master.m3u8?PlaySessionId=p&EnableTrickplay=false";

fn parse(body: &str, base: &str) -> Result<Playlist, HlsError> {
    let base = Url::parse(base).expect("base");
    Playlist::parse(body, &base, &Url::parse(SERVER).expect("server").origin())
}

fn master(lines: &str) -> String {
    format!("#EXTM3U\n{lines}\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmain.m3u8?PlaySessionId=p\n")
}

/// What Jellyfin 10.11 and 12.4 write for an fMP4 stream (`DynamicHlsHelper`,
/// `DynamicHlsPlaylistGenerator`), with shortened query strings.
const JELLYFIN_MASTER: &str = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2483431,AVERAGE-BANDWIDTH=2483431,VIDEO-RANGE=SDR,CODECS=\"avc1.640028,mp4a.40.2\",RESOLUTION=1920x1080,FRAME-RATE=23.976\nmain.m3u8?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false&TranscodeReasons=ContainerBitrateExceedsLimit\n";

#[test]
fn hls_jellyfin_master_points_its_variant_at_the_loopback_copy() {
    let playlist = parse(JELLYFIN_MASTER, MASTER_URL).expect("valid master");
    assert_eq!(playlist.kind(), Kind::Master);
    assert_eq!(
        playlist.children().iter().map(Url::as_str).collect::<Vec<_>>(),
        vec!["http://127.0.0.1:8096/videos/abc/main.m3u8?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false&TranscodeReasons=ContainerBitrateExceedsLimit"]
    );
    let copy = playlist
        .render(&["http://127.0.0.1:1/r/0.m3u8".into()])
        .expect("render");
    assert_eq!(
        copy,
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2483431,AVERAGE-BANDWIDTH=2483431,VIDEO-RANGE=SDR,CODECS=\"avc1.640028,mp4a.40.2\",RESOLUTION=1920x1080,FRAME-RATE=23.976\nhttp://127.0.0.1:1/r/0.m3u8\n"
    );
    assert!(!copy.contains(SERVER));
}

#[test]
fn hls_renditions_with_a_uri_become_loopback_children() {
    let body = master("#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"English\",URI=\"audio.m3u8\"");
    let playlist = parse(&body, MASTER_URL).expect("valid");
    assert_eq!(playlist.children().len(), 2);
    let copy = playlist
        .render(&[
            "http://127.0.0.1:1/r/0.m3u8".into(),
            "http://127.0.0.1:1/r/1.m3u8".into(),
        ])
        .expect("render");
    assert!(copy.contains(
        "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"English\",URI=\"http://127.0.0.1:1/r/0.m3u8\"\n"
    ));
    assert!(copy.ends_with("http://127.0.0.1:1/r/1.m3u8\n"));
}
