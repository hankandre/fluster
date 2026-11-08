//! Real libmpv `track-list` mapping and default selection, offline and live.

use super::*;
use crate::model::{LaunchRequest, MediaTrack, PlaybackSnapshot};
use crate::player::network::validate_playback_urls;
use crate::player::test_support::launch_request;
use crate::player::track_list::{
    apply_initial_selection, load_external_subtitles, read_tracks, refresh_selected_streams,
};

/// Reads mpv's real `track-list` for an embedded stream plus two
/// `sub-add` files. Each external file is its own demuxer, so both report
/// `external: yes` and `ff-index` 0; only add order tells them apart.
#[test]
fn real_tracks_map_by_ff_index_and_add_order_and_apply_defaults() {
    let Some(mut mpv) = headless_player(&test_authorization()) else {
        return;
    };
    let (server, origin) = listener();
    let _requests = serve(server, String::new());
    mpv.command("loadfile", &[&format!("{origin}/stream"), "replace"])
        .expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));

    let sidecar = |index: i64| MediaTrack {
        index,
        kind: "Subtitle".into(),
        display_title: format!("Sidecar {index}"),
        codec: Some("subrip".into()),
        language: Some("eng".into()),
        external: true,
        delivery_url: Some(format!("{origin}/sub.srt")),
    };
    let mut plan = launch_request(&format!("{origin}/stream"), None).plan;
    plan.tracks = vec![
        sidecar(0),
        sidecar(1),
        MediaTrack {
            index: 2,
            kind: "Audio".into(),
            display_title: "PCM".into(),
            codec: Some("pcm_s16le".into()),
            language: None,
            external: false,
            delivery_url: None,
        },
    ];
    let added = load_external_subtitles(&mpv, &plan.tracks);
    assert_eq!(added, vec![0, 1]);

    let raw: Vec<(i64, String, i64, bool)> = (0..3)
        .map(|n| {
            let field = |name: &str| format!("track-list/{n}/{name}");
            (
                mpv.get_property::<i64>(&field("id")).expect("id"),
                mpv.get_property::<String>(&field("type")).expect("type"),
                mpv.get_property::<i64>(&field("ff-index"))
                    .expect("ff-index"),
                mpv.get_property::<bool>(&field("external"))
                    .expect("external"),
            )
        })
        .collect();
    eprintln!("mpv track-list (id, type, ff-index, external): {raw:?}");
    assert_eq!(
        raw,
        vec![
            (1, "audio".into(), 0, false),
            (1, "sub".into(), 0, true),
            (2, "sub".into(), 0, true),
        ]
    );

    let tracks = read_tracks(&mpv, &plan.tracks, &added);
    let mapped: Vec<_> = tracks
        .iter()
        .map(|track| (track.kind.as_str(), track.player_id, track.jellyfin_index))
        .collect();
    assert_eq!(
        mapped,
        vec![
            ("Audio", 1, Some(2)),
            ("Subtitle", 1, Some(0)),
            ("Subtitle", 2, Some(1)),
        ]
    );

    plan.default_audio_stream_index = Some(2);
    plan.default_subtitle_stream_index = Some(1);
    apply_initial_selection(&mpv, &tracks, &plan);
    assert_eq!(mpv.get_property::<String>("aid").expect("aid"), "1");
    assert_eq!(mpv.get_property::<String>("sid").expect("sid"), "2");
    let mut snapshot = PlaybackSnapshot {
        tracks: read_tracks(&mpv, &plan.tracks, &added),
        ..PlaybackSnapshot::default()
    };
    refresh_selected_streams(&mut snapshot);
    assert_eq!(snapshot.audio_track, Some(2));
    assert_eq!(snapshot.subtitle_track, Some(1));

    plan.default_subtitle_stream_index = Some(-1);
    apply_initial_selection(&mpv, &tracks, &plan);
    assert_eq!(mpv.get_property::<String>("sid").expect("sid"), "no");
}

/// Run against a fixture server with legacy authorization off (Jellyfin
/// 12.x default). `FLUSTER_LAUNCH_REQUEST_FILE` names a private JSON file
/// holding the `LaunchRequest` the frontend would send, built from a real
/// gateway playback plan. Proves the header-authenticated, token-free URLs
/// reach the first frame, load through `sub-add`, map to the Jellyfin
/// stream indices, and select the server's default streams.
#[test]
#[ignore = "needs a live Jellyfin fixture server"]
fn live_fixture_server_playback() {
    let path =
        std::env::var("FLUSTER_LAUNCH_REQUEST_FILE").expect("set FLUSTER_LAUNCH_REQUEST_FILE");
    let json = std::fs::read_to_string(path).expect("read the launch request");
    let request: LaunchRequest = serde_json::from_str(&json).expect("a launch request");
    validate_playback_urls(&request).expect("the plan URLs pass the Rust policy");
    let plan = &request.plan;

    let Some(mut mpv) = headless_player(&request.authorization) else {
        return;
    };
    mpv.command("loadfile", &[&plan.stream_url, "replace"])
        .expect("loadfile");
    assert!(matches!(wait_for_load(&mut mpv), LoadOutcome::Loaded));
    let added = load_external_subtitles(&mpv, &plan.tracks);
    let external_subtitles = plan
        .tracks
        .iter()
        .filter(|track| track.external && track.kind == "Subtitle")
        .count();
    assert_eq!(added.len(), external_subtitles, "sub-add did not load");
    let tracks = read_tracks(&mpv, &plan.tracks, &added);
    apply_initial_selection(&mpv, &tracks, plan);
    assert!(matches!(
        wait_for(&mut mpv, |event| matches!(event, Event::PlaybackRestart)),
        LoadOutcome::Loaded
    ));

    let mut snapshot = PlaybackSnapshot {
        tracks: read_tracks(&mpv, &plan.tracks, &added),
        ..PlaybackSnapshot::default()
    };
    refresh_selected_streams(&mut snapshot);
    let mapped: Vec<_> = snapshot
        .tracks
        .iter()
        .map(|track| {
            (
                track.kind.as_str(),
                track.player_id,
                track.external,
                track.jellyfin_index,
                track.selected,
            )
        })
        .collect();
    let aid: String = mpv.get_property("aid").unwrap_or_default();
    let sid: String = mpv.get_property("sid").unwrap_or_default();
    eprintln!(
        "live tracks (kind, mpv id, external, jellyfin index, selected): {mapped:?}; \
             aid {aid}, sid {sid}; reported AudioStreamIndex {:?}, SubtitleStreamIndex {:?}; \
             defaults audio {:?}, subtitle {:?}",
        snapshot.audio_track,
        snapshot.subtitle_track,
        plan.default_audio_stream_index,
        plan.default_subtitle_stream_index,
    );

    // Every stream mpv shows has a Jellyfin counterpart of the same type.
    for track in &snapshot.tracks {
        let jellyfin = plan
            .tracks
            .iter()
            .find(|candidate| Some(candidate.index) == track.jellyfin_index);
        assert!(
            jellyfin.is_some_and(|candidate| candidate.kind == track.kind),
            "unmapped mpv track {track:?}"
        );
    }
    assert_eq!(snapshot.audio_track, plan.default_audio_stream_index);
    let expected_subtitle = plan
        .default_subtitle_stream_index
        .filter(|index| *index >= 0);
    assert_eq!(snapshot.subtitle_track, expected_subtitle);
    if expected_subtitle.is_none() {
        assert_eq!(sid, "no");
    }
}
