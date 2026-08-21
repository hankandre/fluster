# Bundled media notices

The release AppImage includes an application-controlled build of libmpv and its user-space media dependencies. Exact source revisions are recorded in `components.lock`, which is included beside this notice in the application resources.

- mpv — GPL-2.0-or-later by default; LGPL-2.1-or-later when built with its non-GPL configuration. This recipe enables the GPL build because FFmpeg is configured with GPL features.
- FFmpeg — LGPL-2.1-or-later, with GPL-2.0-or-later applying to the configured GPL build.
- libass — ISC license.
- libplacebo — LGPL-2.1-or-later.
- nv-codec-headers — MIT license; interface definitions for NVIDIA's separately installed proprietary driver.

The complete upstream license files are copied from the pinned source trees into the `licenses/` resource directory by the build recipe. Release artifacts must include that directory and the corresponding source offer/source archives required by the licenses. Fluster does not bundle the Linux kernel, glibc, or proprietary GPU drivers.
