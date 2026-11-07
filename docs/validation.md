# Validation gates

Automated checks cover direct-play request policy, secure server/subtitle origins, static URL construction, redaction, cancellable negotiation, ordered and bounded reporting, surface coalescing, typed player controls, runtime decoder classification, track-index mapping, lifecycle cleanup, and the browser player shell.

The pinned Jellyfin fixture is [tests/integration/docker-compose.yml](../tests/integration/docker-compose.yml). Licensed short media samples belong under `tests/samples/`; their expected names are documented there.

Before a release, record evidence for each gate:

1. On Jellyfin 10.11.7, test H.264, HEVC Main10, AV1, ASS, PGS, and multitrack files. Capture server access logs showing only ranged `Static=true` stream requests.
2. Query active encoding jobs during each playback and prove Jellyfin starts no FFmpeg process.
3. Verify `DirectPlay` start, ten-second progress, pause/seek progress, and stopped reports. Resume from a second client.
4. On Wayland with supported NVIDIA and AMD hardware, verify automatic NVDEC, VA-API, or Vulkan decoding. Record observed libmpv properties; no user selection is available or required.
5. Set the test-only `testForceSoftware` launch field in a native harness. Confirm `Software — CPU`, continued local playback, and no second PlaybackInfo or media request.
6. Verify in-shell playback, surface resizing, fullscreen, natural end, and explicit stop restore the library and hide the native surface. Back during negotiation must never launch a hidden session. Load failures and recoverable libmpv errors must remain in the player with working Retry and Back to Library actions.
7. Inspect application output and crash diagnostics for known canary tokens and authenticated query strings; none may appear.
8. On Apple Silicon, validate VideoToolbox, windowed/fullscreen geometry, Retina scaling, signed DMG startup, and normal teardown.
9. Extract the release AppImage on a clean Linux x86_64 host with no system mpv or libmpv. Run `release/test-appimage.sh`, confirm exactly one pinned media closure under `usr/lib`, verify the checksum, SBOM, provenance, notices, and licenses, then confirm playback reaches the first frame and normal EOF returns to the library.

Current development evidence (2026-08-20): the Linux Wayland renderer launched on the development machine, rendered an authenticated ranged H.264 sample in the React shell through NVDEC, displayed runtime diagnostics, and returned to the library after natural completion. Browser-development mode completed the same mocked connect/login/library/player/pause/back flow. Broader codec, AMD, software-fallback, clean-image, and macOS evidence remain release gates rather than unit-test claims.
