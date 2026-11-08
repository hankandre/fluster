//! Fixtures shared by the player tests.

use crate::auth_header::MediaBrowserAuthorization;
use crate::model::{LaunchRequest, MediaTrack, PlayerTrack};

pub(super) fn launch_request(stream_url: &str, subtitle_url: Option<&str>) -> LaunchRequest {
    let tracks = subtitle_url
        .map(|delivery_url| MediaTrack {
            index: 4,
            kind: "Subtitle".into(),
            display_title: "English".into(),
            codec: None,
            language: Some("eng".into()),
            external: true,
            delivery_url: Some(delivery_url.into()),
        })
        .into_iter()
        .collect();
    LaunchRequest {
        plan: crate::model::PlaybackPlan {
            item_id: "item".into(),
            title: "Test video".into(),
            stream_url: stream_url.into(),
            media_source_id: "source".into(),
            play_session_id: "session".into(),
            start_position_ticks: 0,
            tracks,
            default_audio_stream_index: None,
            default_subtitle_stream_index: None,
        },
        authorization: test_authorization(),
        test_force_software: false,
    }
}

pub(super) fn test_authorization() -> MediaBrowserAuthorization {
    MediaBrowserAuthorization::parse(
            "MediaBrowser Client=\"Fluster\", Device=\"Test\", DeviceId=\"d\", Version=\"0\", Token=\"header-secret\"",
        )
        .expect("valid test header")
}

pub(super) fn player_track(id: i64, jellyfin_index: i64, selected: bool) -> PlayerTrack {
    PlayerTrack {
        player_id: id,
        jellyfin_index: Some(jellyfin_index),
        kind: "Audio".into(),
        title: format!("Audio {id}"),
        language: Some("eng".into()),
        external: false,
        selected,
    }
}
