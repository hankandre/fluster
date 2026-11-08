//! Maps Jellyfin stream indices to mpv tracks and back.
//!
//! Jellyfin numbers external streams first and then the streams it kept from
//! the file, one after another (`FFProbeVideoInfo.cs`). So an embedded
//! stream's Jellyfin `Index` is usually its ffprobe index plus the number of
//! external streams, and mpv reports the ffprobe index as `ff-index`.
//!
//! "Usually" is not enough to pick a track, because both sides can skip
//! streams. Jellyfin drops subtitles with no codec and streams that are not
//! audio, video, subtitle, or data (`ProbeResultNormalizer.cs`), which shifts
//! every later index. mpv's builtin MKV demuxer reports its own stream number
//! as `ff-index` (`demux.c`). Each candidate is therefore verified by stream
//! type, language, and codec family. If the `ff-index` candidate fails, the
//! Nth embedded track of a type is tried against the Nth Jellyfin stream of
//! that type. Anything still unclear stays unmapped: Fluster never guesses.
//!
//! An external file Fluster loads with `sub-add` is its own demuxer, so its
//! `ff-index` is the stream index inside that file (0 for a single-stream
//! subtitle). mpv appends every new track to `track-list` (`add_stream_track`
//! in `player/loadfile.c`), so external tracks appear in add order.

use crate::model::{MediaTrack, PlayerTrack};

/// One `track-list` entry, as read from libmpv.
#[derive(Debug, Clone, PartialEq)]
pub struct MpvTrack {
    pub id: i64,
    /// `Audio`, `Subtitle`, or `Video`, as Jellyfin names stream types.
    pub kind: String,
    pub ff_index: Option<i64>,
    pub external: bool,
    pub codec: Option<String>,
    pub title: Option<String>,
    pub language: Option<String>,
    pub selected: bool,
}

/// Builds the player tracks the frontend sees. `added_externals` holds the
/// Jellyfin indices of the external subtitles `sub-add` loaded, in add order.
pub fn player_tracks(
    jellyfin_tracks: &[MediaTrack],
    added_externals: &[i64],
    mpv_tracks: &[MpvTrack],
) -> Vec<PlayerTrack> {
    let indices = jellyfin_indices(jellyfin_tracks, added_externals, mpv_tracks);
    mpv_tracks
        .iter()
        .zip(indices)
        .map(|(track, jellyfin_index)| {
            let jellyfin = jellyfin_index.and_then(|index| find(jellyfin_tracks, index));
            PlayerTrack {
                player_id: track.id,
                jellyfin_index,
                kind: track.kind.clone(),
                title: track
                    .title
                    .clone()
                    .or_else(|| jellyfin.map(|candidate| candidate.display_title.clone()))
                    .unwrap_or_else(|| format!("Track {}", track.id)),
                language: track
                    .language
                    .clone()
                    .or_else(|| jellyfin.and_then(|candidate| candidate.language.clone())),
                external: track.external,
                selected: track.selected,
            }
        })
        .collect()
}

/// The Jellyfin index of each mpv track, in `track-list` order.
fn jellyfin_indices(
    jellyfin_tracks: &[MediaTrack],
    added_externals: &[i64],
    mpv_tracks: &[MpvTrack],
) -> Vec<Option<i64>> {
    let external_count = jellyfin_tracks
        .iter()
        .filter(|track| track.external)
        .count() as i64;
    let offset_applies = externals_come_first(jellyfin_tracks);
    let mpv_external_count = mpv_tracks.iter().filter(|track| track.external).count();
    // If mpv shows a different number of external tracks than Fluster added,
    // add order no longer identifies them, so leave them all unmapped.
    let externals_line_up = mpv_external_count == added_externals.len();
    let mut external_position = 0;
    let mut ambiguous_kinds: Vec<&str> = Vec::new();

    let mut indices: Vec<Option<i64>> = mpv_tracks
        .iter()
        .enumerate()
        .map(|(position, track)| {
            if track.external {
                let index = added_externals.get(external_position).copied();
                external_position += 1;
                if !externals_line_up {
                    return None;
                }
                return index
                    .and_then(|index| find(jellyfin_tracks, index))
                    .filter(|candidate| candidate.external && same_stream(track, candidate))
                    .map(|candidate| candidate.index);
            }

            let by_offset = track
                .ff_index
                .filter(|_| offset_applies)
                .and_then(|ff_index| find(jellyfin_tracks, ff_index + external_count))
                .filter(|candidate| !candidate.external && same_stream(track, candidate));
            let by_ordinal = ordinal_candidate(jellyfin_tracks, mpv_tracks, position)
                .filter(|candidate| same_stream(track, candidate));
            match (by_offset, by_ordinal) {
                (Some(offset), Some(ordinal)) if offset.index != ordinal.index => {
                    // Both look right, so the numbering is inconsistent.
                    ambiguous_kinds.push(track.kind.as_str());
                    None
                }
                (Some(offset), _) => Some(offset.index),
                (None, Some(ordinal)) => Some(ordinal.index),
                (None, None) => None,
            }
        })
        .collect();

    // One ambiguous track means this type's numbering cannot be trusted.
    for (track, index) in mpv_tracks.iter().zip(indices.iter_mut()) {
        if !track.external && ambiguous_kinds.contains(&track.kind.as_str()) {
            *index = None;
        }
    }
    // Two mpv tracks must never claim one Jellyfin stream.
    let claimed = indices.clone();
    for index in indices.iter_mut() {
        let claims = claimed.iter().filter(|other| **other == *index).count();
        if index.is_some() && claims > 1 {
            *index = None;
        }
    }
    indices
}

fn find(jellyfin_tracks: &[MediaTrack], index: i64) -> Option<&MediaTrack> {
    jellyfin_tracks.iter().find(|track| track.index == index)
}

/// True when every external stream is numbered below every embedded one, as
/// current Jellyfin does. Otherwise the external offset does not apply.
fn externals_come_first(jellyfin_tracks: &[MediaTrack]) -> bool {
    let last_external = jellyfin_tracks
        .iter()
        .filter(|track| track.external)
        .map(|track| track.index)
        .max();
    let first_embedded = jellyfin_tracks
        .iter()
        .filter(|track| !track.external)
        .map(|track| track.index)
        .min();
    match (last_external, first_embedded) {
        (Some(external), Some(embedded)) => external < embedded,
        _ => true,
    }
}

/// The Jellyfin stream with the same position among embedded streams of its
/// type as the mpv track at `position`. Only used when both sides list the
/// same number of embedded streams of that type.
fn ordinal_candidate<'a>(
    jellyfin_tracks: &'a [MediaTrack],
    mpv_tracks: &[MpvTrack],
    position: usize,
) -> Option<&'a MediaTrack> {
    let track = &mpv_tracks[position];
    let is_embedded_of_kind =
        |candidate: &MpvTrack| !candidate.external && candidate.kind == track.kind;
    let ordinal = mpv_tracks[..position]
        .iter()
        .filter(|candidate| is_embedded_of_kind(candidate))
        .count();
    let mpv_count = mpv_tracks
        .iter()
        .filter(|candidate| is_embedded_of_kind(candidate))
        .count();
    let mut embedded: Vec<&MediaTrack> = jellyfin_tracks
        .iter()
        .filter(|candidate| !candidate.external && candidate.kind == track.kind)
        .collect();
    if embedded.len() != mpv_count {
        return None;
    }
    embedded.sort_by_key(|candidate| candidate.index);
    embedded.get(ordinal).copied()
}

/// Type, language, and codec family agree wherever both sides know them.
fn same_stream(track: &MpvTrack, candidate: &MediaTrack) -> bool {
    track.kind == candidate.kind
        && languages_agree(track.language.as_deref(), candidate.language.as_deref())
        && codecs_agree(track.codec.as_deref(), candidate.codec.as_deref())
}

/// Compares primary language subtags. Unknown (`und`, empty) on either side
/// passes. Tags of different lengths (`en` against `eng`) cannot be compared
/// without a code table, so they pass too.
fn languages_agree(mpv: Option<&str>, jellyfin: Option<&str>) -> bool {
    match (primary_language(mpv), primary_language(jellyfin)) {
        (Some(mpv), Some(jellyfin)) if mpv.len() == jellyfin.len() => mpv == jellyfin,
        _ => true,
    }
}

fn primary_language(tag: Option<&str>) -> Option<String> {
    let primary = tag?.trim().split(['-', '_']).next()?.to_ascii_lowercase();
    match primary.as_str() {
        "" | "und" => None,
        _ => Some(primary),
    }
}

fn codecs_agree(mpv: Option<&str>, jellyfin: Option<&str>) -> bool {
    match (codec_family(mpv), codec_family(jellyfin)) {
        (Some(mpv), Some(jellyfin)) => mpv == jellyfin,
        _ => true,
    }
}

/// Folds the names mpv and Jellyfin use for one codec family together.
fn codec_family(codec: Option<&str>) -> Option<String> {
    let codec = codec?.trim().to_ascii_lowercase();
    let family = match codec.as_str() {
        "" => return None,
        "subrip" | "srt" => "subrip",
        "ass" | "ssa" => "ass",
        "webvtt" | "vtt" => "webvtt",
        "hdmv_pgs_subtitle" | "pgssub" | "pgs" => "pgs",
        "dvd_subtitle" | "dvdsub" => "dvdsub",
        "dvb_subtitle" | "dvbsub" => "dvbsub",
        "ac3" | "eac3" => "ac3",
        "dts" | "dca" => "dts",
        "h265" | "hevc" => "hevc",
        "h264" | "avc" => "h264",
        other => other,
    };
    Some(family.into())
}

/// The mpv track id for a Jellyfin stream index, if mpv exposes that stream.
pub fn mpv_id(tracks: &[PlayerTrack], kind: &str, jellyfin_index: i64) -> Option<i64> {
    tracks
        .iter()
        .find(|track| track.kind == kind && track.jellyfin_index == Some(jellyfin_index))
        .map(|track| track.player_id)
}

/// The `aid` and `sid` values that apply the server's default streams.
#[derive(Debug, PartialEq)]
pub struct InitialSelection {
    /// `None` keeps mpv's own audio choice, so something always plays when
    /// the default stream is missing or unmapped.
    pub aid: Option<String>,
    /// `no` unless the default subtitle maps to an mpv track. Fluster never
    /// shows a subtitle the server did not choose.
    pub sid: String,
}

pub fn initial_selection(
    tracks: &[PlayerTrack],
    default_audio: Option<i64>,
    default_subtitle: Option<i64>,
) -> InitialSelection {
    let aid = default_audio
        .and_then(|index| mpv_id(tracks, "Audio", index))
        .map(|id| id.to_string());
    let sid = default_subtitle
        .filter(|index| *index >= 0)
        .and_then(|index| mpv_id(tracks, "Subtitle", index))
        .map(|id| id.to_string())
        .unwrap_or_else(|| "no".into());
    InitialSelection { aid, sid }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_codec(kind: &str) -> &'static str {
        match kind {
            "Video" => "h264",
            "Audio" => "aac",
            _ => "subrip",
        }
    }

    fn jellyfin(index: i64, kind: &str, external: bool) -> MediaTrack {
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

    fn jellyfin_audio(index: i64, language: &str, codec: &str) -> MediaTrack {
        MediaTrack {
            language: Some(language.into()),
            codec: Some(codec.into()),
            ..jellyfin(index, "Audio", false)
        }
    }

    fn mpv(id: i64, kind: &str, ff_index: i64, external: bool) -> MpvTrack {
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

    fn mpv_audio(id: i64, ff_index: i64, language: &str, codec: &str) -> MpvTrack {
        MpvTrack {
            language: Some(language.into()),
            codec: Some(codec.into()),
            ..mpv(id, "Audio", ff_index, false)
        }
    }

    fn indices(tracks: &[PlayerTrack]) -> Vec<(i64, &str, Option<i64>)> {
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
}
