//! Fixtures shared by the player tests.

use crate::auth_header::MediaBrowserAuthorization;
use crate::model::{Delivery, HlsMediaKind, LaunchRequest, MediaTrack, PlayerTrack};

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
            delivery: Delivery::Static,
        },
        authorization: test_authorization(),
        test_force_software: false,
    }
}

/// A converted launch as the frontend sends it: the master URL for `item_id`
/// with source `m` and session `p` on `server_url`, an AAC audio stream at
/// index 1, and one external SubRip subtitle per URL from index 3.
pub(super) fn hls_launch_request(
    server_url: &str,
    master_url: &str,
    item_id: &str,
    subtitle_urls: &[String],
) -> LaunchRequest {
    let mut request = launch_request(master_url, None);
    let plan = &mut request.plan;
    plan.item_id = item_id.into();
    plan.media_source_id = "m".into();
    plan.play_session_id = "p".into();
    plan.delivery = Delivery::Hls {
        server_url: server_url.into(),
        media_kind: HlsMediaKind::Videos,
    };
    plan.default_audio_stream_index = Some(1);
    plan.tracks.push(MediaTrack {
        index: 1,
        kind: "Audio".into(),
        display_title: "English - AAC".into(),
        codec: Some("aac".into()),
        language: Some("eng".into()),
        external: false,
        delivery_url: None,
    });
    for (offset, url) in subtitle_urls.iter().enumerate() {
        plan.tracks.push(MediaTrack {
            index: 3 + offset as i64,
            kind: "Subtitle".into(),
            display_title: format!("Subtitle {offset}"),
            codec: Some("subrip".into()),
            language: Some("eng".into()),
            external: true,
            delivery_url: Some(url.clone()),
        });
    }
    request
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
