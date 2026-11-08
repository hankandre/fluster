//! Thin Tauri command handlers. Each one maps errors to user-facing text;
//! the behavior lives on `MpvController`, `RealtimeManager`, and `discovery`.

use crate::discovery;
use crate::model::{DiscoveredServer, LaunchRequest, PlayerCapabilities, PlayerSurfaceFrame};
use crate::player::MpvController;
use crate::realtime::{self, RealtimeManager};
use tauri::{Emitter, State};

#[tauri::command]
pub(crate) fn initialize_player(
    controller: State<'_, MpvController>,
) -> Result<PlayerCapabilities, String> {
    controller.capabilities().map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn launch_playback(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    request: LaunchRequest,
) -> Result<(), String> {
    controller
        .launch(app, request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_player_surface(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    frame: PlayerSurfaceFrame,
) -> Result<(), String> {
    controller
        .set_surface(&app, frame)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_paused(controller: State<'_, MpvController>, paused: bool) -> Result<(), String> {
    controller
        .set_paused(paused)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn seek_absolute(
    controller: State<'_, MpvController>,
    position_seconds: f64,
) -> Result<(), String> {
    controller
        .seek(position_seconds)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_volume(controller: State<'_, MpvController>, volume: f64) -> Result<(), String> {
    controller
        .set_volume(volume)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_muted(controller: State<'_, MpvController>, muted: bool) -> Result<(), String> {
    controller
        .set_muted(muted)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn select_track(
    controller: State<'_, MpvController>,
    track_type: String,
    id: Option<i64>,
) -> Result<(), String> {
    controller
        .select_track(&track_type, id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn set_fullscreen(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    fullscreen: bool,
) -> Result<(), String> {
    controller
        .set_fullscreen(&app, fullscreen)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn stop_playback(controller: State<'_, MpvController>) -> Result<(), String> {
    let controller = controller.inner().clone();
    tauri::async_runtime::spawn_blocking(move || controller.stop())
        .await
        .map_err(|_| "The player stop task did not finish.".to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn realtime_connect(
    app: tauri::AppHandle,
    realtime: State<'_, RealtimeManager>,
    server_url: String,
    authorization: String,
) -> Result<(), String> {
    let target =
        realtime::socket_target(&server_url, &authorization).map_err(|error| error.to_string())?;
    realtime.connect(target, move |event| {
        let _ = app.emit(realtime::SERVER_EVENT, event);
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn realtime_disconnect(realtime: State<'_, RealtimeManager>) {
    realtime.disconnect();
}

/// Read-only LAN discovery (P3-03, approved by the user on 2026-11-07). Takes
/// no arguments; returns only servers whose address passes the URL policy.
#[tauri::command]
pub(crate) async fn discover_servers() -> Result<Vec<DiscoveredServer>, String> {
    tauri::async_runtime::spawn_blocking(discovery::discover_on_lan)
        .await
        .map_err(|_| "The server search did not finish.".to_string())?
        .map_err(|error| error.to_string())
}
