//! The order in which the Linux video surface is torn down after a session.
//!
//! libmpv frees GL objects when its render context is dropped, so the GL
//! context it was created with must be current first (`render.h`). After the
//! free, the surface is cleared and collapsed so no stale frame stays under
//! the WebView, and the whole window is redrawn. The GTK calls live in
//! `linux.rs`; this module only fixes their order so it can be unit tested.

/// One method per teardown step, implemented over the GTK surface.
pub(super) trait SurfaceTeardown {
    fn owns_surface(&self, session_id: &str) -> bool;
    fn make_current(&mut self) -> Result<(), String>;
    fn free_render_context(&mut self);
    fn collapse_surface(&mut self);
    fn restore_background(&mut self) -> Result<(), String>;
    fn queue_redraw(&mut self);
}

/// Tears the surface down when `session_id` owns it; does nothing otherwise,
/// so a second detach, or one from an older session, leaves the surface and
/// its background alone. The render context is freed even when its GL context
/// cannot be made current, and the window is redrawn even when the background
/// cannot be restored; the background error is returned afterwards.
pub(super) fn tear_down(
    surface: &mut impl SurfaceTeardown,
    session_id: &str,
) -> Result<(), String> {
    if !surface.owns_surface(session_id) {
        return Ok(());
    }
    if surface.make_current().is_err() {
        #[cfg(debug_assertions)]
        eprintln!("[fluster native] video GL context not current; freeing render context anyway");
    }
    surface.free_render_context();
    surface.collapse_surface();
    let background = surface.restore_background();
    surface.queue_redraw();
    background
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[derive(Default)]
    struct Recorder {
        owner: Option<String>,
        fail_make_current: bool,
        fail_background: bool,
        steps: Vec<&'static str>,
    }

    impl Recorder {
        fn owned_by(owner: &str) -> Self {
            Self {
                owner: Some(owner.to_string()),
                ..Self::default()
            }
        }
    }

    impl SurfaceTeardown for Recorder {
        fn owns_surface(&self, session_id: &str) -> bool {
            self.owner.as_deref() == Some(session_id)
        }
        fn make_current(&mut self) -> Result<(), String> {
            self.steps.push("make_current");
            if self.fail_make_current {
                Err("no context".into())
            } else {
                Ok(())
            }
        }
        fn free_render_context(&mut self) {
            self.steps.push("free_render_context");
            self.owner = None;
        }
        fn collapse_surface(&mut self) {
            self.steps.push("collapse_surface");
        }
        fn restore_background(&mut self) -> Result<(), String> {
            self.steps.push("restore_background");
            if self.fail_background {
                Err("no window".into())
            } else {
                Ok(())
            }
        }
        fn queue_redraw(&mut self) {
            self.steps.push("queue_redraw");
        }
    }

    const ALL_STEPS: [&str; 5] = [
        "make_current",
        "free_render_context",
        "collapse_surface",
        "restore_background",
        "queue_redraw",
    ];

    #[test]
    fn owning_session_runs_every_step_once_in_order() {
        let mut surface = Recorder::owned_by("a");
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert_eq!(surface.steps, ALL_STEPS);
    }

    #[test]
    fn render_context_is_freed_when_gl_context_cannot_be_made_current() {
        let mut surface = Recorder {
            fail_make_current: true,
            ..Recorder::owned_by("a")
        };
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert_eq!(surface.steps, ALL_STEPS);
    }

    #[test]
    fn window_is_redrawn_when_background_cannot_be_restored() {
        let mut surface = Recorder {
            fail_background: true,
            ..Recorder::owned_by("a")
        };
        assert_eq!(tear_down(&mut surface, "a"), Err("no window".to_string()));
        assert_eq!(surface.steps, ALL_STEPS);
    }

    #[test]
    fn another_session_surface_is_left_alone() {
        let mut surface = Recorder::owned_by("b");
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert!(surface.steps.is_empty());
    }

    #[test]
    fn unowned_surface_is_left_alone() {
        let mut surface = Recorder::default();
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert!(surface.steps.is_empty());
    }

    #[test]
    fn second_detach_of_the_same_session_does_nothing() {
        let mut surface = Recorder::owned_by("a");
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert_eq!(tear_down(&mut surface, "a"), Ok(()));
        assert_eq!(surface.steps, ALL_STEPS);
    }
}
