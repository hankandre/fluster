mod detach;
mod egl;

use crate::model::{PlayerEvent, PlayerSurfaceFrame};
use detach::{clear_surface, collapse_surface};
use egl::{gl_proc_address, gl_proc_address_with_context};
use gtk::glib;
use gtk::prelude::*;
use libmpv2::{
    render::{OpenGLInitParams, RenderContext, RenderParam, RenderParamApiType},
    Mpv,
};
use raw_window_handle::{HasDisplayHandle, RawDisplayHandle};
use std::cell::{Cell, RefCell};
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{window::Color, AppHandle, Emitter, Manager};

pub use detach::detach;

const LIBRARY_BACKGROUND: Color = Color(8, 10, 15, 255);
const PLAYBACK_BACKGROUND: Color = Color(0, 0, 0, 0);

struct LinuxUi {
    fixed: gtk::Fixed,
    gl_area: gtk::GLArea,
    webview: gtk::Widget,
    wayland_display: usize,
}

struct RenderState {
    session_id: String,
    context: RenderContext,
    app: AppHandle,
    first_frame_sent: bool,
    render_error_sent: bool,
    video_loaded: Arc<AtomicBool>,
    /// Keeps the mpv core alive until `context` is freed: fields drop in
    /// declaration order, and libmpv requires the render context to be
    /// freed before the core is destroyed (`render.h`). Without it, a late
    /// attach could hold the last core reference.
    _core: Arc<Mutex<Mpv>>,
}

thread_local! {
    static UI: RefCell<Option<LinuxUi>> = const { RefCell::new(None) };
    static RENDER_STATE: RefCell<Option<RenderState>> = const { RefCell::new(None) };
    /// Set once `gl::load_with` has run on this thread; GL calls before then
    /// would call null function pointers.
    static GL_LOADED: Cell<bool> = const { Cell::new(false) };
}

pub fn initialize(app: &AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main application window is unavailable.".to_string())?;
    let raw_display = window
        .display_handle()
        .map_err(|error| format!("Could not inspect the display: {error}"))?
        .as_raw();
    let wayland_display = match raw_display {
        RawDisplayHandle::Wayland(handle) => handle.display.as_ptr() as usize,
        _ => {
            return Err(
                "Embedded Linux playback currently requires a native Wayland session.".into(),
            )
        }
    };

    let result = Arc::new(Mutex::new(Err(
        "The Tauri WebView initialization callback did not run.".to_string(),
    )));
    let result_for_callback = result.clone();
    window
        .with_webview(move |platform_webview| {
            let setup = (|| -> Result<(), String> {
                let webview = platform_webview.inner();
                let parent = webview
                    .parent()
                    .ok_or_else(|| "The WebView does not have a GTK parent.".to_string())?;
                let parent = parent
                    .downcast::<gtk::Container>()
                    .map_err(|_| "The WebView parent is not a GTK container.".to_string())?;
                parent.set_hexpand(true);
                parent.set_vexpand(true);
                let native_window = parent
                    .parent()
                    .ok_or_else(|| "The WebView container has no GTK window.".to_string())?
                    .downcast::<gtk::Window>()
                    .map_err(|_| "The WebView container is not attached to a GTK window.".to_string())?;

                let overlay = gtk::Overlay::new();
                overlay.set_hexpand(true);
                overlay.set_vexpand(true);
                let fixed = gtk::Fixed::new();
                fixed.set_hexpand(true);
                fixed.set_vexpand(true);
                let gl_area = gtk::GLArea::new();
                gl_area.set_auto_render(false);
                gl_area.set_has_alpha(false);
                gl_area.set_required_version(3, 2);
                gl_area.set_use_es(false);
                gl_area.set_size_request(1, 1);

                gl_area.connect_render(|area, _| {
                    RENDER_STATE.with(|state| {
                        let mut state = state.borrow_mut();
                        let Some(state) = state.as_mut() else {
                            clear_surface();
                            return;
                        };
                        let scale = area.scale_factor().max(1);
                        let width = area.allocated_width().max(1) * scale;
                        let height = area.allocated_height().max(1) * scale;
                        let mut framebuffer = 0;
                        // SAFETY: GTK invokes the render signal with this GLArea's context
                        // current and the GL functions loaded, and `framebuffer` is a valid
                        // out-pointer for the single integer this query writes.
                        unsafe { gl::GetIntegerv(gl::FRAMEBUFFER_BINDING, &mut framebuffer) };
                        match state.context.render::<()>(framebuffer, width, height, true) {
                            Ok(()) => {
                                state.context.report_swap();
                                if !state.first_frame_sent && state.video_loaded.load(Ordering::Acquire) {
                                    state.first_frame_sent = true;
                                    let _ = state.app.emit("fluster://player-event", PlayerEvent::FirstFrame);
                                }
                            }
                            Err(error) if !state.render_error_sent => {
                                state.render_error_sent = true;
                                let _ = state.app.emit(
                                    "fluster://player-event",
                                    PlayerEvent::Error {
                                        message: format!("The embedded video frame could not be rendered: {error}"),
                                    },
                                );
                            }
                            Err(_) => {}
                        }
                    });
                    glib::Propagation::Proceed
                });

                parent.remove(&webview);
                webview.set_hexpand(true);
                webview.set_vexpand(true);
                webview.set_halign(gtk::Align::Fill);
                webview.set_valign(gtk::Align::Fill);
                native_window.remove(&parent);
                fixed.put(&gl_area, 0, 0);
                parent.add(&fixed);
                overlay.add(&parent);
                overlay.add_overlay(&webview);
                overlay.set_overlay_pass_through(&webview, false);
                native_window.add(&overlay);
                let sized_fixed = fixed.clone();
                let sized_webview = webview.clone();
                overlay.connect_size_allocate(move |_, allocation| {
                    sized_fixed.set_size_request(allocation.width(), allocation.height());
                    sized_webview.set_size_request(allocation.width(), allocation.height());
                });
                overlay.show_all();
                webview.grab_focus();

                UI.with(|slot| {
                    *slot.borrow_mut() = Some(LinuxUi {
                        fixed,
                        gl_area,
                        webview: webview.upcast(),
                        wayland_display,
                    });
                });
                Ok(())
            })();
            *result_for_callback.lock().expect("renderer result mutex poisoned") = setup;
        })
        .map_err(|error| format!("Could not access the native WebView: {error}"))?;

    let status = result
        .lock()
        .expect("renderer result mutex poisoned")
        .clone();
    status?;
    set_composition_background(app, LIBRARY_BACKGROUND)?;
    Ok("wayland-gtk-gl".to_string())
}

pub fn attach(
    app: &AppHandle,
    mpv: Arc<Mutex<Mpv>>,
    session_id: String,
    video_loaded: Arc<AtomicBool>,
) -> Result<(), String> {
    let app_for_render = app.clone();
    // Set when the caller gave up waiting; a late run installs nothing.
    let abandoned = Arc::new(AtomicBool::new(false));
    let abandoned_for_render = abandoned.clone();
    let result = run_on_main(app, move || {
        if abandoned_for_render.load(Ordering::Acquire) {
            return Err("The video surface attach was abandoned.".to_string());
        }
        // One render context at a time: a session that has not been
        // detached yet keeps the surface.
        if RENDER_STATE.with(|state| state.borrow().is_some()) {
            return Err("Another playback session still owns the video surface.".to_string());
        }
        set_composition_background(&app_for_render, PLAYBACK_BACKGROUND)?;
        UI.with(|slot| {
            let slot = slot.borrow();
            let ui = slot
                .as_ref()
                .ok_or_else(|| "The Wayland video surface is not initialized.".to_string())?;
            ui.webview.show();
            ui.gl_area.make_current();
            if let Some(error) = ui.gl_area.error() {
                return Err(format!("Could not create the GTK OpenGL context: {error}"));
            }
            gl::load_with(|name| gl_proc_address(name) as *const c_void);
            GL_LOADED.with(|loaded| loaded.set(true));

            let core = mpv.clone();
            let mut mpv = mpv
                .lock()
                .map_err(|_| "The libmpv mutex is poisoned.".to_string())?;
            let mut context = RenderContext::new(
                // SAFETY: `ctx` is a non-null handle owned by `Mpv`, and the held mutex
                // guard gives this call exclusive access to it for the borrow.
                unsafe { mpv.ctx.as_mut() },
                vec![
                    RenderParam::ApiType(RenderParamApiType::OpenGl),
                    RenderParam::InitParams(OpenGLInitParams {
                        get_proc_address: gl_proc_address_with_context,
                        ctx: (),
                    }),
                    RenderParam::WaylandDisplay(ui.wayland_display as *const c_void),
                ],
            )
            .map_err(|error| format!("Could not attach libmpv to the Wayland surface: {error}"))?;
            let redraw_session = session_id.clone();
            context.set_update_callback(move || {
                let redraw_session = redraw_session.clone();
                glib::MainContext::default().invoke(move || {
                    let current = RENDER_STATE.with(|state| {
                        state
                            .borrow()
                            .as_ref()
                            .is_some_and(|state| state.session_id == redraw_session)
                    });
                    if current {
                        UI.with(|slot| {
                            if let Some(ui) = slot.borrow().as_ref() {
                                ui.gl_area.queue_render();
                            }
                        });
                    }
                });
            });
            RENDER_STATE.with(|state| {
                *state.borrow_mut() = Some(RenderState {
                    session_id,
                    context,
                    app: app_for_render,
                    first_frame_sent: false,
                    render_error_sent: false,
                    video_loaded,
                    _core: core,
                });
            });
            ui.gl_area.queue_render();
            Ok(())
        })
    });
    if result.is_err() {
        abandoned.store(true, Ordering::Release);
        let app_for_restore = app.clone();
        let _ = run_on_main(app, move || {
            set_composition_background(&app_for_restore, LIBRARY_BACKGROUND)
        });
    }
    result
}

pub fn set_frame(app: &AppHandle, frame: PlayerSurfaceFrame) -> Result<(), String> {
    run_on_main(app, move || {
        UI.with(|slot| {
            let slot = slot.borrow();
            let ui = slot
                .as_ref()
                .ok_or_else(|| "The Wayland video surface is not initialized.".to_string())?;
            if frame.visible {
                ui.fixed
                    .move_(&ui.gl_area, frame.x.round() as i32, frame.y.round() as i32);
                ui.gl_area
                    .set_size_request(frame.width.round() as i32, frame.height.round() as i32);
                ui.gl_area.queue_render();
            } else if RENDER_STATE.with(|state| state.borrow().is_none()) {
                // A live session keeps its size: a late hidden frame from the
                // previous view must not shrink a new session's surface.
                collapse_surface(ui);
            }
            Ok(())
        })
    })
}

fn set_composition_background(app: &AppHandle, color: Color) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main application window is unavailable.".to_string())?;
    window
        .set_background_color(Some(color))
        .map_err(|error| format!("Could not update the application background: {error}"))
}

fn run_on_main<T, F>(app: &AppHandle, operation: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let (sender, receiver) = mpsc::sync_channel(1);
    app.run_on_main_thread(move || {
        let _ = sender.send(operation());
    })
    .map_err(|error| format!("Could not schedule work on the GTK thread: {error}"))?;
    receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "The GTK video surface did not respond in time.".to_string())?
}
