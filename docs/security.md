# Security boundary

- Jellyfin access tokens are session-only fields inside `JellyfinGateway`.
- Remote servers must use HTTPS. Plain HTTP is accepted only for `localhost` or `127.0.0.1`, and URLs containing user information are rejected.
- The authenticated stream URL is passed directly from the typed Tauri load request into in-process libmpv. It never appears in a child-process argument, environment variable, or IPC socket.
- Rust exposes load, surface geometry, pause, seek, volume, mute, audio/subtitle selection, fullscreen, and stop. It does not accept arbitrary mpv commands.
- Rust also exposes `realtime_connect` (server URL and Authorization header) and `realtime_disconnect` for the Jellyfin server socket. The socket lives in Rust because the WebView's WebSocket API cannot send an `Authorization` header and tokens never go in URLs. The server URL must pass the same HTTPS-or-loopback, no-credentials policy as playback URLs; the header must be a `MediaBrowser` header with a token and no control characters, and is marked sensitive. Rust forwards only typed `user-data-changed` and `connection` events, never logs the URL, header, or server responses, and reports connection failures only as fixed descriptions. `SessionGateway.authorizationHeader()` is the only TypeScript accessor for the header and exists for this command alone.
- libmpv starts with application-controlled configuration loading and default input bindings disabled, preventing user scripts or config from changing playback policy.
- Rust errors redact URLs and query strings. The frontend does not log request objects, authenticated URLs, passwords, or tokens.
- External subtitle URLs must use the stream's origin and HTTP(S), must not arrive with credentials, and are authenticated only after validation. TypeScript and Rust enforce the same policy before libmpv sees them.
- The browser player is development-only and necessarily exposes its request to browser developer tools. It does not persist the URL and does not provide authoritative decode diagnostics.
- Tauri is pinned to an exact version because the native composition accesses platform WebView handles. The WebView CSP allows remote HTTPS and loopback HTTP for user-selected Jellyfin servers but does not load remote fonts or scripts. macOS uses Tauri's private API support and therefore is not intended for Mac App Store distribution.

No player preferences are persisted in this slice. Authentication secrets must not be added to persisted Query caches, analytics, crash payloads, or diagnostic exports.

In-process rendering intentionally trades fault isolation for integrated presentation. A native libmpv or graphics-driver crash can terminate the application; normal playback errors and end-of-file events are recovered in the player lifecycle.
