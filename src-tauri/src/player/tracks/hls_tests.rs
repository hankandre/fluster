//! Track mapping for converted (HLS) sessions (P10-04).

use super::tests::{indices, jellyfin, jellyfin_audio, mpv, mpv_audio};
use super::*;

/// A converted stream (P10-04): the source has AC-3 and DTS audio and an
/// embedded ASS subtitle that the server delivers as a file. mpv lists one
/// transcoded AAC track with its own numbering, the video, and the loopback
/// subtitle. Only the subtitle (add order) and the requested audio map.
#[test]
fn hls_sessions_map_only_the_requested_audio_and_the_loaded_subtitles() {
    let audio = jellyfin_audio(2, "eng", "ac3");
    let subtitle = MediaTrack {
        external: true,
        codec: Some("ass".into()),
        ..jellyfin(4, "Subtitle", false)
    };
    let listed = [
        mpv(1, "Video", 0, false),
        mpv_audio(1, 1, "und", "aac"),
        MpvTrack {
            codec: Some("ass".into()),
            ..mpv(1, "Subtitle", 0, true)
        },
    ];
    let tracks = hls_player_tracks(std::slice::from_ref(&subtitle), &[4], &listed, Some(&audio));
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", None),
            (1, "Audio", Some(2)),
            (1, "Subtitle", Some(4))
        ]
    );
    assert_eq!(tracks[1].title, "Audio 2");

    // Two embedded audio tracks: the conversion is not what Fluster asked
    // for, so nothing embedded maps; no requested index maps nothing.
    let two_audio = [mpv_audio(1, 1, "eng", "aac"), mpv_audio(2, 2, "eng", "aac")];
    let tracks = hls_player_tracks(&[], &[], &two_audio, Some(&audio));
    assert_eq!(
        indices(&tracks),
        vec![(1, "Audio", None), (2, "Audio", None)]
    );
    let tracks = hls_player_tracks(&[], &[], &listed[..2], None);
    assert_eq!(
        indices(&tracks),
        vec![(1, "Video", None), (1, "Audio", None)]
    );
    // An index that names a subtitle is not an audio mapping.
    let tracks = hls_player_tracks(&[], &[], &listed[..2], Some(&subtitle));
    assert_eq!(
        indices(&tracks),
        vec![(1, "Video", None), (1, "Audio", None)]
    );
}
