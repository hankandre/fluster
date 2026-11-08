use super::uri::{mentions_credential, resolve_same_origin};
use super::HlsError;
use url::Url;

const BASE: &str = "http://192.168.1.5:8096/videos/abc/main.m3u8?DeviceId=d&PlaySessionId=p";

fn resolve(raw: &str) -> Result<String, HlsError> {
    let base = Url::parse(BASE).expect("base");
    resolve_same_origin(raw, &base, &base.origin()).map(String::from)
}

#[test]
fn hls_uris_resolve_relative_and_absolute_same_origin_forms() {
    for (raw, expected) in [
        (
            "hls1/main/0.mp4?PlaySessionId=p&runtimeTicks=0",
            "http://192.168.1.5:8096/videos/abc/hls1/main/0.mp4?PlaySessionId=p&runtimeTicks=0",
        ),
        (
            "../xyz/main.m3u8",
            "http://192.168.1.5:8096/videos/xyz/main.m3u8",
        ),
        (
            "/videos/abc/x.mp4",
            "http://192.168.1.5:8096/videos/abc/x.mp4",
        ),
        (
            "http://192.168.1.5:8096/a.mp4",
            "http://192.168.1.5:8096/a.mp4",
        ),
        (
            "HTTP://192.168.1.5:8096/a.mp4",
            "http://192.168.1.5:8096/a.mp4",
        ),
        ("//192.168.1.5:8096/a.mp4", "http://192.168.1.5:8096/a.mp4"),
        (
            "http://192.168.1.5:8096/%2F%2Fother.example/a",
            "http://192.168.1.5:8096/%2F%2Fother.example/a",
        ),
        // A same-scheme URL without slashes is relative under WHATWG; the
        // copy carries the resolved form, so FFmpeg never sees this spelling.
        (
            "http:%2F%2Fother.example/a",
            "http://192.168.1.5:8096/videos/abc/%2F%2Fother.example/a",
        ),
    ] {
        assert_eq!(resolve(raw).as_deref(), Ok(expected), "{raw}");
    }
}

#[test]
fn hls_uris_refuse_other_origins_schemes_userinfo_and_credentials() {
    for raw in [
        "http://other.example/a.mp4",
        "//other.example/a.mp4",
        "https://192.168.1.5:8096/a.mp4",
        "http://192.168.1.5:8920/a.mp4",
        "http://192.168.1.5/a.mp4",
        "http://192.168.1.6:8096/a.mp4",
        "http://user@192.168.1.5:8096/a.mp4",
        "http://user:pass@192.168.1.5:8096/a.mp4",
        "http://192.168.1.5:8096@other.example/a.mp4",
        "http://other.example\\@192.168.1.5:8096/a.mp4",
        "\\\\other.example/a.mp4",
        "/\\other.example/a.mp4",
        "data:video/mp4;base64,AAAA",
        "file:///etc/passwd",
        "crypto+http://192.168.1.5:8096/a.mp4",
        "ftp://192.168.1.5:8096/a.mp4",
        "javascript:alert(1)",
        "http://192.168.1.5:8096/a.mp4#frag",
        "a.mp4 ",
        " a.mp4",
        "a .mp4",
        "a.mp4\t",
        "",
        "http://192.168.1.5%2Eother.example:8096/a.mp4",
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

#[test]
fn hls_uri_ipv4_spellings_are_compared_after_normalization() {
    // The url crate reads 0xc0.0xa8.1.5 as 192.168.1.5, and the copy then
    // carries the dotted form, so this resolves to the server and is allowed.
    assert_eq!(
        resolve("http://0xc0.0xa8.1.5:8096/a.mp4").as_deref(),
        Ok("http://192.168.1.5:8096/a.mp4")
    );
}

#[test]
fn hls_bodies_naming_a_credential_in_any_case_or_encoding_are_detected() {
    for body in [
        "#EXTM3U\nmain.m3u8?ApiKey=secret\n",
        "#EXTM3U\nmain.m3u8?apikey=secret\n",
        "#EXTM3U\nmain.m3u8?API_KEY=secret\n",
        "#EXTM3U\nmain.m3u8?access_token=secret\n",
        "#EXTM3U\nmain.m3u8?token=secret\n",
        "#EXTM3U\nmain.m3u8?X-EMBY-TOKEN=secret\n",
        "#EXTM3U\n#EXT-X-FOO:URI=\"x?Token=secret\"\n",
        "#EXTM3U\n#EXT-X-IMAGE-STREAM-INF:URI=\"Trickplay/320/tiles.m3u8?ApiKey=secret\"\n",
        "#EXTM3U\n# comment ApiKey=secret\n",
        "#EXTM3U\nmain.m3u8;ApiKey=secret\n",
        "#EXTM3U\nmain.m3u8?Api%4Bey=secret\n",
        "#EXTM3U\nmain.m3u8?ApiKey%3Dsecret\n",
        "#EXTM3U\nmain.m3u8?Api%254Bey=secret\n",
        "#EXTM3U\nmain.m3u8?x%2Demby%2Dtoken=secret\n",
        "#EXTM3U\nMediaBrowser Token = \"secret\"\n",
        "ApiKey=secret",
    ] {
        assert!(mentions_credential(body), "{body:?}");
    }
    for body in [
        "#EXTM3U\nmain.m3u8?PlaySessionId=p&DeviceId=d&Tag=t&MediaSourceId=m\n",
        "#EXTM3U\nmain.m3u8?tokenless=1&apikeys=2&myapikey=3&x_token=4\n",
        "#EXTM3U\n#EXTINF:6.000000, nodesc\nhls1/main/0.mp4?runtimeTicks=0\n",
        "#EXTM3U\n# The token is in the header\n",
    ] {
        assert!(!mentions_credential(body), "{body:?}");
    }
}
