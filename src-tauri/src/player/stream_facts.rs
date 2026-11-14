//! Video and audio facts and the buffered position, read from named libmpv
//! properties and mapped into typed snapshot fields.

use super::properties::{PropertyUpdate, RuntimeState};
use super::string_property;
use crate::model::VideoRange;
use libmpv2::events::PropertyData;
use libmpv2::Mpv;

const SDR_CURVES: [&str; 5] = ["bt.1886", "srgb", "linear", "prophoto", "st428"];

/// `video-params/gamma` names a transfer curve. A Dolby Vision profile on the
/// selected track wins: it reports the track's signalling, not proof that the
/// enhancement layer was rendered. Unlisted curves are `Unknown`, never `Sdr`.
pub(super) fn video_range(gamma: Option<&str>, dolby_vision_profile: Option<u64>) -> VideoRange {
    if dolby_vision_profile.is_some() {
        return VideoRange::DolbyVision;
    }
    match gamma {
        Some("pq") => VideoRange::Pq,
        Some("hlg") => VideoRange::Hlg,
        Some(curve) if SDR_CURVES.contains(&curve) || curve.starts_with("gamma") => VideoRange::Sdr,
        _ => VideoRange::Unknown,
    }
}

fn count(value: i64) -> Option<u64> {
    u64::try_from(value).ok()
}

/// Updates a field and reports whether it changed.
fn set<T: PartialEq>(field: &mut T, value: T) -> bool {
    if *field == value {
        return false;
    }
    *field = value;
    true
}

/// Maps the stream properties. Every update is coalesced; none is immediate.
pub(super) fn apply_stream_property(
    state: &mut RuntimeState,
    name: &str,
    data: PropertyData<'_>,
) -> Option<PropertyUpdate> {
    let changed = match (name, data) {
        ("video-params/gamma", PropertyData::Str(value)) => {
            let changed = set(&mut state.gamma, Some(value.to_string()));
            let range = video_range(
                state.gamma.as_deref(),
                state.snapshot.video.dolby_vision_profile,
            );
            set(&mut state.snapshot.video.range, range) || changed
        }
        ("audio-params/channel-count", PropertyData::Int64(value)) => {
            set(&mut state.snapshot.audio.channel_count, count(value))
        }
        ("audio-params/samplerate", PropertyData::Int64(value)) => {
            set(&mut state.snapshot.audio.sample_rate, count(value))
        }
        ("audio-out-params/format", PropertyData::Str(value)) => set(
            &mut state.snapshot.audio.output_format,
            Some(value.to_string()),
        ),
        ("audio-out-params/channel-count", PropertyData::Int64(value)) => {
            set(&mut state.snapshot.audio.output_channel_count, count(value))
        }
        ("demuxer-cache-time", PropertyData::Double(value)) => {
            let value = (value.is_finite() && value >= 0.0).then_some(value);
            set(&mut state.snapshot.buffered_seconds, value)
        }
        _ => false,
    };
    changed.then_some(PropertyUpdate::Ordinary)
}

/// Reads the selected tracks' codecs and the Dolby Vision profile. Returns
/// true when anything changed. Called on load and on reconfiguration instead
/// of observing computed `current-tracks/...` paths.
pub(super) fn read_current_codecs(mpv: &Mpv, state: &mut RuntimeState) -> bool {
    let video_codec = string_property(mpv, "current-tracks/video/codec").filter(|v| !v.is_empty());
    let audio_codec = string_property(mpv, "current-tracks/audio/codec").filter(|v| !v.is_empty());
    let profile = mpv
        .get_property::<i64>("current-tracks/video/dolby-vision-profile")
        .ok()
        .and_then(count);
    let mut changed = apply_current_codecs(state, video_codec, audio_codec, profile);
    // libmpv2 drops property-unavailable events, so re-read the cache time.
    let cache = mpv.get_property::<f64>("demuxer-cache-time").ok();
    changed |= apply_buffered(state, cache);
    changed
}

fn apply_buffered(state: &mut RuntimeState, value: Option<f64>) -> bool {
    let value = value.filter(|v| v.is_finite() && *v >= 0.0);
    set(&mut state.snapshot.buffered_seconds, value)
}

fn apply_current_codecs(
    state: &mut RuntimeState,
    video_codec: Option<String>,
    audio_codec: Option<String>,
    profile: Option<u64>,
) -> bool {
    // A missing track means its stream properties are unavailable. libmpv2
    // never reports that, so clear the facts here.
    let mut changed = false;
    if video_codec.is_none() {
        changed |= set(&mut state.gamma, None);
    }
    let facts = &mut state.snapshot;
    if audio_codec.is_none() {
        changed |= set(&mut facts.audio.channel_count, None);
        changed |= set(&mut facts.audio.sample_rate, None);
        changed |= set(&mut facts.audio.output_format, None);
        changed |= set(&mut facts.audio.output_channel_count, None);
    }
    changed |= set(&mut facts.video.codec, video_codec);
    changed |= set(&mut facts.audio.codec, audio_codec);
    changed |= set(&mut facts.video.dolby_vision_profile, profile);
    let range = video_range(state.gamma.as_deref(), profile);
    changed |= set(&mut state.snapshot.video.range, range);
    changed
}

#[cfg(test)]
mod tests {
    use super::super::properties::apply_property;
    use super::*;

    #[test]
    fn video_range_maps_curves_and_lets_dolby_vision_win() {
        assert_eq!(video_range(Some("pq"), None), VideoRange::Pq);
        assert_eq!(video_range(Some("hlg"), None), VideoRange::Hlg);
        for sdr in ["bt.1886", "srgb", "gamma2.2"] {
            assert_eq!(video_range(Some(sdr), None), VideoRange::Sdr, "{sdr}");
        }
        for unknown in ["auto", "v-log", ""] {
            assert_eq!(
                video_range(Some(unknown), None),
                VideoRange::Unknown,
                "{unknown}"
            );
        }
        assert_eq!(video_range(None, None), VideoRange::Unknown);
        assert_eq!(video_range(Some("pq"), Some(8)), VideoRange::DolbyVision);
        assert_eq!(video_range(None, Some(5)), VideoRange::DolbyVision);
    }

    #[test]
    fn gamma_sets_the_range_and_repeats_are_ignored() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "video-params/gamma", PropertyData::Str("pq")),
            Some(PropertyUpdate::Ordinary)
        );
        assert_eq!(state.snapshot.video.range, VideoRange::Pq);
        assert_eq!(
            apply_property(&mut state, "video-params/gamma", PropertyData::Str("pq")),
            None
        );
    }

    #[test]
    fn audio_properties_fill_their_fields() {
        let mut state = RuntimeState::new();
        let cases = [
            ("audio-params/channel-count", PropertyData::Int64(8)),
            ("audio-params/samplerate", PropertyData::Int64(48000)),
            ("audio-out-params/format", PropertyData::Str("floatp")),
            ("audio-out-params/channel-count", PropertyData::Int64(2)),
        ];
        for (name, data) in cases {
            assert_eq!(
                apply_property(&mut state, name, data),
                Some(PropertyUpdate::Ordinary),
                "{name}"
            );
        }
        let audio = &state.snapshot.audio;
        assert_eq!(audio.channel_count, Some(8));
        assert_eq!(audio.sample_rate, Some(48000));
        assert_eq!(audio.output_format.as_deref(), Some("floatp"));
        assert_eq!(audio.output_channel_count, Some(2));
        assert_eq!(
            apply_property(
                &mut state,
                "audio-params/channel-count",
                PropertyData::Int64(8)
            ),
            None
        );
        assert_eq!(
            apply_property(
                &mut state,
                "audio-params/channel-count",
                PropertyData::Int64(-1)
            ),
            Some(PropertyUpdate::Ordinary)
        );
        assert_eq!(state.snapshot.audio.channel_count, None);
    }

    #[test]
    fn buffered_position_accepts_only_finite_non_negative_values() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "demuxer-cache-time", PropertyData::Double(42.5)),
            Some(PropertyUpdate::Ordinary)
        );
        assert_eq!(state.snapshot.buffered_seconds, Some(42.5));
        for bad in [f64::NAN, -1.0] {
            apply_property(&mut state, "demuxer-cache-time", PropertyData::Double(bad));
            assert_eq!(state.snapshot.buffered_seconds, None);
            state.snapshot.buffered_seconds = Some(1.0);
        }
    }

    #[test]
    fn stream_properties_are_never_immediate_or_track_changes() {
        let mut state = RuntimeState::new();
        let updates = [
            apply_property(&mut state, "video-params/gamma", PropertyData::Str("hlg")),
            apply_property(
                &mut state,
                "audio-params/samplerate",
                PropertyData::Int64(44100),
            ),
            apply_property(&mut state, "demuxer-cache-time", PropertyData::Double(3.0)),
        ];
        for update in updates {
            assert_eq!(update, Some(PropertyUpdate::Ordinary));
        }
    }

    #[test]
    fn stream_properties_leave_dropped_frames_alone() {
        let mut state = RuntimeState::new();
        apply_property(
            &mut state,
            "decoder-frame-drop-count",
            PropertyData::Int64(4),
        );
        assert_eq!(state.snapshot.diagnostics.dropped_frames, 4);
        state.snapshot.diagnostics.dropped_frames = 9;
        apply_property(&mut state, "demuxer-cache-time", PropertyData::Double(1.0));
        assert_eq!(state.snapshot.diagnostics.dropped_frames, 9);
    }

    #[test]
    fn current_codecs_recompute_the_range_and_report_changes() {
        let mut state = RuntimeState::new();
        apply_property(&mut state, "video-params/gamma", PropertyData::Str("pq"));
        assert!(apply_current_codecs(
            &mut state,
            Some("hevc".into()),
            Some("truehd".into()),
            Some(8)
        ));
        assert_eq!(state.snapshot.video.range, VideoRange::DolbyVision);
        assert_eq!(state.snapshot.video.dolby_vision_profile, Some(8));
        assert_eq!(state.snapshot.audio.codec.as_deref(), Some("truehd"));
        assert!(!apply_current_codecs(
            &mut state,
            Some("hevc".into()),
            Some("truehd".into()),
            Some(8)
        ));
        assert!(apply_current_codecs(
            &mut state,
            Some("hevc".into()),
            None,
            None
        ));
        assert_eq!(state.snapshot.video.range, VideoRange::Pq);
    }

    #[test]
    fn missing_tracks_clear_their_stream_facts() {
        let mut state = RuntimeState::new();
        apply_property(&mut state, "video-params/gamma", PropertyData::Str("pq"));
        apply_property(
            &mut state,
            "audio-params/channel-count",
            PropertyData::Int64(8),
        );
        apply_property(
            &mut state,
            "audio-params/samplerate",
            PropertyData::Int64(48000),
        );
        apply_property(
            &mut state,
            "audio-out-params/format",
            PropertyData::Str("spdif-eac3"),
        );
        apply_property(
            &mut state,
            "audio-out-params/channel-count",
            PropertyData::Int64(2),
        );
        assert!(apply_current_codecs(
            &mut state,
            Some("hevc".into()),
            None,
            None
        ));
        let audio = &state.snapshot.audio;
        assert_eq!(audio.channel_count, None);
        assert_eq!(audio.sample_rate, None);
        assert_eq!(audio.output_format, None);
        assert_eq!(audio.output_channel_count, None);
        assert_eq!(state.snapshot.video.range, VideoRange::Pq);
        assert!(apply_current_codecs(&mut state, None, None, None));
        assert_eq!(state.gamma, None);
        assert_eq!(state.snapshot.video.range, VideoRange::Unknown);
    }

    #[test]
    fn unavailable_cache_time_clears_the_buffered_position() {
        let mut state = RuntimeState::new();
        assert!(apply_buffered(&mut state, Some(12.0)));
        assert!(!apply_buffered(&mut state, Some(12.0)));
        assert!(apply_buffered(&mut state, None));
        assert_eq!(state.snapshot.buffered_seconds, None);
    }
}
