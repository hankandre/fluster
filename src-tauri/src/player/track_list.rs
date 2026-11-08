//! Reads mpv's `track-list`, adds external subtitles, and applies selections.

use super::string_property;
use super::tracks::{self, MpvTrack};
use crate::model::{MediaTrack, PlaybackPlan, PlaybackSnapshot, PlayerTrack};
use libmpv2::Mpv;

/// Adds each external subtitle with `sub-add` and returns the Jellyfin
/// indices of the ones mpv loaded, in add order.
pub(super) fn load_external_subtitles(mpv: &Mpv, jellyfin_tracks: &[MediaTrack]) -> Vec<i64> {
    let mut added = Vec::new();
    for track in jellyfin_tracks
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
    {
        let Some(url) = track.delivery_url.as_deref() else {
            continue;
        };
        let language = track.language.as_deref().unwrap_or("und");
        // `auto` adds the track without selecting it; the server's default
        // decides the selection in `apply_initial_selection`.
        let result = mpv.command(
            "sub-add",
            &[url, "auto", track.display_title.as_str(), language],
        );
        if result.is_ok() {
            added.push(track.index);
        }
    }
    added
}

/// Selects the server's default audio and subtitle streams.
pub(super) fn apply_initial_selection(mpv: &Mpv, tracks: &[PlayerTrack], plan: &PlaybackPlan) {
    let selection = tracks::initial_selection(
        tracks,
        plan.default_audio_stream_index,
        plan.default_subtitle_stream_index,
    );
    if let Some(aid) = selection.aid.as_deref() {
        let _ = mpv.set_property("aid", aid);
    }
    let _ = mpv.set_property("sid", selection.sid.as_str());
}

pub(super) fn read_tracks(
    mpv: &Mpv,
    jellyfin_tracks: &[MediaTrack],
    added_externals: &[i64],
) -> Vec<PlayerTrack> {
    tracks::player_tracks(jellyfin_tracks, added_externals, &read_mpv_tracks(mpv))
}

/// mpv's `track-list`, unmapped.
pub(super) fn read_mpv_tracks(mpv: &Mpv) -> Vec<MpvTrack> {
    let count = mpv
        .get_property::<i64>("track-list/count")
        .unwrap_or(0)
        .max(0);
    (0..count)
        .filter_map(|position| {
            let prefix = format!("track-list/{position}");
            let kind = match string_property(mpv, &format!("{prefix}/type"))?.as_str() {
                "audio" => "Audio",
                "sub" => "Subtitle",
                "video" => "Video",
                _ => return None,
            };
            Some(MpvTrack {
                id: mpv.get_property::<i64>(&format!("{prefix}/id")).ok()?,
                kind: kind.into(),
                ff_index: mpv.get_property::<i64>(&format!("{prefix}/ff-index")).ok(),
                external: mpv
                    .get_property::<bool>(&format!("{prefix}/external"))
                    .unwrap_or(false),
                codec: string_property(mpv, &format!("{prefix}/codec")),
                title: string_property(mpv, &format!("{prefix}/title")),
                language: string_property(mpv, &format!("{prefix}/lang")),
                selected: mpv
                    .get_property::<bool>(&format!("{prefix}/selected"))
                    .unwrap_or(false),
            })
        })
        .collect()
}

pub(super) fn update_selected_track(
    snapshot: &mut PlaybackSnapshot,
    kind: &str,
    player_id: Option<i64>,
) -> bool {
    let previous_player_id = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == kind && track.selected)
        .map(|track| track.player_id);
    for track in snapshot
        .tracks
        .iter_mut()
        .filter(|track| track.kind == kind)
    {
        track.selected = Some(track.player_id) == player_id;
    }
    let jellyfin_index = player_id.and_then(|id| {
        snapshot
            .tracks
            .iter()
            .find(|track| track.kind == kind && track.player_id == id)
            .and_then(|track| track.jellyfin_index)
    });
    if kind == "Audio" {
        snapshot.audio_track = jellyfin_index;
    } else {
        snapshot.subtitle_track = jellyfin_index;
    }
    let selected_player_id = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == kind && track.selected)
        .map(|track| track.player_id);
    previous_player_id != selected_player_id
}

pub(super) fn refresh_selected_streams(snapshot: &mut PlaybackSnapshot) {
    let audio = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == "Audio" && track.selected)
        .map(|track| track.player_id);
    let subtitle = snapshot
        .tracks
        .iter()
        .find(|track| track.kind == "Subtitle" && track.selected)
        .map(|track| track.player_id);
    let _ = update_selected_track(snapshot, "Audio", audio);
    let _ = update_selected_track(snapshot, "Subtitle", subtitle);
}

#[cfg(test)]
mod tests {
    use super::super::test_support::player_track;
    use super::*;

    #[test]
    fn selected_player_track_reports_jellyfin_stream_index() {
        let mut snapshot = PlaybackSnapshot::default();
        snapshot.tracks.push(player_track(2, 7, false));
        assert!(update_selected_track(&mut snapshot, "Audio", Some(2)));
        assert_eq!(snapshot.audio_track, Some(7));
        assert!(snapshot.tracks[0].selected);
        assert!(!update_selected_track(&mut snapshot, "Audio", Some(2)));
    }
}
