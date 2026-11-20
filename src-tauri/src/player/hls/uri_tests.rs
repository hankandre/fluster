//! Rust-only checks of `resolve_same_origin`. Every playlist-level case lives
//! in `tests/fixtures/hls-playlists.json` (`playlist_vectors_tests.rs`); these
//! are the ones a playlist cannot reach: the body credential scan refuses a
//! credential query before any URI is resolved, and a line's trailing tab is
//! trimmed while a quoted attribute refuses it as a control character.

use super::uri::resolve_same_origin;
use super::HlsError;
use url::Url;

const BASE: &str = "http://127.0.0.1:8096/videos/abc/main.m3u8?DeviceId=d&PlaySessionId=p";

fn resolve(raw: &str) -> Result<String, HlsError> {
    let base = Url::parse(BASE).expect("base");
    resolve_same_origin(raw, &base, &base.origin()).map(String::from)
}

#[test]
fn hls_uris_refuse_credential_queries_and_tabs_on_their_own() {
    for raw in [
        "a.mp4\t",
        "a.mp4?ApiKey=secret",
        "a.mp4?api_key=secret",
        "a.mp4?API_KEY=secret",
        "a.mp4?access_token=secret",
        "a.mp4?Token=secret",
        "a.mp4?X-Emby-Token=secret",
        "a.mp4?x%2Demby%2Dtoken=secret",
        "a.mp4?Api%4Bey=secret",
        "a.mp4?a=1&apikey=secret",
    ] {
        assert_eq!(resolve(raw), Err(HlsError::UnsafeUri), "{raw}");
    }
}
