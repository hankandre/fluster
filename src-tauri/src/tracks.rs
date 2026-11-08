//! Maps Jellyfin stream indices to mpv tracks and back.
//!
//! Jellyfin numbers external streams first (`FFProbeVideoInfo.cs`), so an
//! embedded stream's Jellyfin `Index` is its ffprobe index plus the number of
//! external streams. mpv reports the ffprobe index of an embedded track as
//! `ff-index`. An external file Fluster loads with `sub-add` is its own
//! demuxer, so its `ff-index` is the stream index inside that file (0 for a
//! single-stream subtitle) and says nothing about Jellyfin. mpv appends every
//! new track to `track-list` (`add_stream_track` in `player/loadfile.c`), so
//! the external tracks appear in the order Fluster added them.

use crate::model::{MediaTrack, PlayerTrack};

/// One `track-list` entry, as read from libmpv.
#[derive(Debug, Clone, PartialEq)]
pub struct MpvTrack {
    pub id: i64,
    /// `Audio`, `Subtitle`, or `Video`, as Jellyfin names stream types.
    pub kind: String,
    pub ff_index: Option<i64>,
    pub external: bool,
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
    let external_count = jellyfin_tracks
        .iter()
        .filter(|track| track.external)
        .count() as i64;
    let mpv_external_count = mpv_tracks.iter().filter(|track| track.external).count();
    // If mpv shows a different number of external tracks than Fluster added,
    // add order no longer identifies them, so leave them all unmapped.
    let externals_line_up = mpv_external_count == added_externals.len();
    let mut external_position = 0;

    mpv_tracks
        .iter()
        .map(|track| {
            let jellyfin_index = if track.external {
                let index = added_externals.get(external_position).copied();
                external_position += 1;
                index.filter(|_| externals_line_up)
            } else {
                track.ff_index.map(|ff_index| ff_index + external_count)
            };
            let jellyfin = jellyfin_index.and_then(|index| {
                jellyfin_tracks.iter().find(|candidate| {
                    candidate.index == index
                        && candidate.kind == track.kind
                        && candidate.external == track.external
                })
            });
            PlayerTrack {
                player_id: track.id,
                jellyfin_index: jellyfin.map(|candidate| candidate.index),
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
    /// the default stream is missing.
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

    fn jellyfin(index: i64, kind: &str, external: bool) -> MediaTrack {
        MediaTrack {
            index,
            kind: kind.into(),
            display_title: format!("{kind} {index}"),
            language: Some("eng".into()),
            external,
            delivery_url: None,
        }
    }

    fn mpv(id: i64, kind: &str, ff_index: i64, external: bool) -> MpvTrack {
        MpvTrack {
            id,
            kind: kind.into(),
            ff_index: Some(ff_index),
            external,
            title: None,
            language: None,
            selected: false,
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

    /// `playbackinfo-multitrack-profile.json`: video 0, English AAC 1,
    /// Spanish AC-3 2, no externals, DefaultAudioStreamIndex 1 and no
    /// DefaultSubtitleStreamIndex.
    #[test]
    fn tracks_map_multitrack_audio_without_externals() {
        let plan = vec![
            jellyfin(0, "Video", false),
            jellyfin(1, "Audio", false),
            jellyfin(2, "Audio", false),
        ];
        let listed = vec![
            mpv(1, "Video", 0, false),
            mpv(1, "Audio", 1, false),
            mpv(2, "Audio", 2, false),
        ];
        let tracks = player_tracks(&plan, &[], &listed);
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
    fn tracks_check_the_stream_type_and_a_missing_ff_index() {
        let mut listed = sidecar_mpv();
        // ff-index 0 + 1 external = Jellyfin 1, which is the video, not audio.
        listed[1].ff_index = Some(0);
        listed[0].ff_index = None;
        let tracks = player_tracks(&sidecar_plan(), &[0], &listed);
        assert_eq!(tracks[0].jellyfin_index, None);
        assert_eq!(tracks[1].jellyfin_index, None);
        assert_eq!(tracks[2].jellyfin_index, Some(0));
    }
}
