//! Linux surface teardown after a session: the GTK side of `surface::teardown`.

use super::super::teardown::{tear_down, SurfaceTeardown};
use super::{
    run_on_main, set_composition_background, LinuxUi, GL_LOADED, LIBRARY_BACKGROUND, RENDER_STATE,
    UI,
};
use gtk::glib;
use gtk::prelude::*;
use std::cell::Cell;
use tauri::AppHandle;

pub fn detach(app: &AppHandle, session_id: &str) {
    #[cfg(debug_assertions)]
    eprintln!("[fluster native] scheduling GTK detach");
    let session_id = session_id.to_string();
    let app_for_detach = app.clone();
    let _ = run_on_main(app, move || {
        #[cfg(debug_assertions)]
        eprintln!("[fluster native] GTK detach started");
        let result = UI.with(|slot| match slot.borrow().as_ref() {
            Some(ui) => tear_down(
                &mut LinuxTeardown {
                    app: &app_for_detach,
                    ui,
                },
                &session_id,
            ),
            None => {
                // Unreachable after a successful attach, which needs the UI.
                RENDER_STATE.with(|state| state.borrow_mut().take());
                Ok(())
            }
        });
        #[cfg(debug_assertions)]
        eprintln!("[fluster native] GTK detach finished");
        result
    });
}

struct LinuxTeardown<'a> {
    app: &'a AppHandle,
    ui: &'a LinuxUi,
}

impl SurfaceTeardown for LinuxTeardown<'_> {
    fn owns_surface(&self, session_id: &str) -> bool {
        RENDER_STATE.with(|state| {
            state
                .borrow()
                .as_ref()
                .is_some_and(|state| state.session_id == session_id)
        })
    }

    fn make_current(&mut self) -> Result<(), String> {
        self.ui.gl_area.make_current();
        match self.ui.gl_area.error() {
            Some(error) => Err(error.to_string()),
            None => Ok(()),
        }
    }

    fn free_render_context(&mut self) {
        #[cfg(debug_assertions)]
        eprintln!("[fluster native] dropping render context");
        // Take first, then drop, so no RefCell borrow is held while libmpv frees.
        let state = RENDER_STATE.with(|state| state.borrow_mut().take());
        drop(state);
        #[cfg(debug_assertions)]
        eprintln!("[fluster native] render context dropped");
    }

    fn collapse_surface(&mut self) {
        collapse_surface(self.ui);
    }

    fn restore_background(&mut self) -> Result<(), String> {
        set_composition_background(self.app, LIBRARY_BACKGROUND)
    }

    fn queue_redraw(&mut self) {
        // Keep the GLArea mapped for the lifetime of the window. Unmapping it
        // invalidates GTK/WebKit damage tracking under Wayland and can leave
        // only pointer-damaged regions updating.
        self.ui.fixed.queue_resize();
        self.ui.webview.show();
        self.ui.webview.queue_draw();
        if let Some(window) = self.ui.gl_area.toplevel() {
            window.queue_draw();
            #[cfg(debug_assertions)]
            trace_next_paint(&window);
        }
    }
}

/// Shrinks the video surface to 1×1 at the origin and redraws it, so the
/// render handler clears it and no stale frame stays under the WebView.
pub(super) fn collapse_surface(ui: &LinuxUi) {
    ui.fixed.move_(&ui.gl_area, 0, 0);
    ui.gl_area.set_size_request(1, 1);
    ui.gl_area.queue_render();
}

/// Clears the bound framebuffer to opaque black; called from the render
/// signal when no session owns the surface.
pub(super) fn clear_surface() {
    if !GL_LOADED.with(Cell::get) {
        return;
    }
    // SAFETY: only called from the GLArea render signal, which GTK invokes
    // with this area's context current, and `GL_LOADED` proves `gl::load_with`
    // has resolved these functions on this thread.
    unsafe {
        gl::ClearColor(0.0, 0.0, 0.0, 1.0);
        gl::Clear(gl::COLOR_BUFFER_BIT);
    }
}

/// Debug builds: prints once after the window's next paint phase. This shows
/// GTK's frame clock still runs; it does not prove pixels reached the screen.
#[cfg(debug_assertions)]
fn trace_next_paint(window: &gtk::Widget) {
    let Some(clock) = window.frame_clock() else {
        return;
    };
    let handler = std::rc::Rc::new(Cell::new(None::<glib::SignalHandlerId>));
    let handler_for_paint = handler.clone();
    let id = clock.connect_after_paint(move |clock| {
        eprintln!("[fluster native] window painted after detach");
        if let Some(id) = handler_for_paint.take() {
            clock.disconnect(id);
        }
    });
    handler.set(Some(id));
}
