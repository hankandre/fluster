# Fluster

Fluster is a Jellyfin 10.11 direct-play client. The current beta target is Linux x86_64 on Wayland. It asks Jellyfin for the untouched original file and decodes it locally with embedded libmpv. Video is drawn by a native OpenGL surface beneath a transparent Tauri WebView, while React renders the in-shell controls and overlays.

Server transcoding and remuxing are fixed off. They are not preferences and there is no fallback negotiation.

## Current vertical slice

- Manual HTTPS server URL and username/password login; loopback development may use HTTP, and the access token exists in memory only.
- A risk-first library view containing the ten latest movies and episodes.
- Jellyfin watched/resume state, with an explicit Resume or Start Over choice before negotiation.
- Static `/Videos/{itemId}/stream` playback with direct play enabled and direct stream/transcoding disabled.
- Embedded libmpv Render API output: GTK `GLArea` on Wayland and `NSOpenGLView` on macOS.
- A dedicated React player view with play/pause, seek, volume, mute, tracks, fullscreen, status, and diagnostics.
- Runtime hardware-decoder diagnostics, automatic local CPU fallback, and Jellyfin start/progress/stop reporting.
- In-player failure recovery. Retry requests fresh PlaybackInfo and a new play session; Back to Library stays available.
- A self-contained x86_64 AppImage with pinned libmpv 0.41, one media dependency closure, licenses, an SBOM, provenance, and an extraction test.
- Tailwind CSS 4 through the Vite plugin, plus a small component layer for the editorial artwork treatment.
- An embedded browser `<video>` engine for frontend development and CI. It never claims verified hardware acceleration and is not a desktop fallback.

GPU selection is automatic. There is no executable or GPU selector, and the desktop client never opens a separate player window.

X11, Windows, ARM64 Linux, Flatpak, full catalog browsing, search, downloads, persistent login, live TV, disc/ISO media, and music remain out of scope. The macOS renderer remains experimental and is outside this beta's validation claim.

## Develop

Requirements:

- Node 22+ and pnpm 11
- Rust 1.95.0 (pinned by `rust-toolchain.toml`)
- Tauri 2 platform prerequisites
- Linux: a Wayland session and libmpv 0.41+ development/runtime files
- macOS: Apple Silicon and a staged `libmpv.dylib` (see the release guide)

```sh
pnpm install
pnpm dev
pnpm tauri dev
```

`pnpm dev` opens browser-development mode. It is useful for UI work, but the Jellyfin server must allow that browser origin. `pnpm tauri dev` runs the native embedded renderer and is the only mode with authoritative hardware-decoding diagnostics.

On macOS development builds, stage the runtime first and expose it to the linker and loader:

```sh
./release/build-libmpv-macos.sh
LIBRARY_PATH="$PWD/src-tauri/resources/lib" \
DYLD_FALLBACK_LIBRARY_PATH="$PWD/src-tauri/resources/lib" \
pnpm tauri dev
```

Authentication remains session-only: the server credential and Jellyfin token are not stored in local storage, cookies, a keyring, or a config file.

## Verify

```sh
pnpm check
pnpm test:e2e
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm audit --audit-level moderate
```

See [docs/architecture.md](docs/architecture.md) for the native composition, [docs/validation.md](docs/validation.md) for Jellyfin and hardware gates, and [release/README.md](release/README.md) for bundled-runtime release builds.
