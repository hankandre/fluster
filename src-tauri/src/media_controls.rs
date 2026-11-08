//! System media controls (MPRIS on Linux).
//!
//! The desktop asks the player to play, pause, seek, or stop. Play, pause,
//! and seek go to the same `MpvController` methods the UI's commands use.
//! Stop goes to the frontend as a typed event, so it runs the same teardown
//! as Back and reports the stop to Jellyfin. Nothing here is a generic
//! bridge: the actions are a closed enum.
//!
//! What the desktop sees is the title, the play state, and the position.
//! Never URLs, tokens, item ids, or play-session ids: the track id is a
//! fixed prefix and a per-run session counter.

#[cfg(target_os = "linux")]
mod mpris;

use crate::model::PlaybackSnapshot;
use crate::player::MpvController;
use serde::Serialize;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// The event the frontend hears when the desktop asks to stop.
pub(crate) const MEDIA_CONTROL_EVENT: &str = "fluster://media-control";

/// MPRIS track ids are this prefix and a counter of sessions in this run, so
/// a request for an earlier session is stale. They name no item.
pub(crate) const TRACK_ID_PREFIX: &str = "/app/fluster/Fluster/Track/";

const MICROS_PER_SECOND: f64 = 1_000_000.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub(crate) enum MediaControlEvent {
    Stop,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum PlaybackStatus {
    Playing,
    Paused,
    Stopped,
}

impl PlaybackStatus {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Playing => "Playing",
            Self::Paused => "Paused",
            Self::Stopped => "Stopped",
        }
    }
}

/// What the player tells the media controls.
#[derive(Debug, Clone, PartialEq)]
pub(crate) enum MediaUpdate {
    Session {
        title: String,
        paused: bool,
        position_us: i64,
        length_us: Option<i64>,
        /// The position jumped (a seek finished).
        seeked: bool,
    },
    Stopped,
}

fn to_micros(seconds: f64) -> i64 {
    if !seconds.is_finite() || seconds <= 0.0 {
        return 0;
    }
    (seconds * MICROS_PER_SECOND).min(i64::MAX as f64) as i64
}

impl MediaUpdate {
    pub(crate) fn from_snapshot(title: &str, snapshot: &PlaybackSnapshot, seeked: bool) -> Self {
        Self::Session {
            title: title.to_string(),
            paused: snapshot.paused,
            position_us: to_micros(snapshot.position_seconds),
            length_us: snapshot
                .duration_seconds
                .filter(|seconds| seconds.is_finite() && *seconds > 0.0)
                .map(to_micros),
            seeked,
        }
    }
}

/// The state the desktop can read.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct NowPlaying {
    pub(crate) status: PlaybackStatus,
    pub(crate) title: Option<String>,
    pub(crate) position_us: i64,
    pub(crate) length_us: Option<i64>,
    /// Sessions started in this run; the current one's number while active.
    pub(crate) track: u64,
}

impl Default for NowPlaying {
    fn default() -> Self {
        Self {
            status: PlaybackStatus::Stopped,
            title: None,
            position_us: 0,
            length_us: None,
            track: 0,
        }
    }
}

/// Which readable properties an update changed.
#[derive(Debug, Default, PartialEq, Eq)]
pub(crate) struct Changes {
    pub(crate) status: bool,
    pub(crate) metadata: bool,
    /// The new position, when the player jumped to it.
    pub(crate) seeked_to: Option<i64>,
}

impl NowPlaying {
    pub(crate) fn active(&self) -> bool {
        self.status != PlaybackStatus::Stopped
    }

    pub(crate) fn can_seek(&self) -> bool {
        self.active() && self.length_us.is_some()
    }

    pub(crate) fn apply(&mut self, update: MediaUpdate) -> Changes {
        let (next, seeked) = match update {
            MediaUpdate::Session {
                title,
                paused,
                position_us,
                length_us,
                seeked,
            } => {
                let status = if paused {
                    PlaybackStatus::Paused
                } else {
                    PlaybackStatus::Playing
                };
                // A session update after a stop starts a new track.
                let track = if self.active() {
                    self.track
                } else {
                    self.track.wrapping_add(1)
                };
                let next = NowPlaying {
                    status,
                    title: Some(title),
                    position_us,
                    length_us,
                    track,
                };
                (next, seeked)
            }
            MediaUpdate::Stopped => (
                NowPlaying {
                    track: self.track,
                    ..NowPlaying::default()
                },
                false,
            ),
        };
        let changes = Changes {
            status: next.status != self.status,
            metadata: next.title != self.title
                || next.length_us != self.length_us
                || next.track != self.track,
            seeked_to: seeked.then_some(next.position_us),
        };
        *self = next;
        changes
    }

    /// The current session's track id, while one is active.
    pub(crate) fn track_id(&self) -> Option<String> {
        self.active()
            .then(|| format!("{TRACK_ID_PREFIX}{}", self.track))
    }

    /// True when `track_id` names the current session.
    pub(crate) fn is_current_track(&self, track_id: &str) -> bool {
        self.track_id().as_deref() == Some(track_id)
    }

    /// The MPRIS metadata: the session's track id, the title, and the length.
    pub(crate) fn metadata(&self) -> Vec<(&'static str, MetadataValue)> {
        let Some(track_id) = self.track_id() else {
            return Vec::new();
        };
        let mut entries = vec![("mpris:trackid", MetadataValue::ObjectPath(track_id))];
        if let Some(title) = &self.title {
            entries.push(("xesam:title", MetadataValue::Text(title.clone())));
        }
        if let Some(length) = self.length_us {
            entries.push(("mpris:length", MetadataValue::Micros(length)));
        }
        entries
    }
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) enum MetadataValue {
    ObjectPath(String),
    Text(String),
    Micros(i64),
}

/// A request from the desktop.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum MediaAction {
    Play,
    Pause,
    PlayPause,
    Stop,
    /// Relative, in microseconds.
    SeekBy(i64),
    /// Absolute, in microseconds, for the track id the caller named.
    SetPosition {
        current_track: bool,
        position_us: i64,
    },
}

/// What a request does to the player.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) enum Route {
    SetPaused(bool),
    SeekTo(f64),
    Stop,
    Ignore,
}

/// Maps a request onto the player, following the MPRIS rules: nothing
/// happens without a session, a seek past the end is ignored (there is no
/// next track), and a stale or out-of-range `SetPosition` is ignored.
pub(crate) fn route(action: MediaAction, now: &NowPlaying) -> Route {
    if !now.active() {
        return Route::Ignore;
    }
    match action {
        MediaAction::Play => Route::SetPaused(false),
        MediaAction::Pause => Route::SetPaused(true),
        MediaAction::PlayPause => Route::SetPaused(now.status == PlaybackStatus::Playing),
        MediaAction::Stop => Route::Stop,
        MediaAction::SeekBy(offset_us) => {
            let Some(length) = now.length_us else {
                return Route::Ignore;
            };
            let target = now.position_us.saturating_add(offset_us).max(0);
            if target > length {
                return Route::Ignore;
            }
            Route::SeekTo(target as f64 / MICROS_PER_SECOND)
        }
        MediaAction::SetPosition {
            current_track,
            position_us,
        } => match now.length_us {
            Some(length) if current_track && (0..=length).contains(&position_us) => {
                Route::SeekTo(position_us as f64 / MICROS_PER_SECOND)
            }
            _ => Route::Ignore,
        },
    }
}

/// Where routed requests go. The real target is the player and the app.
pub(crate) trait MediaTarget: Send + 'static {
    fn set_paused(&self, paused: bool);
    fn seek(&self, position_seconds: f64);
    fn request_stop(&self);
}

pub(crate) fn dispatch(route: Route, target: &dyn MediaTarget) {
    match route {
        Route::SetPaused(paused) => target.set_paused(paused),
        Route::SeekTo(seconds) => target.seek(seconds),
        Route::Stop => target.request_stop(),
        Route::Ignore => {}
    }
}

struct PlayerTarget {
    controller: MpvController,
    app: AppHandle,
}

impl MediaTarget for PlayerTarget {
    // A request that races the end of the session finds no player; there is
    // nothing to tell the desktop, so the error is dropped.
    fn set_paused(&self, paused: bool) {
        if self.controller.set_paused(paused).is_err() {
            media_trace("media control pause was not applied");
        }
    }

    fn seek(&self, position_seconds: f64) {
        if self.controller.seek(position_seconds).is_err() {
            media_trace("media control seek was not applied");
        }
    }

    fn request_stop(&self) {
        if self
            .app
            .emit(MEDIA_CONTROL_EVENT, MediaControlEvent::Stop)
            .is_err()
        {
            media_trace("media control stop could not reach the frontend");
        }
    }
}

/// The player's handle on the media controls. Cloning shares it. Without a
/// platform service (other platforms, no session bus, tests) it does nothing.
#[derive(Clone, Default)]
pub(crate) struct MediaControls {
    updates: Arc<Mutex<Option<Sender<MediaUpdate>>>>,
}

impl MediaControls {
    pub(crate) fn publish(&self, update: MediaUpdate) {
        let mut updates = self.updates.lock().expect("media controls mutex poisoned");
        if let Some(sender) = updates.as_ref() {
            if sender.send(update).is_err() {
                // The service thread is gone; stop sending.
                updates.take();
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn with_sender(sender: Sender<MediaUpdate>) -> Self {
        Self {
            updates: Arc::new(Mutex::new(Some(sender))),
        }
    }
}

/// Starts the platform media controls, routing requests to `controller`.
pub(crate) fn start(app: &AppHandle, controller: MpvController) -> MediaControls {
    #[cfg(target_os = "linux")]
    {
        let target = PlayerTarget {
            controller,
            app: app.clone(),
        };
        // Returns at once; connecting happens on the service thread.
        let sender = mpris::spawn(mpris::BUS_NAME, Box::new(target));
        MediaControls {
            updates: Arc::new(Mutex::new(Some(sender))),
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (app, controller);
        MediaControls::default()
    }
}

// Constant messages only: the argument type keeps ids and URLs out.
#[cfg(debug_assertions)]
fn media_trace(message: &'static str) {
    eprintln!("[fluster media] {message}");
}

#[cfg(not(debug_assertions))]
fn media_trace(_message: &'static str) {}

#[cfg(test)]
mod tests;
