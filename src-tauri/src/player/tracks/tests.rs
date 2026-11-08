use super::*;

fn default_codec(kind: &str) -> &'static str {
    match kind {
        "Video" => "h264",
        "Audio" => "aac",
        _ => "subrip",
    }
}

pub(super) fn jellyfin(index: i64, kind: &str, external: bool) -> MediaTrack {
    MediaTrack {
        index,
        kind: kind.into(),
        display_title: format!("{kind} {index}"),
        codec: Some(default_codec(kind).into()),
        language: Some("eng".into()),
        external,
        delivery_url: None,
    }
}

pub(super) fn jellyfin_audio(index: i64, language: &str, codec: &str) -> MediaTrack {
    MediaTrack {
        language: Some(language.into()),
        codec: Some(codec.into()),
        ..jellyfin(index, "Audio", false)
    }
}

pub(super) fn mpv(id: i64, kind: &str, ff_index: i64, external: bool) -> MpvTrack {
    MpvTrack {
        id,
        kind: kind.into(),
        ff_index: Some(ff_index),
        external,
        codec: Some(default_codec(kind).into()),
        title: None,
        language: None,
        selected: false,
    }
}

pub(super) fn mpv_audio(id: i64, ff_index: i64, language: &str, codec: &str) -> MpvTrack {
    MpvTrack {
        language: Some(language.into()),
        codec: Some(codec.into()),
        ..mpv(id, "Audio", ff_index, false)
    }
}

pub(super) fn indices(tracks: &[PlayerTrack]) -> Vec<(i64, &str, Option<i64>)> {
    tracks
        .iter()
        .map(|track| (track.player_id, track.kind.as_str(), track.jellyfin_index))
        .collect()
}

/// `playbackinfo-external-subtitle.json` (10.11.7 and 12.4.0): the
/// sidecar SRT is Index 0, the embedded video 1, the embedded audio 2,
/// DefaultAudioStreamIndex 2, DefaultSubtitleStreamIndex 0.
fn sidecar_plan() -> Vec<MediaTrack> {
    vec![
        jellyfin(0, "Subtitle", true),
        jellyfin(1, "Video", false),
        jellyfin(2, "Audio", false),
    ]
}

/// What mpv lists for the sidecar sample after `sub-add`: the MKV's video
/// (ff-index 0) and audio (ff-index 1), then the SRT (ff-index 0 within
/// its own file).
fn sidecar_mpv() -> Vec<MpvTrack> {
    vec![
        mpv(1, "Video", 0, false),
        mpv(1, "Audio", 1, false),
        mpv(1, "Subtitle", 0, true),
    ]
}

/// `playbackinfo-multitrack-profile.json`: video 0, English AAC 1,
/// Spanish AC-3 2, no externals.
fn multitrack_plan() -> Vec<MediaTrack> {
    vec![
        jellyfin(0, "Video", false),
        jellyfin_audio(1, "eng", "aac"),
        jellyfin_audio(2, "spa", "ac3"),
    ]
}

#[test]
fn tracks_map_one_external_subtitle_and_embedded_streams() {
    let tracks = player_tracks(&sidecar_plan(), &[0], &sidecar_mpv());
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(1)),
            (1, "Audio", Some(2)),
            (1, "Subtitle", Some(0)),
        ]
    );
    assert_eq!(tracks[2].title, "Subtitle 0");
    assert!(tracks[2].external);
}

#[test]
fn tracks_apply_the_sidecar_defaults() {
    let tracks = player_tracks(&sidecar_plan(), &[0], &sidecar_mpv());
    assert_eq!(
        initial_selection(&tracks, Some(2), Some(0)),
        InitialSelection {
            aid: Some("1".into()),
            sid: "1".into(),
        }
    );
}

#[test]
fn tracks_map_multitrack_audio_without_externals() {
    let listed = vec![
        mpv(1, "Video", 0, false),
        mpv_audio(1, 1, "eng", "aac"),
        mpv_audio(2, 2, "spa", "ac3"),
    ];
    let tracks = player_tracks(&multitrack_plan(), &[], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(0)),
            (1, "Audio", Some(1)),
            (2, "Audio", Some(2)),
        ]
    );
    assert_eq!(
        initial_selection(&tracks, Some(1), None),
        InitialSelection {
            aid: Some("1".into()),
            sid: "no".into(),
        }
    );
    assert_eq!(
        initial_selection(&tracks, Some(2), Some(-1)).aid,
        Some("2".into())
    );
    assert_eq!(initial_selection(&tracks, Some(2), Some(-1)).sid, "no");
}

#[test]
fn tracks_map_several_externals_by_add_order() {
    // Two sidecars (Jellyfin 0 and 1) and an embedded subtitle at
    // ff-index 2, which Jellyfin numbers 4.
    let plan = vec![
        jellyfin(0, "Subtitle", true),
        jellyfin(1, "Subtitle", true),
        jellyfin(2, "Video", false),
        jellyfin(3, "Audio", false),
        jellyfin(4, "Subtitle", false),
    ];
    let listed = vec![
        mpv(1, "Video", 0, false),
        mpv(1, "Audio", 1, false),
        mpv(1, "Subtitle", 2, false),
        mpv(2, "Subtitle", 0, true),
        mpv(3, "Subtitle", 0, true),
    ];
    // Fluster added Jellyfin 1 before Jellyfin 0.
    let tracks = player_tracks(&plan, &[1, 0], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(2)),
            (1, "Audio", Some(3)),
            (1, "Subtitle", Some(4)),
            (2, "Subtitle", Some(1)),
            (3, "Subtitle", Some(0)),
        ]
    );
    assert_eq!(initial_selection(&tracks, Some(3), Some(0)).sid, "3");
    assert_eq!(initial_selection(&tracks, Some(3), Some(4)).sid, "1");
}

#[test]
fn tracks_leave_a_stream_mpv_does_not_expose_unselected() {
    // The sidecar failed to load, so mpv lists only the embedded streams.
    let tracks = player_tracks(&sidecar_plan(), &[], &sidecar_mpv()[..2]);
    assert_eq!(
        indices(&tracks),
        vec![(1, "Video", Some(1)), (1, "Audio", Some(2))]
    );
    assert_eq!(
        initial_selection(&tracks, Some(7), Some(0)),
        InitialSelection {
            aid: None,
            sid: "no".into(),
        }
    );
}

#[test]
fn tracks_without_a_jellyfin_counterpart_stay_unmapped() {
    let mut listed = sidecar_mpv();
    // An embedded stream Jellyfin did not list, and an external track
    // Fluster did not add.
    listed.push(mpv(2, "Audio", 5, false));
    listed.push(mpv(2, "Subtitle", 0, true));
    let tracks = player_tracks(&sidecar_plan(), &[0], &listed);
    assert_eq!(tracks[1].jellyfin_index, Some(2));
    assert_eq!(tracks[3].jellyfin_index, None);
    assert_eq!(tracks[3].title, "Track 2");
    // Two external tracks for one add: add order is ambiguous.
    assert_eq!(tracks[2].jellyfin_index, None);
    assert_eq!(tracks[4].jellyfin_index, None);
}

#[test]
fn tracks_fall_back_to_the_ordinal_on_a_type_mismatch_or_missing_ff_index() {
    let mut listed = sidecar_mpv();
    // ff-index 0 + 1 external = Jellyfin 1, which is the video, not
    // audio; the only embedded audio on both sides is the match.
    listed[1].ff_index = Some(0);
    listed[0].ff_index = None;
    let tracks = player_tracks(&sidecar_plan(), &[0], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(1)),
            (1, "Audio", Some(2)),
            (1, "Subtitle", Some(0)),
        ]
    );
}

/// Guardian's case: the file has a subtitle with no codec before two
/// audio tracks. Jellyfin drops it and numbers the audio 1 and 2; lavf
/// gives them ff-index 2 and 3. The offset would swap English and Spanish.
#[test]
fn tracks_survive_a_subtitle_jellyfin_dropped() {
    let mut unknown_subtitle = mpv(1, "Subtitle", 1, false);
    unknown_subtitle.codec = None;
    let listed = vec![
        mpv(1, "Video", 0, false),
        unknown_subtitle,
        mpv_audio(1, 2, "eng", "aac"),
        mpv_audio(2, 3, "spa", "ac3"),
    ];
    let tracks = player_tracks(&multitrack_plan(), &[], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(0)),
            (1, "Subtitle", None),
            (1, "Audio", Some(1)),
            (2, "Audio", Some(2)),
        ]
    );
    assert_eq!(
        initial_selection(&tracks, Some(2), None).aid,
        Some("2".into())
    );
}

/// mpv's builtin MKV demuxer numbers only the streams it creates, so a
/// data stream Jellyfin kept (Index 1, not in the plan's tracks) shifts
/// mpv's ff-index down by one.
#[test]
fn tracks_survive_a_builtin_demuxer_index_shift() {
    let plan = vec![
        jellyfin(0, "Video", false),
        jellyfin_audio(2, "eng", "aac"),
        jellyfin_audio(3, "spa", "eac3"),
    ];
    let listed = vec![
        mpv(1, "Video", 0, false),
        mpv_audio(1, 1, "eng", "aac"),
        mpv_audio(2, 2, "spa", "eac3"),
    ];
    let tracks = player_tracks(&plan, &[], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(0)),
            (1, "Audio", Some(2)),
            (2, "Audio", Some(3)),
        ]
    );
}

#[test]
fn tracks_with_a_different_language_stay_unmapped() {
    let plan = vec![jellyfin(0, "Video", false), jellyfin_audio(1, "eng", "aac")];
    let listed = vec![mpv(1, "Video", 0, false), mpv_audio(1, 1, "fre", "aac")];
    let tracks = player_tracks(&plan, &[], &listed);
    assert_eq!(tracks[1].jellyfin_index, None);
    assert_eq!(initial_selection(&tracks, Some(1), None).aid, None);
    // A codec family mismatch is refused the same way.
    let listed = vec![mpv(1, "Video", 0, false), mpv_audio(1, 1, "eng", "opus")];
    assert_eq!(player_tracks(&plan, &[], &listed)[1].jellyfin_index, None);
}

#[test]
fn tracks_match_codec_aliases_and_language_forms() {
    assert!(codecs_agree(Some("hdmv_pgs_subtitle"), Some("PGSSUB")));
    assert!(codecs_agree(Some("subrip"), Some("srt")));
    assert!(codecs_agree(Some("ssa"), Some("ass")));
    assert!(codecs_agree(Some("eac3"), Some("ac3")));
    assert!(!codecs_agree(Some("aac"), Some("ac3")));
    assert!(codecs_agree(None, Some("aac")));
    assert!(languages_agree(Some("en-US"), Some("eng")));
    assert!(languages_agree(Some("eng"), Some("ENG")));
    assert!(languages_agree(Some("und"), Some("spa")));
    assert!(!languages_agree(Some("eng"), Some("spa")));
}

/// Same language and codec, and the dropped subtitle makes ff-index and
/// ordinal disagree: both look right, so the audio stays unmapped.
#[test]
fn tracks_refuse_to_guess_between_identical_streams() {
    let plan = vec![
        jellyfin(0, "Video", false),
        jellyfin_audio(1, "eng", "aac"),
        jellyfin_audio(2, "eng", "aac"),
    ];
    let listed = vec![
        mpv(1, "Video", 0, false),
        MpvTrack {
            codec: None,
            ..mpv(1, "Subtitle", 1, false)
        },
        mpv_audio(1, 2, "eng", "aac"),
        mpv_audio(2, 3, "eng", "aac"),
    ];
    let tracks = player_tracks(&plan, &[], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(0)),
            (1, "Subtitle", None),
            (1, "Audio", None),
            (2, "Audio", None),
        ]
    );
    assert_eq!(initial_selection(&tracks, Some(1), None).aid, None);
}

/// Older libraries may number externals after the embedded streams; the
/// offset then does not apply and embedded tracks map by ordinal.
#[test]
fn tracks_skip_the_offset_when_externals_are_numbered_last() {
    let plan = vec![
        jellyfin(0, "Video", false),
        jellyfin(1, "Audio", false),
        jellyfin(2, "Subtitle", true),
    ];
    let listed = vec![
        mpv(1, "Video", 0, false),
        mpv(1, "Audio", 1, false),
        mpv(1, "Subtitle", 0, true),
    ];
    let tracks = player_tracks(&plan, &[2], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(0)),
            (1, "Audio", Some(1)),
            (1, "Subtitle", Some(2)),
        ]
    );
}

/// An external audio file counts toward the offset but is never loaded,
/// so a default that points at it leaves the audio choice to mpv.
#[test]
fn tracks_count_an_unloaded_external_audio_file_in_the_offset() {
    let plan = vec![
        jellyfin(0, "Audio", true),
        jellyfin(1, "Subtitle", true),
        jellyfin(2, "Video", false),
        jellyfin(3, "Audio", false),
    ];
    let listed = vec![
        mpv(1, "Video", 0, false),
        mpv(1, "Audio", 1, false),
        mpv(1, "Subtitle", 0, true),
    ];
    let tracks = player_tracks(&plan, &[1], &listed);
    assert_eq!(
        indices(&tracks),
        vec![
            (1, "Video", Some(2)),
            (1, "Audio", Some(3)),
            (1, "Subtitle", Some(1)),
        ]
    );
    assert_eq!(
        initial_selection(&tracks, Some(0), Some(1)),
        InitialSelection {
            aid: None,
            sid: "1".into(),
        }
    );
}
