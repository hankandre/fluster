# Playback architecture

`JellyfinGateway` is the only server boundary. Jellyfin's SDK supplies device identity and the authenticated Axios transport; the gateway exposes only the calls needed by this slice. Its access token and user ID are private fields and are cleared on logout. Every server may use HTTPS. Plain HTTP is allowed for loopback hosts, and for private-LAN hosts after the user confirms an unencrypted-connection warning once per server `Id` and origin; public `http://` URLs are refused before any request (`docs/security.md`). Gateway requests never follow redirects.

`PlaybackPolicy` is the frozen `PLAYBACK_POLICY` value. `createPlaybackPlan` duplicates its critical false flags in both the posted DTO and query parameters, selects a file-backed source with `SupportsDirectPlay`, rejects a `TranscodingUrl` or HTTP/HLS source, and creates a `Static=true` original-file URL. External subtitle URLs are authenticated only after same-origin and credential checks; unsafe URLs fail the plan before native launch.

`PlaybackCoordinator` requests that plan with an abortable attempt, launches a `PlayerEngine`, and translates player state into Jellyfin reports. Start is sent only after `file-loaded`; progress is sent every ten seconds and after pause, seek, or track changes; stop is sent after natural completion, explicit stop, recoverable player failure, or graceful window close. A dedicated queue preserves report order without blocking player events, and final draining is bounded. Every report declares `DirectPlay`. Retry waits for teardown, discards the old authenticated URL, and requests a new PlaybackInfo plan and play-session identity.

React reduces typed player events with switch statements into a small `PlaybackSessionState`. Snapshot, first-frame readiness, reporting warnings, and playback errors are retained independently; buffering and diagnostics come directly from the current snapshot.

The desktop `NativePlayerEngine` calls a narrow Tauri command surface. Rust owns libmpv in-process and exposes only initialize, load, surface geometry, pause, seek, volume, mute, track selection, fullscreen, and stop. There is no generic mpv command bridge and no standalone player process.

The Jellyfin server socket also lives in Rust (`src-tauri/src/realtime.rs`), behind two more commands: `realtime_connect { serverUrl, authorization }` and `realtime_disconnect`. The WebView's WebSocket API cannot send an `Authorization` header and a token must never travel in a URL, so Rust opens `wss://host/socket` (or `ws://` where `http://` is allowed: loopback and private-LAN hosts) with the `Authorization: MediaBrowser …` header, validates the server URL with the same host-class policy as playback URLs, answers `ForceKeepAlive` with `KeepAlive` at half the server's timeout (clamped to 2–600 seconds), treats two keepalive periods without any server frame as a dead connection, and reconnects with backoff capped at 30 seconds. It stops after a 401 or 403. If the socket task ever panics, the frontend receives `disconnected` and the task restarts after 30 seconds. Only `fluster://server-event` reaches the frontend, carrying `{ kind: "user-data-changed", itemIds }` or `{ kind: "connection", state }`; every other server message is dropped. The session connects after sign-in and disconnects on sign-out or replacement; a `user-data-changed` event, or a reconnect after a lost connection, refetches the Home rows. Browser development mode uses a no-op connection and has no live refresh.

The native window is composed as follows:

```text
Tauri window
├── native libmpv OpenGL surface
│   ├── Linux Wayland: GTK GLArea
│   └── macOS: NSOpenGLView
└── transparent WebView
    ├── opaque application pages
    ├── transparent player rectangle
    └── React controls and diagnostics
```

`NativeVideoSurface` measures its DOM rectangle with `ResizeObserver`, skips unchanged frames, and keeps only the newest geometry while one native update is in flight. The WebView remains interactive above the native surface. Linux reparents WebKitGTK into an overlay layer; macOS inserts the OpenGL view below the WKWebView. Renderer objects and libmpv render contexts stay on their platform UI thread.

libmpv starts with configuration and normal mpv input disabled, `vo=libmpv`, and `hwdec=auto`. Startup queries and caches the loaded mpv version and rejects anything older than 0.41 with an AppImage/package hint. Runtime properties such as `hwdec-current`, `hwdec-interop`, hardware pixel format, codec, dimensions, bit depth, video output, GPU context, and dropped frames are authoritative. Ordinary snapshots are coalesced to five updates per second, while control and lifecycle changes remain immediate. A missing hardware decoder becomes `Software — CPU` with a warning and continues using the same original stream.

The browser `HtmlVideoEngine` uses the same React player view for component development, Playwright, and direct-file negotiation debugging. It is not used as a silent fallback when desktop native initialization fails; the desktop displays an in-app renderer error instead.

The Render API is in-process by design. A hard fault in libmpv or a graphics driver can terminate Fluster, so the native renderer remains isolated from the Jellyfin and React layers to keep a future out-of-process engine possible.
