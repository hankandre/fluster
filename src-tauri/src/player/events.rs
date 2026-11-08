//! The libmpv event loop and the player events it emits to the frontend.

use super::media::LaunchMedia;
use super::native_trace;
use super::properties::{apply_property, PropertyUpdate, RuntimeState};
use super::track_list::{apply_initial_selection, refresh_selected_streams};
use crate::media_controls::{MediaControls, MediaUpdate};
use crate::model::{PlaybackPlan, PlaybackSnapshot, PlayerEvent};
use crate::redaction::safe_error;
use libmpv2::events::Event;
use libmpv2::{mpv_end_file_reason, Mpv};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const STATE_EVENT_INTERVAL: Duration = Duration::from_millis(200);

pub(super) fn run_event_loop(
    app: &AppHandle,
    mpv: &mut Mpv,
    plan: &PlaybackPlan,
    content: &LaunchMedia,
    media: &MediaControls,
    video_loaded: Arc<AtomicBool>,
    finished: Arc<AtomicBool>,
) {
    let start_position_ticks = plan.start_position_ticks;
    // Jellyfin indices of the external subtitles `sub-add` loaded, in order.
    let mut added_externals: Vec<i64> = Vec::new();
    let mut state = RuntimeState::new();
    let mut sent_end = false;
    let mut pending_state = false;
    let mut last_state_event = Instant::now();
    while !finished.load(Ordering::Acquire) {
        match mpv.wait_event(0.2) {
            Some(Ok(Event::FileLoaded)) => {
                if start_position_ticks > 0 {
                    let seconds = (start_position_ticks as f64 / 10_000_000.0).to_string();
                    let _ = mpv.command("seek", &[&seconds, "absolute+exact"]);
                    state.snapshot.position_seconds = start_position_ticks as f64 / 10_000_000.0;
                }
                added_externals = content.load_subtitles(mpv);
                let tracks = content.read_tracks(mpv, &added_externals);
                apply_initial_selection(mpv, &tracks, plan);
                state.snapshot.tracks = content.read_tracks(mpv, &added_externals);
                refresh_selected_streams(&mut state.snapshot);
                video_loaded.store(true, Ordering::Release);
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Loaded {
                        snapshot: state.snapshot.clone(),
                    },
                );
                media.publish(MediaUpdate::from_snapshot(
                    &plan.title,
                    &state.snapshot,
                    false,
                ));
                pending_state = false;
                last_state_event = Instant::now();
            }
            Some(Ok(Event::PropertyChange { name, change, .. })) => {
                match apply_property(&mut state, name, change) {
                    Some(PropertyUpdate::Ordinary) => pending_state = true,
                    Some(PropertyUpdate::Immediate(cause)) => {
                        emit_state(app, &state.snapshot, Some(cause));
                        publish_state(media, &plan.title, &state.snapshot, Some(cause));
                        pending_state = false;
                        last_state_event = Instant::now();
                    }
                    Some(PropertyUpdate::TracksChanged) => {
                        let _ = app.emit(
                            "fluster://player-event",
                            PlayerEvent::TracksChanged {
                                snapshot: state.snapshot.clone(),
                            },
                        );
                        pending_state = false;
                    }
                    None => {}
                }
            }
            Some(Ok(Event::AudioReconfig | Event::VideoReconfig)) => {
                let tracks = content.read_tracks(mpv, &added_externals);
                if !tracks.is_empty() && tracks != state.snapshot.tracks {
                    state.snapshot.tracks = tracks;
                    refresh_selected_streams(&mut state.snapshot);
                    let _ = app.emit(
                        "fluster://player-event",
                        PlayerEvent::TracksChanged {
                            snapshot: state.snapshot.clone(),
                        },
                    );
                    pending_state = false;
                }
            }
            Some(Ok(Event::EndFile(reason))) => {
                native_trace("libmpv emitted EndFile");
                let failed =
                    reason == mpv_end_file_reason::Error || reason == mpv_end_file_reason::Redirect;
                let reason = if reason == mpv_end_file_reason::Eof {
                    "eof"
                } else if reason == mpv_end_file_reason::Stop {
                    "stopped"
                } else if reason == mpv_end_file_reason::Quit {
                    "quit"
                } else {
                    "error"
                };
                if failed {
                    let _ = app.emit(
                        "fluster://player-event",
                        PlayerEvent::Error {
                            message: content.playback_failure().into(),
                        },
                    );
                }
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Ended {
                        snapshot: state.snapshot.clone(),
                        reason: reason.into(),
                    },
                );
                sent_end = true;
                break;
            }
            Some(Ok(Event::Shutdown)) => break,
            Some(Err(error)) => {
                let _ = app.emit(
                    "fluster://player-event",
                    PlayerEvent::Error {
                        message: format!("libmpv reported a playback error: {}", safe_error(error)),
                    },
                );
                break;
            }
            _ => {}
        }
        if pending_state && last_state_event.elapsed() >= STATE_EVENT_INTERVAL {
            emit_state(app, &state.snapshot, None);
            publish_state(media, &plan.title, &state.snapshot, None);
            pending_state = false;
            last_state_event = Instant::now();
        }
    }
    if !sent_end && !finished.load(Ordering::Acquire) {
        let _ = app.emit(
            "fluster://player-event",
            PlayerEvent::Ended {
                snapshot: state.snapshot,
                reason: "error".into(),
            },
        );
    }
}

fn emit_state(app: &AppHandle, snapshot: &PlaybackSnapshot, cause: Option<&'static str>) {
    let _ = app.emit(
        "fluster://player-event",
        PlayerEvent::State {
            snapshot: snapshot.clone(),
            cause,
        },
    );
}

fn publish_state(
    media: &MediaControls,
    title: &str,
    snapshot: &PlaybackSnapshot,
    cause: Option<&'static str>,
) {
    let seeked = cause == Some("seek");
    media.publish(MediaUpdate::from_snapshot(title, snapshot, seeked));
}
