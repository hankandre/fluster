//! Resolves GL symbols through libEGL for GTK's GL context and libmpv.

use std::ffi::{c_char, c_void, CString};
use std::sync::OnceLock;

pub(super) fn gl_proc_address(name: &str) -> *mut c_void {
    let Ok(name) = CString::new(name) else {
        return std::ptr::null_mut();
    };
    egl_proc_address(name.as_ptr())
}

pub(super) fn gl_proc_address_with_context(_: &(), name: &str) -> *mut c_void {
    gl_proc_address(name)
}

fn egl_proc_address(name: *const c_char) -> *mut c_void {
    type GetProcAddress = unsafe extern "C" fn(*const c_char) -> *mut c_void;
    static EGL: OnceLock<Result<libloading::Library, String>> = OnceLock::new();
    let library = match EGL.get_or_init(|| {
        // SAFETY: libEGL initializers are trusted system code; the library is
        // stored in a static and is never unloaded.
        unsafe { libloading::Library::new("libEGL.so.1") }.map_err(|error| error.to_string())
    }) {
        Ok(library) => library,
        Err(_) => return std::ptr::null_mut(),
    };
    // SAFETY: `eglGetProcAddress` has the declared C signature, `name` is a
    // NUL-terminated string from the caller, and `library` lives in a static so
    // the returned symbol never outlives it.
    unsafe {
        match library.get::<GetProcAddress>(b"eglGetProcAddress\0") {
            Ok(get_proc_address) => get_proc_address(name),
            Err(_) => std::ptr::null_mut(),
        }
    }
}
