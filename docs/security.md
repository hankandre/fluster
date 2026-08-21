# Security boundary

- Jellyfin access tokens are session-only fields inside `JellyfinGateway`.
- The authenticated stream URL is passed directly from the typed Tauri load request into in-process libmpv. It never appears in a child-process argument, environment variable, or IPC socket.
- Rust exposes load, surface geometry, pause, seek, volume, mute, audio/subtitle selection, fullscreen, and stop. It does not accept arbitrary mpv commands.
- libmpv starts with application-controlled configuration loading and default input bindings disabled, preventing user scripts or config from changing playback policy.
- Rust errors redact URLs and query strings. The frontend does not log request objects, authenticated URLs, passwords, or tokens.
- External subtitle URLs may include the session token, but remain in memory and enter libmpv only through the typed subtitle-loading path.
- The browser player is development-only and necessarily exposes its request to browser developer tools. It does not persist the URL and does not provide authoritative decode diagnostics.
- Tauri is pinned to an exact version because the native composition accesses platform WebView handles. macOS uses Tauri's private API support and therefore is not intended for Mac App Store distribution.

No player preferences are persisted in this slice. Authentication secrets must not be added to persisted Query caches, analytics, crash payloads, or diagnostic exports.

In-process rendering intentionally trades fault isolation for integrated presentation. A native libmpv or graphics-driver crash can terminate the application; normal playback errors and end-of-file events are recovered in the player lifecycle.
