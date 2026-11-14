//! Observed libmpv properties and how each one updates the playback snapshot.

use super::diagnostics::update_decode_label;
use super::stream_facts::apply_stream_property;
use super::track_list::update_selected_track;
use crate::model::PlaybackSnapshot;
use libmpv2::events::PropertyData;
use libmpv2::{Format, Mpv};

pub(super) fn observe_properties(mpv: &Mpv) -> libmpv2::Result<()> {
    let properties = [
        ("time-pos", Format::Double),
        ("duration", Format::Double),
        ("pause", Format::Flag),
        ("paused-for-cache", Format::Flag),
        ("volume", Format::Double),
        ("mute", Format::Flag),
        ("aid", Format::String),
        ("sid", Format::String),
        ("seeking", Format::Flag),
        ("hwdec-current", Format::String),
        ("hwdec-interop", Format::String),
        ("video-params/hw-pixelformat", Format::String),
        ("current-vo", Format::String),
        ("current-gpu-context", Format::String),
        ("video-codec", Format::String),
        ("video-params/bit-depth", Format::Int64),
        ("width", Format::Int64),
        ("height", Format::Int64),
        ("decoder-frame-drop-count", Format::Int64),
        ("vo-drop-frame-count", Format::Int64),
        ("video-params/gamma", Format::String),
        ("audio-params/channel-count", Format::Int64),
        ("audio-params/samplerate", Format::Int64),
        ("audio-out-params/format", Format::String),
        ("audio-out-params/channel-count", Format::Int64),
        ("demuxer-cache-time", Format::Double),
    ];
    for (id, (name, format)) in properties.into_iter().enumerate() {
        mpv.observe_property(name, format, id as u64 + 1)?;
    }
    Ok(())
}

pub(super) struct RuntimeState {
    pub(super) snapshot: PlaybackSnapshot,
    decoder_drops: u64,
    output_drops: u64,
    seeking: bool,
    /// The `video-params/gamma` name, kept so the range can be recomputed
    /// when the Dolby Vision profile arrives.
    pub(super) gamma: Option<String>,
}

impl RuntimeState {
    pub(super) fn new() -> Self {
        Self {
            snapshot: PlaybackSnapshot::default(),
            decoder_drops: 0,
            output_drops: 0,
            seeking: false,
            gamma: None,
        }
    }
}

#[derive(Debug, PartialEq)]
pub(super) enum PropertyUpdate {
    Ordinary,
    Immediate(&'static str),
    TracksChanged,
}

pub(super) fn apply_property(
    state: &mut RuntimeState,
    name: &str,
    data: PropertyData<'_>,
) -> Option<PropertyUpdate> {
    match (name, data) {
        ("time-pos", PropertyData::Double(value)) => {
            if state.snapshot.position_seconds == value {
                return None;
            }
            state.snapshot.position_seconds = value;
        }
        ("duration", PropertyData::Double(value)) => {
            if state.snapshot.duration_seconds == Some(value) {
                return None;
            }
            state.snapshot.duration_seconds = Some(value);
        }
        ("pause", PropertyData::Flag(value)) => {
            if state.snapshot.paused == value {
                return None;
            }
            state.snapshot.paused = value;
            return Some(PropertyUpdate::Immediate("pause"));
        }
        ("paused-for-cache", PropertyData::Flag(value)) => {
            if state.snapshot.buffering == value {
                return None;
            }
            state.snapshot.buffering = value;
            return Some(PropertyUpdate::Immediate("property"));
        }
        ("volume", PropertyData::Double(value)) => {
            if state.snapshot.volume == value {
                return None;
            }
            state.snapshot.volume = value;
        }
        ("mute", PropertyData::Flag(value)) => {
            if state.snapshot.muted == value {
                return None;
            }
            state.snapshot.muted = value;
        }
        ("aid", PropertyData::Str(value)) => {
            let changed = update_selected_track(&mut state.snapshot, "Audio", value.parse().ok());
            return changed.then_some(PropertyUpdate::TracksChanged);
        }
        ("sid", PropertyData::Str(value)) => {
            let changed =
                update_selected_track(&mut state.snapshot, "Subtitle", value.parse().ok());
            return changed.then_some(PropertyUpdate::TracksChanged);
        }
        ("seeking", PropertyData::Flag(value)) => {
            let completed = state.seeking && !value;
            state.seeking = value;
            if completed {
                return Some(PropertyUpdate::Immediate("seek"));
            }
            return None;
        }
        ("hwdec-current", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hwdec_current.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hwdec_current = Some(value.into());
            update_decode_label(&mut state.snapshot);
        }
        ("hwdec-interop", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hwdec_interop.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hwdec_interop = Some(value.into())
        }
        ("video-params/hw-pixelformat", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.hw_pixel_format.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.hw_pixel_format = Some(value.into())
        }
        ("current-vo", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.video_output.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.video_output = Some(value.into())
        }
        ("current-gpu-context", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.gpu_context.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.gpu_context = Some(value.into())
        }
        ("video-codec", PropertyData::Str(value)) => {
            if state.snapshot.diagnostics.video_codec.as_deref() == Some(value) {
                return None;
            }
            state.snapshot.diagnostics.video_codec = Some(value.into())
        }
        ("video-params/bit-depth", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.bit_depth == value {
                return None;
            }
            state.snapshot.diagnostics.bit_depth = value;
        }
        ("width", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.width == value {
                return None;
            }
            state.snapshot.diagnostics.width = value;
        }
        ("height", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).ok();
            if state.snapshot.diagnostics.height == value {
                return None;
            }
            state.snapshot.diagnostics.height = value;
        }
        ("decoder-frame-drop-count", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).unwrap_or(0);
            if state.decoder_drops == value {
                return None;
            }
            state.decoder_drops = value;
        }
        ("vo-drop-frame-count", PropertyData::Int64(value)) => {
            let value = u64::try_from(value).unwrap_or(0);
            if state.output_drops == value {
                return None;
            }
            state.output_drops = value;
        }
        (name, data) => return apply_stream_property(state, name, data),
    }
    state.snapshot.diagnostics.dropped_frames = state.decoder_drops + state.output_drops;
    Some(PropertyUpdate::Ordinary)
}

#[cfg(test)]
mod tests {
    use super::super::test_support::player_track;
    use super::*;

    #[test]
    fn property_updates_separate_immediate_events_from_coalesced_state() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "time-pos", PropertyData::Double(1.5)),
            Some(PropertyUpdate::Ordinary)
        );
        assert_eq!(
            apply_property(&mut state, "pause", PropertyData::Flag(true)),
            Some(PropertyUpdate::Immediate("pause"))
        );
        assert_eq!(
            apply_property(&mut state, "paused-for-cache", PropertyData::Flag(true)),
            Some(PropertyUpdate::Immediate("property"))
        );

        assert_eq!(
            apply_property(&mut state, "seeking", PropertyData::Flag(true)),
            None
        );
        assert_eq!(
            apply_property(&mut state, "seeking", PropertyData::Flag(false)),
            Some(PropertyUpdate::Immediate("seek"))
        );
    }

    #[test]
    fn track_events_are_emitted_only_when_the_selection_changes() {
        let mut state = RuntimeState::new();
        state.snapshot.tracks = vec![player_track(1, 4, true), player_track(2, 7, false)];
        state.snapshot.audio_track = Some(4);

        assert_eq!(
            apply_property(&mut state, "aid", PropertyData::Str("1")),
            None
        );
        assert_eq!(
            apply_property(&mut state, "aid", PropertyData::Str("2")),
            Some(PropertyUpdate::TracksChanged)
        );
        assert_eq!(state.snapshot.audio_track, Some(7));
    }
}
