mod auth_header;
#[cfg(test)]
mod command_allowlist;
mod commands;
#[cfg(test)]
mod logger_guard;
mod model;
mod player;
mod realtime;
mod redaction;
mod surface;
#[cfg(test)]
mod trace_canary;
mod url_policy;

use commands::{
    initialize_player, launch_playback, realtime_connect, realtime_disconnect, seek_absolute,
    select_track, set_fullscreen, set_muted, set_paused, set_player_surface, set_volume,
    stop_playback,
};
use player::MpvController;
use realtime::RealtimeManager;

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
