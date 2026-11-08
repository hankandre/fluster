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
pub(super) struct MpvTrack {
    pub(super) id: i64,
    /// `Audio`, `Subtitle`, or `Video`, as Jellyfin names stream types.
    pub(super) kind: String,
    pub(super) ff_index: Option<i64>,
    pub(super) external: bool,
    pub(super) codec: Option<String>,
    pub(super) title: Option<String>,
    pub(super) language: Option<String>,
    pub(super) selected: bool,
}

/// Builds the player tracks the frontend sees. `added_externals` holds the
/// Jellyfin indices of the external subtitles `sub-add` loaded, in add order.
pub(super) fn player_tracks(
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

/// Tracks of a converted (HLS) session. The server's output carries only the
/// requested audio stream and none of the source's embedded subtitles (they
/// are burned in or delivered as files), and its codecs and stream numbers
/// need not match the source, so embedded tracks are never mapped by
/// `ff-index`, ordinal, or codec. `subtitles` are the files Fluster added
/// from loopback, mapped by add order as for the original file. The one
/// embedded audio track maps to `audio` (the master URL's
/// `AudioStreamIndex`) only when mpv lists exactly one. Everything else,
/// video included, stays unmapped.
pub(super) fn hls_player_tracks(
    subtitles: &[MediaTrack],
    added_externals: &[i64],
    mpv_tracks: &[MpvTrack],
    audio: Option<&MediaTrack>,
) -> Vec<PlayerTrack> {
    let externals_only: Vec<MediaTrack> = subtitles
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
        .cloned()
        .collect();
    let mut tracks = player_tracks(&externals_only, added_externals, mpv_tracks);
    let Some(audio) = audio.filter(|audio| audio.kind == "Audio") else {
        return tracks;
    };
    let embedded_audio: Vec<usize> = mpv_tracks
        .iter()
        .enumerate()
        .filter(|(_, track)| track.kind == "Audio" && !track.external)
        .map(|(position, _)| position)
        .collect();
    if let [position] = embedded_audio.as_slice() {
        let track = &mut tracks[*position];
        track.jellyfin_index = Some(audio.index);
        if mpv_tracks[*position].title.is_none() {
            track.title = audio.display_title.clone();
        }
        if track.language.is_none() {
            track.language = audio.language.clone();
        }
    }
    tracks
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
fn mpv_id(tracks: &[PlayerTrack], kind: &str, jellyfin_index: i64) -> Option<i64> {
    tracks
        .iter()
        .find(|track| track.kind == kind && track.jellyfin_index == Some(jellyfin_index))
        .map(|track| track.player_id)
}

/// The `aid` and `sid` values that apply the server's default streams.
#[derive(Debug, PartialEq)]
pub(super) struct InitialSelection {
    /// `None` keeps mpv's own audio choice, so something always plays when
    /// the default stream is missing or unmapped.
    pub(super) aid: Option<String>,
    /// `no` unless the default subtitle maps to an mpv track. Fluster never
    /// shows a subtitle the server did not choose.
    pub(super) sid: String,
}

pub(super) fn initial_selection(
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
mod hls_tests;
#[cfg(test)]
mod tests;
