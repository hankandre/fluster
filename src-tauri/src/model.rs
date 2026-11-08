use crate::auth_header::MediaBrowserAuthorization;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaTrack {
    pub index: i64,
    #[serde(rename = "type")]
    pub kind: String,
    pub display_title: String,
    /// ffprobe codec name, used only to verify a track mapping.
    #[serde(default)]
    pub codec: Option<String>,
    pub language: Option<String>,
    pub external: bool,
    pub delivery_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackPlan {
    pub item_id: String,
    pub title: String,
    pub stream_url: String,
    pub media_source_id: String,
    pub play_session_id: String,
    pub start_position_ticks: u64,
    #[serde(default)]
    pub tracks: Vec<MediaTrack>,
    /// Jellyfin stream indices, not mpv track ids. Rust maps them to mpv
    /// tracks after the file and its external subtitles load.
    #[serde(default)]
    pub default_audio_stream_index: Option<i64>,
    /// Absent or -1 turns subtitles off.
    #[serde(default)]
    pub default_subtitle_stream_index: Option<i64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub plan: PlaybackPlan,
    /// Authenticates the stream and external-subtitle requests. libmpv gets
    /// it as a fixed `Authorization` header; it never goes into a URL.
    pub authorization: MediaBrowserAuthorization,
    #[serde(default)]
    pub test_force_software: bool,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSurfaceFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub scale_factor: f64,
    pub visible: bool,
}

impl PlayerSurfaceFrame {
    pub fn validate(self) -> Result<Self, &'static str> {
        let values = [self.x, self.y, self.width, self.height, self.scale_factor];
        if values.iter().any(|value| !value.is_finite()) {
            return Err("The video surface frame must contain finite numbers.");
        }
        if self.x < 0.0 || self.y < 0.0 || self.width < 1.0 || self.height < 1.0 {
            return Err("The video surface must have a positive size and position.");
        }
        if self.scale_factor <= 0.0 {
            return Err("The video surface scale factor must be positive.");
        }
        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerCapabilities {
    pub mode: &'static str,
    pub embedded: bool,
    pub renderer: String,
    pub native_renderer: String,
    pub libmpv_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlayerTrack {
    pub player_id: i64,
    pub jellyfin_index: Option<i64>,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub language: Option<String>,
    pub external: bool,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackDiagnostics {
    pub decode_mode: DecodeMode,
    pub decode_label: String,
    pub hwdec_current: Option<String>,
    pub hwdec_interop: Option<String>,
    pub hw_pixel_format: Option<String>,
    pub video_output: Option<String>,
    pub gpu_context: Option<String>,
    pub video_codec: Option<String>,
    pub bit_depth: Option<u64>,
    pub width: Option<u64>,
    pub height: Option<u64>,
    pub dropped_frames: u64,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum DecodeMode {
    Unknown,
    Hardware,
    Software,
}

impl Default for PlaybackDiagnostics {
    fn default() -> Self {
        Self {
            decode_mode: DecodeMode::Unknown,
            decode_label: "Detecting decoder".into(),
            hwdec_current: None,
            hwdec_interop: None,
            hw_pixel_format: None,
            video_output: Some("libmpv".into()),
            gpu_context: Some("OpenGL".into()),
            video_codec: None,
            bit_depth: None,
            width: None,
            height: None,
            dropped_frames: 0,
            warning: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub paused: bool,
    pub buffering: bool,
    pub volume: f64,
    pub muted: bool,
    pub audio_track: Option<i64>,
    pub subtitle_track: Option<i64>,
    pub tracks: Vec<PlayerTrack>,
    pub diagnostics: PlaybackDiagnostics,
}

impl Default for PlaybackSnapshot {
    fn default() -> Self {
        Self {
            position_seconds: 0.0,
            duration_seconds: None,
            paused: false,
            buffering: false,
            volume: 100.0,
            muted: false,
            audio_track: None,
            subtitle_track: None,
            tracks: Vec::new(),
            diagnostics: PlaybackDiagnostics::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PlayerEvent {
    Loaded {
        snapshot: PlaybackSnapshot,
    },
    FirstFrame,
    State {
        snapshot: PlaybackSnapshot,
        cause: Option<&'static str>,
    },
    TracksChanged {
        snapshot: PlaybackSnapshot,
    },
    Ended {
        snapshot: PlaybackSnapshot,
        reason: String,
    },
    Error {
        message: String,
    },
}

/// The only server-socket events the frontend sees. Everything else the
/// server sends is dropped in Rust.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ServerEvent {
    #[serde(rename_all = "camelCase")]
    UserDataChanged {
        item_ids: Vec<String>,
    },
    Connection {
        state: ConnectionState,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionState {
    Connected,
    Disconnected,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_frames_reject_invalid_geometry() {
        let valid = PlayerSurfaceFrame {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 450.0,
            scale_factor: 1.0,
            visible: true,
        };
        assert_eq!(valid.validate(), Ok(valid));
        assert!(PlayerSurfaceFrame {
            width: 0.0,
            ..valid
        }
        .validate()
        .is_err());
        assert!(PlayerSurfaceFrame {
            x: f64::NAN,
            ..valid
        }
        .validate()
        .is_err());
    }
}
