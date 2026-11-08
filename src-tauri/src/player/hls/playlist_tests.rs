use super::playlist::{Kind, Playlist};
use super::HlsError;
use url::Url;

const SERVER: &str = "http://192.168.1.5:8096";
const MASTER_URL: &str =
    "http://192.168.1.5:8096/videos/abc/master.m3u8?PlaySessionId=p&EnableTrickplay=false";
const MEDIA_URL: &str = "http://192.168.1.5:8096/videos/abc/main.m3u8?PlaySessionId=p";

fn parse(body: &str, base: &str) -> Result<Playlist, HlsError> {
    let base = Url::parse(base).expect("base");
    Playlist::parse(body, &base, &Url::parse(SERVER).expect("server").origin())
}

fn master(lines: &str) -> String {
    format!("#EXTM3U\n{lines}\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nmain.m3u8?PlaySessionId=p\n")
}

fn media(lines: &str) -> String {
    format!(
        "#EXTM3U\n#EXT-X-TARGETDURATION:6\n{lines}\n#EXTINF:6.0,\nhls1/main/0.mp4?PlaySessionId=p\n#EXT-X-ENDLIST\n"
    )
}

/// What Jellyfin 10.11 and 12.4 write for an fMP4 stream (`DynamicHlsHelper`,
/// `DynamicHlsPlaylistGenerator`), with shortened query strings.
const JELLYFIN_MASTER: &str = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2483431,AVERAGE-BANDWIDTH=2483431,VIDEO-RANGE=SDR,CODECS=\"avc1.640028,mp4a.40.2\",RESOLUTION=1920x1080,FRAME-RATE=23.976\nmain.m3u8?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false&TranscodeReasons=ContainerBitrateExceedsLimit\n";
const JELLYFIN_MEDIA: &str = "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI=\"hls1/main/-1.mp4?DeviceId=d&PlaySessionId=p\"\n#EXTINF:6.0060, nodesc\nhls1/main/0.mp4?DeviceId=d&PlaySessionId=p&runtimeTicks=0&actualSegmentLengthTicks=60060000\n#EXTINF:3.0030, nodesc\nhls1/main/1.mp4?DeviceId=d&PlaySessionId=p&runtimeTicks=60060000&actualSegmentLengthTicks=30030000\n#EXT-X-ENDLIST\n";

#[test]
fn hls_jellyfin_master_points_its_variant_at_the_loopback_copy() {
    let playlist = parse(JELLYFIN_MASTER, MASTER_URL).expect("valid master");
    assert_eq!(playlist.kind(), Kind::Master);
    assert_eq!(
        playlist.children().iter().map(Url::as_str).collect::<Vec<_>>(),
        vec!["http://192.168.1.5:8096/videos/abc/main.m3u8?DeviceId=d&MediaSourceId=m&PlaySessionId=p&EnableTrickplay=false&TranscodeReasons=ContainerBitrateExceedsLimit"]
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
fn hls_jellyfin_media_playlist_gets_absolute_same_origin_uris() {
    let playlist = parse(JELLYFIN_MEDIA, MEDIA_URL).expect("valid media playlist");
    assert_eq!(playlist.kind(), Kind::Media);
    assert!(playlist.children().is_empty());
    let copy = playlist.render(&[]).expect("render");
    assert_eq!(
        copy,
        "#EXTM3U\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n\
         #EXT-X-MAP:URI=\"http://192.168.1.5:8096/videos/abc/hls1/main/-1.mp4?DeviceId=d&PlaySessionId=p\"\n\
         #EXTINF:6.0060, nodesc\n\
         http://192.168.1.5:8096/videos/abc/hls1/main/0.mp4?DeviceId=d&PlaySessionId=p&runtimeTicks=0&actualSegmentLengthTicks=60060000\n\
         #EXTINF:3.0030, nodesc\n\
         http://192.168.1.5:8096/videos/abc/hls1/main/1.mp4?DeviceId=d&PlaySessionId=p&runtimeTicks=60060000&actualSegmentLengthTicks=30030000\n\
         #EXT-X-ENDLIST\n"
    );
}

#[test]
fn hls_playlists_accept_crlf_and_lone_cr_line_ends() {
    for separator in ["\r\n", "\r"] {
        let body = JELLYFIN_MEDIA.replace('\n', separator);
        assert_eq!(parse(&body, MEDIA_URL).expect("valid").kind(), Kind::Media);
    }
}

const OTHER: &str = "http://other.example";

/// Every URI-bearing position with a cross-origin target rejects the
/// whole playlist.
#[test]
fn hls_every_uri_position_refuses_another_origin() {
    let master_cases = [
        format!("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n{OTHER}/main.m3u8\n"),
        master(&format!(
            "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI=\"{OTHER}/i.m3u8\""
        )),
        master(&format!(
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"a\",NAME=\"x\",URI=\"{OTHER}/a.m3u8\""
        )),
        master(&format!(
            "#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"s\",NAME=\"x\",URI=\"{OTHER}/s.m3u8\""
        )),
        master(&format!(
            "#EXT-X-SESSION-KEY:METHOD=AES-128,URI=\"{OTHER}/key\""
        )),
        master(&format!(
            "#EXT-X-SESSION-DATA:DATA-ID=\"x\",URI=\"{OTHER}/data.json\""
        )),
        master(&format!(
            "#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,RESOLUTION=320x180,URI=\"{OTHER}/tiles.m3u8\""
        )),
        master(&format!(
            "#EXT-X-CONTENT-STEERING:SERVER-URI=\"{OTHER}/steer\""
        )),
        master(&format!("#EXT-X-UNKNOWN-TAG:X-THING=\"{OTHER}/thing\"")),
        master(&format!("#EXT-X-UNKNOWN-TAG:{OTHER}/thing")),
    ];
    let media_cases = [
        media(&format!("#EXT-X-MAP:URI=\"{OTHER}/init.mp4\"")),
        media(&format!("#EXT-X-KEY:METHOD=AES-128,URI=\"{OTHER}/key\"")),
        media(&format!("#EXT-X-PART:DURATION=1,URI=\"{OTHER}/part.mp4\"")),
        media(&format!("#EXT-X-PRELOAD-HINT:TYPE=PART,URI=\"{OTHER}/hint.mp4\"")),
        media(&format!("#EXT-X-RENDITION-REPORT:URI=\"{OTHER}/r.m3u8\"")),
        media(&format!("#EXT-X-DATERANGE:ID=\"ad\",START-DATE=\"2026-01-01T00:00:00Z\",X-ASSET-URI=\"{OTHER}/ad.m3u8\"")),
        media(&format!("#EXT-X-DATERANGE:ID=\"ad\",START-DATE=\"2026-01-01T00:00:00Z\",X-ASSET-LIST=\"{OTHER}/ads.json\"")),
        media(&format!("#EXTINF:1,\n{OTHER}/segment.mp4")),
        media("#EXT-X-MAP:URI=\"//other.example/init.mp4\""),
        media("#EXT-X-MAP:URI=\"data:video/mp4;base64,AAAA\""),
        media("#EXT-X-MAP:URI=\"file:///etc/passwd\""),
        media("#EXTINF:1,\nfile:///etc/passwd"),
        media("#EXTINF:1,\nhttp://user@192.168.1.5:8096/a.mp4"),
    ];
    for body in master_cases {
        assert_eq!(
            parse(&body, MASTER_URL).err(),
            Some(HlsError::UnsafeUri),
            "{body}"
        );
    }
    for body in media_cases {
        assert_eq!(
            parse(&body, MEDIA_URL).err(),
            Some(HlsError::UnsafeUri),
            "{body}"
        );
    }
}

#[test]
fn hls_uri_attributes_the_parser_cannot_read_fail_closed() {
    for body in [
        // A second URI= hidden in a value, a lower-case name, and a comment.
        media("#EXT-X-MAP:URI=\"init.mp4\",X-NOTE=\"URI=x\""),
        media("#EXT-X-MAP:uri=\"init.mp4\""),
        media("# URI=\"http://other.example/x\""),
        master("#EXT-X-UNKNOWN:YES,URI=x"),
    ] {
        let error = parse(&body, MEDIA_URL)
            .err()
            .or_else(|| parse(&body, MASTER_URL).err());
        assert!(
            matches!(error, Some(HlsError::UnsafeUri | HlsError::Malformed)),
            "{body}: {error:?}"
        );
    }
}

#[test]
fn hls_tags_ffmpeg_ignores_are_checked_and_left_out_of_the_copy() {
    let body = master(
        "#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI=\"iframes.m3u8\"\n\
         #EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,URI=\"Trickplay/320/tiles.m3u8\"\n\
         #EXT-X-SESSION-DATA:DATA-ID=\"x\",VALUE=\"y\"\n\
         # a comment\n\
         #EXT-X-VERSION:7",
    );
    let copy = parse(&body, MASTER_URL)
        .expect("same-origin URIs are allowed")
        .render(&["http://127.0.0.1:1/r/0.m3u8".into()])
        .expect("render");
    assert_eq!(
        copy,
        "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttp://127.0.0.1:1/r/0.m3u8\n"
    );
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

#[test]
fn hls_a_credential_anywhere_in_the_body_fails_closed() {
    for body in [
        master("#EXT-X-IMAGE-STREAM-INF:BANDWIDTH=1,URI=\"Trickplay/320/tiles.m3u8?ApiKey=canary\""),
        master("#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID=\"s\",NAME=\"x\",URI=\"subtitles.m3u8?SegmentLength=30&api_key=canary\""),
        master("# access_token=canary"),
        media("#EXT-X-UNKNOWN:X-T=\"Token=canary\""),
        JELLYFIN_MEDIA.replace("PlaySessionId=p&runtimeTicks=0", "PlaySessionId=p&X-Emby-Token=canary&runtimeTicks=0"),
        JELLYFIN_MEDIA.replace("PlaySessionId=p&runtimeTicks=0", "PlaySessionId=p&APIKEY=canary&runtimeTicks=0"),
    ] {
        for base in [MASTER_URL, MEDIA_URL] {
            let error = parse(&body, base).expect_err("a credential must be refused");
            assert_eq!(error, HlsError::CredentialInPlaylist, "{body}");
            assert!(!error.to_string().contains("canary"));
            assert!(!format!("{error:?}").contains("canary"));
        }
    }
}

#[test]
fn hls_malformed_and_live_playlists_are_refused() {
    let long_uri = format!(
        "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:1,\n{}\n#EXT-X-ENDLIST\n",
        "a".repeat(4001)
    );
    for (body, expected) in [
        ("", HlsError::Malformed),
        ("#EXTM3U\n", HlsError::Malformed),
        (
            "\u{feff}#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8\n",
            HlsError::Malformed,
        ),
        (" #EXTM3U\n", HlsError::Malformed),
        ("#EXTM3U\nmain.m3u8\n", HlsError::Malformed),
        (
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n",
            HlsError::Malformed,
        ),
        (
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n#EXT-X-STREAM-INF:BANDWIDTH=2\nmain.m3u8\n",
            HlsError::Malformed,
        ),
        (
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8\n#EXTINF:1,\nseg.mp4\n",
            HlsError::Malformed,
        ),
        (
            "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:1,\n#EXT-X-ENDLIST\n",
            HlsError::Malformed,
        ),
        (
            "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:1,\nseg.mp4\n",
            HlsError::NotComplete,
        ),
        (
            "#EXTM3U\n#EXT-X-DEFINE:NAME=\"h\",VALUE=\"other.example\"\n",
            HlsError::Malformed,
        ),
        ("#EXTM3U\n#EXT-X-MAP:BYTERANGE=10\n", HlsError::Malformed),
        (
            "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,\nmain.m3u8\n",
            HlsError::Malformed,
        ),
        ("#EXTM3U\n#ext-x-version:7\n", HlsError::Malformed),
        (
            "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:1,\nseg\0.mp4\n#EXT-X-ENDLIST\n",
            HlsError::Malformed,
        ),
        (long_uri.as_str(), HlsError::Malformed),
    ] {
        assert_eq!(parse(body, MEDIA_URL).err(), Some(expected), "{body:?}");
    }
    // A leading space turns a tag into a URI line for FFmpeg; Rust resolves
    // it as a URI, which then fails.
    let shifted = media(" #EXT-X-MAP:URI=\"http://other.example/init.mp4\"");
    assert!(parse(&shifted, MEDIA_URL).is_err());
}

#[test]
fn hls_key_method_none_needs_no_uri() {
    let playlist = parse(&media("#EXT-X-KEY:METHOD=NONE"), MEDIA_URL).expect("valid");
    assert!(playlist
        .render(&[])
        .expect("render")
        .contains("#EXT-X-KEY:METHOD=NONE\n"));
    assert_eq!(
        parse(&media("#EXT-X-KEY:METHOD=AES-128"), MEDIA_URL).err(),
        Some(HlsError::Malformed)
    );
}
