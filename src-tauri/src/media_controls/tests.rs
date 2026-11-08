use super::*;
use crate::model::{MediaTrack, PlaybackPlan};
use pretty_assertions::assert_eq;
use std::sync::mpsc;

/// Records what the routed requests asked the player to do.
#[derive(Clone, Default)]
pub(in crate::media_controls) struct Recorder(Arc<Mutex<Vec<Route>>>);

impl Recorder {
    pub(in crate::media_controls) fn routes(&self) -> Vec<Route> {
        self.0.lock().expect("recorder mutex").clone()
    }

    fn push(&self, route: Route) {
        self.0.lock().expect("recorder mutex").push(route);
    }
}

impl MediaTarget for Recorder {
    fn set_paused(&self, paused: bool) {
        self.push(Route::SetPaused(paused));
    }

    fn seek(&self, position_seconds: f64) {
        self.push(Route::SeekTo(position_seconds));
    }

    fn request_stop(&self) {
        self.push(Route::Stop);
    }
}

pub(in crate::media_controls) fn snapshot(
    position_seconds: f64,
    duration_seconds: Option<f64>,
    paused: bool,
) -> PlaybackSnapshot {
    PlaybackSnapshot {
        position_seconds,
        duration_seconds,
        paused,
        ..PlaybackSnapshot::default()
    }
}

fn playing(position_seconds: f64, paused: bool) -> NowPlaying {
    let mut now = NowPlaying::default();
    now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(position_seconds, Some(100.0), paused),
        false,
    ));
    now
}

#[test]
fn snapshots_become_microsecond_updates() {
    assert_eq!(
        MediaUpdate::from_snapshot("Arrival", &snapshot(1.5, Some(100.0), true), true),
        MediaUpdate::Session {
            title: "Arrival".into(),
            paused: true,
            position_us: 1_500_000,
            length_us: Some(100_000_000),
            seeked: true,
        }
    );
    // An unknown, zero, or non-finite duration is no length; a bad position is 0.
    for duration in [None, Some(0.0), Some(f64::NAN), Some(f64::INFINITY)] {
        let update = MediaUpdate::from_snapshot("x", &snapshot(f64::NAN, duration, false), false);
        let MediaUpdate::Session {
            position_us,
            length_us,
            ..
        } = update
        else {
            panic!("expected a session update");
        };
        assert_eq!((position_us, length_us), (0, None));
    }
    let update = MediaUpdate::from_snapshot("x", &snapshot(-3.0, None, false), false);
    let MediaUpdate::Session { position_us, .. } = update else {
        panic!("expected a session update");
    };
    assert_eq!(position_us, 0);
}

#[test]
fn play_state_follows_the_session() {
    let mut now = NowPlaying::default();
    assert_eq!(now.status, PlaybackStatus::Stopped);
    assert!(!now.active() && !now.can_seek());

    let changes = now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(0.0, None, false),
        false,
    ));
    assert_eq!(
        changes,
        Changes {
            status: true,
            metadata: true,
            seeked_to: None
        }
    );
    assert_eq!(now.status, PlaybackStatus::Playing);
    // No length yet, so no seeking.
    assert!(now.active() && !now.can_seek());

    let changes = now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(1.0, Some(100.0), false),
        false,
    ));
    assert_eq!(
        changes,
        Changes {
            status: false,
            metadata: true,
            seeked_to: None
        }
    );
    assert!(now.can_seek());

    // Position alone is not a change clients are told about.
    let changes = now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(2.0, Some(100.0), false),
        false,
    ));
    assert_eq!(changes, Changes::default());
    assert_eq!(now.position_us, 2_000_000);

    let changes = now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(2.0, Some(100.0), true),
        false,
    ));
    assert_eq!((changes.status, now.status), (true, PlaybackStatus::Paused));

    let changes = now.apply(MediaUpdate::from_snapshot(
        "Arrival",
        &snapshot(50.0, Some(100.0), true),
        true,
    ));
    assert_eq!(changes.seeked_to, Some(50_000_000));

    let changes = now.apply(MediaUpdate::Stopped);
    assert_eq!(
        changes,
        Changes {
            status: true,
            metadata: true,
            seeked_to: None
        }
    );
    // Stopped keeps only the session count.
    assert_eq!(
        now,
        NowPlaying {
            track: 1,
            ..NowPlaying::default()
        }
    );
}

#[test]
fn each_session_gets_a_new_track_id_and_old_ones_go_stale() {
    let mut now = NowPlaying::default();
    assert_eq!(now.track_id(), None);
    now.apply(MediaUpdate::from_snapshot(
        "Pilot",
        &snapshot(0.0, Some(100.0), false),
        false,
    ));
    let first = now.track_id().expect("a track id");
    assert_eq!(first, format!("{TRACK_ID_PREFIX}1"));
    // Updates within a session keep it.
    now.apply(MediaUpdate::from_snapshot(
        "Pilot",
        &snapshot(5.0, Some(100.0), true),
        false,
    ));
    assert_eq!(now.track_id().as_deref(), Some(first.as_str()));

    now.apply(MediaUpdate::Stopped);
    assert_eq!(now.track_id(), None);
    assert!(!now.is_current_track(&first));
    // The next episode, even with the same title and length, is a new track.
    let changes = now.apply(MediaUpdate::from_snapshot(
        "Pilot",
        &snapshot(0.0, Some(100.0), false),
        false,
    ));
    assert!(changes.metadata);
    let second = now.track_id().expect("a track id");
    assert_eq!(second, format!("{TRACK_ID_PREFIX}2"));
    assert!(now.is_current_track(&second) && !now.is_current_track(&first));
}

#[test]
fn status_names_match_mpris() {
    assert_eq!(PlaybackStatus::Playing.as_str(), "Playing");
    assert_eq!(PlaybackStatus::Paused.as_str(), "Paused");
    assert_eq!(PlaybackStatus::Stopped.as_str(), "Stopped");
}

#[test]
fn metadata_is_a_constant_track_id_the_title_and_the_length() {
    assert!(NowPlaying::default().metadata().is_empty());
    let track_id = format!("{TRACK_ID_PREFIX}1");
    assert_eq!(
        playing(0.0, false).metadata(),
        vec![
            ("mpris:trackid", MetadataValue::ObjectPath(track_id.clone())),
            ("xesam:title", MetadataValue::Text("Arrival".into())),
            ("mpris:length", MetadataValue::Micros(100_000_000)),
        ]
    );
    assert!(dbus_object_path(&track_id));
    assert!(dbus_object_path(&format!("{TRACK_ID_PREFIX}{}", u64::MAX)));
    // MPRIS reserves /org/mpris for its own paths.
    assert!(!TRACK_ID_PREFIX.starts_with("/org/mpris"));
}

/// The D-Bus object path grammar: `/`, or `/`-separated non-empty
/// `[A-Za-z0-9_]` elements.
fn dbus_object_path(path: &str) -> bool {
    path == "/"
        || (path.starts_with('/')
            && path[1..].split('/').all(|element| {
                !element.is_empty()
                    && element
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '_')
            }))
}

pub(in crate::media_controls) const CANARY_TOKEN: &str = "FLUSTER_REDACTION_CANARY_media_controls";

pub(in crate::media_controls) fn plan_with_secrets() -> PlaybackPlan {
    PlaybackPlan {
        item_id: "item-6f1c2a".into(),
        title: "Arrival".into(),
        stream_url: format!(
            "https://jellyfin.test/Videos/item-6f1c2a/stream?Static=true&api_key={CANARY_TOKEN}"
        ),
        media_source_id: "source-9e4d7b".into(),
        play_session_id: "play-session-3b8f5c".into(),
        start_position_ticks: 0,
        tracks: vec![MediaTrack {
            index: 3,
            kind: "Subtitle".into(),
            display_title: "English".into(),
            codec: Some("subrip".into()),
            language: Some("eng".into()),
            external: true,
            delivery_url: Some("https://jellyfin.test/Videos/item-6f1c2a/subtitles.srt".into()),
        }],
        default_audio_stream_index: None,
        default_subtitle_stream_index: None,
    }
}

/// Every value in a plan that must never reach the desktop.
pub(in crate::media_controls) fn plan_secrets(plan: &PlaybackPlan) -> Vec<String> {
    vec![
        CANARY_TOKEN.to_string(),
        "http".to_string(),
        "jellyfin.test".to_string(),
        plan.item_id.clone(),
        plan.media_source_id.clone(),
        plan.play_session_id.clone(),
    ]
}

#[test]
fn redaction_canary_metadata_never_carries_urls_tokens_or_ids() {
    let plan = plan_with_secrets();
    let mut now = NowPlaying::default();
    // The event loop builds updates exactly like this.
    let update = MediaUpdate::from_snapshot(&plan.title, &snapshot(5.0, Some(60.0), false), false);
    now.apply(update.clone());

    let exposed = format!("{update:?} {now:?} {:?}", now.metadata());
    for secret in plan_secrets(&plan) {
        assert!(!exposed.contains(&secret), "media controls expose {secret}");
    }
    let keys: Vec<&str> = now.metadata().iter().map(|(key, _)| *key).collect();
    assert_eq!(keys, ["mpris:trackid", "xesam:title", "mpris:length"]);
}

#[test]
fn requests_route_to_the_typed_player_paths() {
    let now = playing(40.0, false);
    assert_eq!(route(MediaAction::Play, &now), Route::SetPaused(false));
    assert_eq!(route(MediaAction::Pause, &now), Route::SetPaused(true));
    assert_eq!(route(MediaAction::PlayPause, &now), Route::SetPaused(true));
    assert_eq!(
        route(MediaAction::PlayPause, &playing(40.0, true)),
        Route::SetPaused(false)
    );
    assert_eq!(route(MediaAction::Stop, &now), Route::Stop);
    assert_eq!(
        route(MediaAction::SeekBy(10_000_000), &now),
        Route::SeekTo(50.0)
    );
    assert_eq!(
        route(MediaAction::SeekBy(-10_000_000), &now),
        Route::SeekTo(30.0)
    );
    let set_position = MediaAction::SetPosition {
        current_track: true,
        position_us: 75_500_000,
    };
    assert_eq!(route(set_position, &now), Route::SeekTo(75.5));
}

#[test]
fn requests_follow_the_mpris_edge_rules() {
    let now = playing(40.0, false);
    // Seeking before the start goes to the start.
    assert_eq!(
        route(MediaAction::SeekBy(-60_000_000), &now),
        Route::SeekTo(0.0)
    );
    assert_eq!(
        route(MediaAction::SeekBy(i64::MIN), &now),
        Route::SeekTo(0.0)
    );
    // Past the end would be Next, and there is no next track.
    assert_eq!(route(MediaAction::SeekBy(61_000_000), &now), Route::Ignore);
    assert_eq!(route(MediaAction::SeekBy(i64::MAX), &now), Route::Ignore);
    // SetPosition ignores another track, a negative position, and one past the end.
    for (current_track, position_us) in [(false, 1_000_000), (true, -1), (true, 100_000_001)] {
        let action = MediaAction::SetPosition {
            current_track,
            position_us,
        };
        assert_eq!(route(action, &now), Route::Ignore);
    }
    // Without a known length nothing seeks.
    let mut unknown = NowPlaying::default();
    unknown.apply(MediaUpdate::from_snapshot(
        "x",
        &snapshot(1.0, None, false),
        false,
    ));
    assert_eq!(route(MediaAction::SeekBy(1), &unknown), Route::Ignore);
}

#[test]
fn nothing_routes_without_a_session() {
    let stopped = NowPlaying::default();
    for action in [
        MediaAction::Play,
        MediaAction::Pause,
        MediaAction::PlayPause,
        MediaAction::Stop,
        MediaAction::SeekBy(1),
        MediaAction::SetPosition {
            current_track: true,
            position_us: 0,
        },
    ] {
        assert_eq!(route(action, &stopped), Route::Ignore);
    }
}

#[test]
fn dispatch_calls_one_target_method_per_route() {
    let recorder = Recorder::default();
    for route in [
        Route::SetPaused(true),
        Route::SeekTo(12.5),
        Route::Stop,
        Route::Ignore,
    ] {
        dispatch(route, &recorder);
    }
    assert_eq!(
        recorder.routes(),
        vec![Route::SetPaused(true), Route::SeekTo(12.5), Route::Stop]
    );
}

#[test]
fn the_stop_event_is_a_closed_typed_payload() {
    assert_eq!(
        serde_json::to_value(MediaControlEvent::Stop).expect("serializes"),
        serde_json::json!({ "action": "stop" })
    );
    assert_eq!(MEDIA_CONTROL_EVENT, "fluster://media-control");
}

#[test]
fn publishing_without_a_service_does_nothing_and_a_gone_service_is_dropped() {
    MediaControls::default().publish(MediaUpdate::Stopped);

    let (sender, receiver) = mpsc::channel();
    let media = MediaControls::with_sender(sender);
    media.clone().publish(MediaUpdate::Stopped);
    assert_eq!(receiver.try_recv(), Ok(MediaUpdate::Stopped));

    drop(receiver);
    media.publish(MediaUpdate::Stopped);
    assert!(media.updates.lock().expect("media mutex").is_none());
}
