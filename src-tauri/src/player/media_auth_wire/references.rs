//! References inside a stream or subtitle body are never opened.

use super::*;
use crate::model::MediaTrack;
use crate::player::track_list::load_external_subtitles;

// Bodies that name another origin. `OTHER` is replaced by its URL.
const NESTED_REFERENCES: [(&str, &str, &str); 6] = [
        ("m3u served as video", "#EXTM3U\nOTHER/x.wav\n", "video/x-matroska"),
        ("URL list with an m3u MIME type", "OTHER/x.wav\n", "audio/x-mpegurl"),
        ("PLS served as video", "[playlist]\nFile1=OTHER/x.wav\nNumberOfEntries=1\n", "video/x-matroska"),
        ("mpv EDL", "# mpv EDL v0\nOTHER/x.wav\n", "video/x-matroska"),
        (
            "HLS served as video",
            "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:0.5,\nOTHER/seg.wav\n#EXT-X-ENDLIST\n",
            "video/x-matroska",
        ),
        (
            "HLS with its MIME type",
            "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n#EXTINF:0.5,\nOTHER/seg.wav\n#EXT-X-ENDLIST\n",
            "application/vnd.apple.mpegurl",
        ),
    ];

#[test]
fn references_inside_the_stream_body_are_never_opened() {
    for (label, body, content_type) in NESTED_REFERENCES {
        let Some(mut mpv) = headless_player(&test_authorization()) else {
            return;
        };
        let (other, other_origin) = listener();
        let other_requests = serve(other, String::new());
        let (server, origin) = listener();
        let requests = serve_body(server, body.replace("OTHER", &other_origin), content_type);

        mpv.command("loadfile", &[&format!("{origin}/stream"), "replace"])
            .expect("loadfile");
        settle(&mut mpv);

        assert!(
            !requests.lock().expect("requests mutex").is_empty(),
            "{label}: the stream was never requested"
        );
        assert!(
            other_requests.lock().expect("requests mutex").is_empty(),
            "{label}: a reference inside the stream body was opened with the header"
        );
    }
}

#[test]
fn references_inside_a_subtitle_body_are_never_opened() {
    for (label, body, content_type) in NESTED_REFERENCES {
        let Some(mut mpv) = headless_player(&test_authorization()) else {
            return;
        };
        let (other, other_origin) = listener();
        let other_requests = serve(other, String::new());
        let (stream_server, stream_origin) = listener();
        let _stream_requests = serve(stream_server, String::new());
        let (subtitle_server, subtitle_origin) = listener();
        let subtitle_requests = serve_body(
            subtitle_server,
            body.replace("OTHER", &other_origin),
            content_type,
        );

        mpv.command("loadfile", &[&format!("{stream_origin}/stream"), "replace"])
            .expect("loadfile");
        assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
        let subtitle = MediaTrack {
            index: 1,
            kind: "Subtitle".into(),
            display_title: "English".into(),
            codec: None,
            language: Some("eng".into()),
            external: true,
            delivery_url: Some(format!("{subtitle_origin}/sub.srt")),
        };
        load_external_subtitles(&mpv, &[subtitle]);
        settle(&mut mpv);

        assert!(
            !subtitle_requests.lock().expect("requests mutex").is_empty(),
            "{label}: the subtitle was never requested"
        );
        assert!(
            other_requests.lock().expect("requests mutex").is_empty(),
            "{label}: a reference inside the subtitle body was opened with the header"
        );
    }
}
