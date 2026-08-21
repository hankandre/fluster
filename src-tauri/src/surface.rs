use crate::model::PlayerSurfaceFrame;
use libmpv2::Mpv;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "linux")]
use linux as platform;
#[cfg(target_os = "macos")]
use macos as platform;

pub fn initialize(app: &AppHandle) -> Result<String, String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        platform::initialize(app)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = app;
        Err("Embedded playback is not available on this platform.".into())
    }
}

pub fn attach(
    app: &AppHandle,
    mpv: Arc<Mutex<Mpv>>,
    session_id: String,
    video_loaded: Arc<AtomicBool>,
) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        platform::attach(app, mpv, session_id, video_loaded)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (app, mpv, session_id, video_loaded);
        Err("Embedded playback is not available on this platform.".into())
    }
}

pub fn set_frame(app: &AppHandle, frame: PlayerSurfaceFrame) -> Result<(), String> {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        platform::set_frame(app, frame)
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (app, frame);
        Err("Embedded playback is not available on this platform.".into())
    }
}

pub fn detach(app: &AppHandle, session_id: &str) {
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    platform::detach(app, session_id);
    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    let _ = (app, session_id);
}
