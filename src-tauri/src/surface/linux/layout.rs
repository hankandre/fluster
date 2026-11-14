use gtk::glib;
use gtk::prelude::*;
use gtk::subclass::prelude::*;

mod imp {
    use super::*;

    #[derive(Default)]
    pub struct VideoFixed;

    #[glib::object_subclass]
    impl ObjectSubclass for VideoFixed {
        const NAME: &'static str = "FlusterVideoFixed";
        type Type = super::VideoFixed;
        type ParentType = gtk::Fixed;
    }

    impl ObjectImpl for VideoFixed {}
    impl ContainerImpl for VideoFixed {}
    impl FixedImpl for VideoFixed {}

    // A plain `Fixed` asks for the extent of its children, so a video sized
    // for fullscreen would become the window's minimum size. This one asks
    // for nothing and still places and sizes its children as `Fixed` does.
    impl WidgetImpl for VideoFixed {
        fn preferred_width(&self) -> (i32, i32) {
            (0, 0)
        }

        fn preferred_height(&self) -> (i32, i32) {
            (0, 0)
        }

        fn preferred_width_for_height(&self, _height: i32) -> (i32, i32) {
            (0, 0)
        }

        fn preferred_height_for_width(&self, _width: i32) -> (i32, i32) {
            (0, 0)
        }
    }
}

glib::wrapper! {
    /// Holds the video `GLArea` at the frame the WebView reports, without
    /// letting that frame set the window's minimum size.
    pub struct VideoFixed(ObjectSubclass<imp::VideoFixed>)
        @extends gtk::Fixed, gtk::Container, gtk::Widget;
}

impl VideoFixed {
    fn new() -> Self {
        glib::Object::new()
    }
}

/// Moves the WebView into an overlay above a `Fixed` that holds the video
/// `GLArea`, and puts the overlay in the window where `parent` was.
pub(super) fn stack_video_under_webview(
    native_window: &gtk::Window,
    parent: &gtk::Container,
    webview: &gtk::Widget,
    gl_area: &gtk::GLArea,
) -> (gtk::Overlay, gtk::Fixed) {
    let overlay = gtk::Overlay::new();
    overlay.set_hexpand(true);
    overlay.set_vexpand(true);
    let fixed = VideoFixed::new().upcast::<gtk::Fixed>();
    fixed.set_hexpand(true);
    fixed.set_vexpand(true);

    parent.remove(webview);
    webview.set_hexpand(true);
    webview.set_vexpand(true);
    webview.set_halign(gtk::Align::Fill);
    webview.set_valign(gtk::Align::Fill);
    native_window.remove(parent);
    fixed.put(gl_area, 0, 0);
    parent.add(&fixed);
    overlay.add(parent);
    overlay.add_overlay(webview);
    overlay.set_overlay_pass_through(webview, false);
    native_window.add(&overlay);
    // No size requests here: a size request is a minimum, so one copied from
    // the overlay's allocation keeps the fullscreen size after the window
    // shrinks. Expand and fill already give both children the whole window.
    (overlay, fixed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn allocate(widget: &impl IsA<gtk::Widget>, width: i32, height: i32) {
        // GTK expects a size query before every allocation.
        let _ = widget.preferred_width();
        let _ = widget.preferred_height();
        widget.size_allocate(&gtk::Allocation::new(0, 0, width, height));
    }

    /// Builds the same widget tree as `initialize`, with a `DrawingArea`
    /// standing in for the WebKit view.
    fn stacked_window() -> (
        gtk::Window,
        gtk::Overlay,
        gtk::Widget,
        gtk::GLArea,
        gtk::Fixed,
    ) {
        gtk::init().expect("GTK needs a Wayland or X11 display");
        let window = gtk::Window::new(gtk::WindowType::Toplevel);
        let parent = gtk::Box::new(gtk::Orientation::Vertical, 0);
        let webview: gtk::Widget = gtk::DrawingArea::new().upcast();
        parent.add(&webview);
        window.add(&parent);
        let gl_area = gtk::GLArea::new();
        gl_area.set_size_request(1, 1);
        let (overlay, fixed) =
            stack_video_under_webview(&window, parent.upcast_ref(), &webview, &gl_area);
        overlay.show_all();
        (window, overlay, webview, gl_area, fixed)
    }

    // One test: gtk-rs refuses to initialise GTK on a second thread, and
    // libtest runs each test on its own thread.
    #[test]
    #[ignore = "needs a Wayland or X11 display; run with --ignored"]
    fn leaving_fullscreen_lets_the_window_shrink_and_the_webview_fill_it() {
        let (window, overlay, webview, gl_area, fixed) = stacked_window();
        allocate(&overlay, 1440, 900);
        assert_eq!(webview.allocated_width(), 1440);
        assert_eq!(webview.allocated_height(), 900);
        assert_eq!(fixed.allocated_width(), 1440);
        assert_eq!(fixed.allocated_height(), 900);

        // Fullscreen during playback: `set_frame` sizes the video to the
        // whole screen. Then back to a smaller window.
        allocate(&overlay, 2560, 1440);
        gl_area.set_size_request(2560, 1440);
        allocate(&overlay, 2560, 1440);
        assert_eq!(gl_area.allocated_width(), 2560);
        assert_eq!(gl_area.allocated_height(), 1440);

        let (min_width, _) = window.preferred_width();
        let (min_height, _) = window.preferred_height();
        assert!(
            min_width < 1280,
            "window minimum width stayed at {min_width}"
        );
        assert!(
            min_height < 720,
            "window minimum height stayed at {min_height}"
        );

        allocate(&overlay, 1280, 720);
        assert_eq!(webview.allocated_width(), 1280);
        assert_eq!(webview.allocated_height(), 720);
        assert_eq!(fixed.allocated_width(), 1280);
        assert_eq!(fixed.allocated_height(), 720);

        // The frontend then reports the smaller frame; the video follows it.
        gl_area.set_size_request(1280, 720);
        allocate(&overlay, 1280, 720);
        assert_eq!(gl_area.allocated_width(), 1280);
        assert_eq!(gl_area.allocated_height(), 720);
    }
}
