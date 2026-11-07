#[cfg(test)]
mod command_allowlist;
mod model;
mod mpv;
mod realtime;
mod redaction;
mod surface;
mod url_policy;

use model::{LaunchRequest, PlayerCapabilities, PlayerSurfaceFrame};
use mpv::MpvController;
use realtime::RealtimeManager;
use tauri::{Emitter, State};

#[tauri::command]
fn initialize_player(controller: State<'_, MpvController>) -> Result<PlayerCapabilities, String> {
    controller.capabilities().map_err(|error| error.to_string())
}

#[tauri::command]
fn launch_playback(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    request: LaunchRequest,
) -> Result<(), String> {
    controller
        .launch(app, request)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_player_surface(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    frame: PlayerSurfaceFrame,
) -> Result<(), String> {
    controller
        .set_surface(&app, frame)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_paused(controller: State<'_, MpvController>, paused: bool) -> Result<(), String> {
    controller
        .set_paused(paused)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn seek_absolute(
    controller: State<'_, MpvController>,
    position_seconds: f64,
) -> Result<(), String> {
    controller
        .seek(position_seconds)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_volume(controller: State<'_, MpvController>, volume: f64) -> Result<(), String> {
    controller
        .set_volume(volume)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_muted(controller: State<'_, MpvController>, muted: bool) -> Result<(), String> {
    controller
        .set_muted(muted)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn select_track(
    controller: State<'_, MpvController>,
    track_type: String,
    id: Option<i64>,
) -> Result<(), String> {
    controller
        .select_track(&track_type, id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn set_fullscreen(
    app: tauri::AppHandle,
    controller: State<'_, MpvController>,
    fullscreen: bool,
) -> Result<(), String> {
    controller
        .set_fullscreen(&app, fullscreen)
        .map_err(|error| error.to_string())
}

#[tauri::command]
async fn stop_playback(controller: State<'_, MpvController>) -> Result<(), String> {
    let controller = controller.inner().clone();
    tauri::async_runtime::spawn_blocking(move || controller.stop())
        .await
        .map_err(|_| "The player stop task did not finish.".to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn realtime_connect(
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
fn realtime_disconnect(realtime: State<'_, RealtimeManager>) {
    realtime.disconnect();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // libmpv parses all numeric options with the C decimal separator and
    // requires embedders to establish this before creating an mpv handle.
    // SAFETY: `c"C"` is a valid NUL-terminated string that outlives the call, and
    // this runs at startup before any other thread reads or changes the locale.
    unsafe {
        libc::setlocale(libc::LC_NUMERIC, c"C".as_ptr());
    }
    let controller = MpvController::default();
    let renderer_controller = controller.clone();
    tauri::Builder::default()
        .manage(controller)
        .manage(RealtimeManager::default())
        .setup(move |app| {
            renderer_controller.set_renderer_result(surface::initialize(app.handle()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize_player,
            launch_playback,
            set_player_surface,
            set_paused,
            seek_absolute,
            set_volume,
            set_muted,
            select_track,
            set_fullscreen,
            stop_playback,
            realtime_connect,
            realtime_disconnect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Fluster");
}
