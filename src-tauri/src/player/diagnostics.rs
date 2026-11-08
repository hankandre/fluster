//! The decode-mode label and warning shown in the player information panel.

use crate::model::{DecodeMode, PlaybackSnapshot};

pub(super) fn update_decode_label(snapshot: &mut PlaybackSnapshot) {
    let current = snapshot
        .diagnostics
        .hwdec_current
        .as_deref()
        .unwrap_or("")
        .to_ascii_lowercase();
    if current.is_empty() || current == "no" {
        snapshot.diagnostics.decode_mode = DecodeMode::Software;
        snapshot.diagnostics.decode_label = "Software — CPU".into();
        snapshot.diagnostics.warning = Some(
            "Hardware decoding is not active. libmpv is decoding locally on the CPU; server transcoding remains disabled."
                .into(),
        );
        return;
    }
    snapshot.diagnostics.decode_mode = DecodeMode::Hardware;
    snapshot.diagnostics.warning = None;
    let backend = if current.contains("nvdec") || current.contains("cuda") {
        "NVDEC"
    } else if current.contains("vaapi") {
        "VA-API"
    } else if current.contains("vulkan") {
        "Vulkan"
    } else if current.contains("videotoolbox") {
        "VideoToolbox"
    } else {
        current.as_str()
    };
    snapshot.diagnostics.decode_label = format!("Hardware — {backend}");
}

#[cfg(test)]
mod tests {
    use super::super::properties::{apply_property, PropertyUpdate, RuntimeState};
    use super::*;
    use libmpv2::events::PropertyData;

    #[test]
    fn runtime_properties_are_authoritative_for_decode_mode() {
        let mut state = RuntimeState::new();
        assert_eq!(
            apply_property(&mut state, "hwdec-current", PropertyData::Str("nvdec")),
            Some(PropertyUpdate::Ordinary)
        );
        assert!(matches!(
            state.snapshot.diagnostics.decode_mode,
            DecodeMode::Hardware
        ));
        assert_eq!(state.snapshot.diagnostics.decode_label, "Hardware — NVDEC");
        apply_property(&mut state, "hwdec-current", PropertyData::Str("no"));
        assert!(matches!(
            state.snapshot.diagnostics.decode_mode,
            DecodeMode::Software
        ));
    }
}
