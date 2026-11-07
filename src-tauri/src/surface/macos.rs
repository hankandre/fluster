#![allow(deprecated)]

use crate::model::{PlayerEvent, PlayerSurfaceFrame};
use cocoa::appkit::{NSOpenGLContext, NSOpenGLPixelFormat, NSOpenGLView, NSView};
use cocoa::base::{id, nil};
use cocoa::foundation::{NSAutoreleasePool, NSPoint, NSRect, NSSize};
use dispatch::Queue;
use libmpv2::{
    render::{OpenGLInitParams, RenderContext, RenderParam, RenderParamApiType},
    Mpv,
};
use objc::{msg_send, sel, sel_impl};
use std::cell::RefCell;
use std::ffi::{c_char, c_void, CString};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

const NS_OPENGL_PROFILE_VERSION_3_2_CORE: u32 = 0x3200;

struct MacUi {
    view: usize,
    context: usize,
    content_view: usize,
}

struct RenderState {
    session_id: String,
    context: RenderContext,
    app: AppHandle,
    first_frame_sent: bool,
    render_error_sent: bool,
    video_loaded: Arc<AtomicBool>,
}

thread_local! {
    static UI: RefCell<Option<MacUi>> = const { RefCell::new(None) };
    static RENDER_STATE: RefCell<Option<RenderState>> = const { RefCell::new(None) };
}

pub fn initialize(app: &AppHandle) -> Result<String, String> {
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "The main application window is unavailable.".to_string())?;
    let result = Arc::new(Mutex::new(Err(
        "The Tauri WebView initialization callback did not run.".to_string(),
    )));
    let result_for_callback = result.clone();
    window
        .with_webview(move |platform_webview| {
            let setup = unsafe { build_view(platform_webview.inner() as id) };
            *result_for_callback
                .lock()
                .expect("renderer result mutex poisoned") = setup;
        })
        .map_err(|error| format!("Could not access the native WebView: {error}"))?;
    result
        .lock()
        .expect("renderer result mutex poisoned")
        .clone()
        .map(|()| "macos-nsopengl".to_string())
}

unsafe fn build_view(webview: id) -> Result<(), String> {
    let _pool = NSAutoreleasePool::new(nil);
    let content_view: id = msg_send![webview, superview];
    if content_view == nil {
        return Err("The WKWebView has no native parent view.".into());
    }
    let bounds: NSRect = NSView::bounds(content_view);
    let attributes = [
        cocoa::appkit::NSOpenGLPFAOpenGLProfile as u32,
        NS_OPENGL_PROFILE_VERSION_3_2_CORE,
        cocoa::appkit::NSOpenGLPFADoubleBuffer as u32,
        cocoa::appkit::NSOpenGLPFAAccelerated as u32,
        0,
    ];
    let pixel_format = NSOpenGLPixelFormat::alloc(nil);
    let pixel_format = NSOpenGLPixelFormat::initWithAttributes_(pixel_format, &attributes);
    if pixel_format == nil {
        return Err("macOS could not create an accelerated OpenGL 3.2 pixel format.".into());
    }
    let gl_view = NSOpenGLView::alloc(nil);
    let gl_view = NSOpenGLView::initWithFrame_pixelFormat_(gl_view, bounds, pixel_format);
    if gl_view == nil {
        return Err("macOS could not create the embedded OpenGL view.".into());
    }
    let gl_context: id = msg_send![gl_view, openGLContext];
    if gl_context == nil {
        return Err("The embedded OpenGL view did not provide a context.".into());
    }
    let _: () = msg_send![gl_view, prepareOpenGL];
    let _: () = msg_send![gl_view, setHidden: true];
    let _: () = msg_send![content_view, addSubview: gl_view positioned: -1i64 relativeTo: webview];
    UI.with(|slot| {
        *slot.borrow_mut() = Some(MacUi {
            view: gl_view as usize,
            context: gl_context as usize,
            content_view: content_view as usize,
        });
    });
    Ok(())
}

pub fn attach(
    app: &AppHandle,
    mpv: Arc<Mutex<Mpv>>,
    session_id: String,
    video_loaded: Arc<AtomicBool>,
) -> Result<(), String> {
    let app_for_render = app.clone();
    run_on_main(app, move || {
        UI.with(|slot| {
            let slot = slot.borrow();
            let ui = slot
                .as_ref()
                .ok_or_else(|| "The macOS video surface is not initialized.".to_string())?;
            let view = ui.view as id;
            let context = ui.context as id;
            unsafe {
                let _: () = msg_send![view, prepareOpenGL];
                NSOpenGLContext::setView_(context, view);
                NSOpenGLContext::makeCurrentContext(context);
                let _: () = msg_send![view, setHidden: false];
            }
            let mut mpv = mpv
                .lock()
                .map_err(|_| "The libmpv mutex is poisoned.".to_string())?;
            let mut render_context = RenderContext::new(
                unsafe { mpv.ctx.as_mut() },
                vec![
                    RenderParam::ApiType(RenderParamApiType::OpenGl),
                    RenderParam::InitParams(OpenGLInitParams {
                        get_proc_address: gl_proc_address,
                        ctx: (),
                    }),
                ],
            )
            .map_err(|error| format!("Could not attach libmpv to the macOS surface: {error}"))?;
            let redraw_session = session_id.clone();
            render_context.set_update_callback(move || {
                let redraw_session = redraw_session.clone();
                Queue::main().exec_async(move || draw(&redraw_session));
            });
            RENDER_STATE.with(|state| {
                *state.borrow_mut() = Some(RenderState {
                    session_id: session_id.clone(),
                    context: render_context,
                    app: app_for_render,
                    first_frame_sent: false,
                    render_error_sent: false,
                    video_loaded,
                });
            });
            draw(&session_id);
            Ok(())
        })
    })
}

fn draw(session_id: &str) {
    UI.with(|ui| {
        RENDER_STATE.with(|state| {
            let ui = ui.borrow();
            let mut state = state.borrow_mut();
            let (Some(ui), Some(state)) = (ui.as_ref(), state.as_mut()) else {
                return;
            };
            if state.session_id != session_id {
                return;
            }
            unsafe {
                let view = ui.view as id;
                let context = ui.context as id;
                NSOpenGLContext::makeCurrentContext(context);
                let bounds: NSRect = NSView::bounds(view);
                let window: id = msg_send![view, window];
                let scale: f64 = if window == nil {
                    1.0
                } else {
                    msg_send![window, backingScaleFactor]
                };
                let width = (bounds.size.width * scale).round().max(1.0) as i32;
                let height = (bounds.size.height * scale).round().max(1.0) as i32;
                match state.context.render::<()>(0, width, height, true) {
                    Ok(()) => {
                        NSOpenGLContext::flushBuffer(context);
                        state.context.report_swap();
                        if !state.first_frame_sent && state.video_loaded.load(Ordering::Acquire) {
                            state.first_frame_sent = true;
                            let _ = state
                                .app
                                .emit("fluster://player-event", PlayerEvent::FirstFrame);
                        }
                    }
                    Err(error) if !state.render_error_sent => {
                        state.render_error_sent = true;
                        let _ = state.app.emit(
                            "fluster://player-event",
                            PlayerEvent::Error {
                                message: format!(
                                    "The embedded video frame could not be rendered: {error}"
                                ),
                            },
                        );
                    }
                    Err(_) => {}
                }
            }
        });
    });
}

pub fn set_frame(app: &AppHandle, frame: PlayerSurfaceFrame) -> Result<(), String> {
    run_on_main(app, move || {
        UI.with(|slot| {
            let slot = slot.borrow();
            let ui = slot
                .as_ref()
                .ok_or_else(|| "The macOS video surface is not initialized.".to_string())?;
            unsafe {
                let content = ui.content_view as id;
                let view = ui.view as id;
                let bounds: NSRect = NSView::bounds(content);
                let y = bounds.size.height - frame.y - frame.height;
                let rect = NSRect::new(
                    NSPoint::new(frame.x, y),
                    NSSize::new(frame.width, frame.height),
                );
                NSView::setFrame_(view, rect);
                let _: () = msg_send![view, setHidden: !frame.visible];
                let context = ui.context as id;
                NSOpenGLContext::update(context);
            }
            Ok(())
        })
    })
}

pub fn detach(app: &AppHandle, session_id: &str) {
    let session_id = session_id.to_string();
    let _ = run_on_main(app, move || {
        let matches = RENDER_STATE.with(|state| {
            state
                .borrow()
                .as_ref()
                .is_some_and(|state| state.session_id == session_id)
        });
        if matches {
            RENDER_STATE.with(|state| drop(state.borrow_mut().take()));
            UI.with(|slot| {
                if let Some(ui) = slot.borrow().as_ref() {
                    unsafe {
                        let view = ui.view as id;
                        let _: () = msg_send![view, setHidden: true];
                    }
                }
            });
        }
        Ok(())
    });
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
    .map_err(|error| format!("Could not schedule work on the AppKit thread: {error}"))?;
    receiver
        .recv_timeout(Duration::from_secs(5))
        .map_err(|_| "The macOS video surface did not respond in time.".to_string())?
}

fn gl_proc_address(_: &(), name: &str) -> *mut c_void {
    static OPENGL: OnceLock<usize> = OnceLock::new();
    let handle = *OPENGL.get_or_init(|| {
        let path = CString::new("/System/Library/Frameworks/OpenGL.framework/OpenGL")
            .expect("static OpenGL path contains no null bytes");
        unsafe { libc::dlopen(path.as_ptr(), libc::RTLD_LAZY | libc::RTLD_GLOBAL) as usize }
    });
    if handle == 0 {
        return std::ptr::null_mut();
    }
    let Ok(name) = CString::new(name) else {
        return std::ptr::null_mut();
    };
    unsafe { libc::dlsym(handle as *mut c_void, name.as_ptr() as *const c_char) }
}
