# Validation gates

Automated checks cover direct-play request policy, secure server/subtitle origins, static URL construction, redaction, cancellable negotiation, ordered and bounded reporting, surface coalescing, typed player controls, runtime decoder classification, track-index mapping, lifecycle cleanup, and the browser player shell.

The pinned Jellyfin fixture is [tests/integration/docker-compose.yml](../tests/integration/docker-compose.yml). Licensed short media samples belong under `tests/samples/`; their expected names are documented there.

Before a release, record evidence for each gate:

1. On Jellyfin 10.11.7, test H.264, HEVC Main10, AV1, ASS, PGS, and multitrack files. Capture server access logs showing only ranged `Static=true` stream requests.
2. Query active encoding jobs during each playback and prove Jellyfin starts no FFmpeg process.

Gates 1 and 2 are automated against the synthetic samples by `pnpm test:tripwire` (P0-04, rules from decision 0002 since P10-09) on Jellyfin 10.11.7 and 12.4. It plays each sample through the real `JellyfinGateway` and watches three job signals: ffmpeg processes in the container, `/Sessions` `TranscodingInfo`, and the Jellyfin log (`TranscodeManager` command lines and `FFmpeg.*` log files). Attach the JSON log from `release-evidence/tripwire/` as evidence. The rules:

- Playable samples (H.264, HEVC HDR10, AV1, ASS, sidecar SRT, multitrack, versions, three episodes, and the dvdsub sample when generated), with no streaming limit: the plan is `DirectPlay`, no job signal fires, and every media request is `/Videos/{id}/stream` with exactly one `Static=true` or an external subtitle file, answered without a redirect. A playable sample that comes back as a conversion fails.
- The BluRay folder and, when generated, the ISO: the plan is `DirectStream` or `Transcode` and the player indicator carries a reason (the server's `TranscodeReasons`, or the fallback "the server needs to convert this file" when the server sends none, as 10.11.7 does for the folder). The tripwire fetches the master and variant playlists and every segment with the `Authorization` header, as Fluster does; every request must be same-origin `master.m3u8`, `main.m3u8`, or `hls1/…` with no credential parameter (any case) and `EnableTrickplay=false`, and no playlist body may name a credential parameter. After the stopped report (followed by `DELETE /Videos/ActiveEncodings` if it fails, as `PlaystateReporter` does), no ffmpeg process and no `TranscodingInfo` may remain 10 s later.
- A forced-limit run of the H.264 sample (local limit 0.2 Mbit/s, below the file's ~0.5 Mbit/s) must come back `Transcode` with `ContainerBitrateExceedsLimit` or `VideoBitrateNotSupported` under the same HLS and stop rules.
- For every conversion, the tripwire runs the app's own play-method check (`sessionPlayMethod` 3 s after start, then `confirmedPlan`) and reports the confirmed method afterwards, as the player does. `TranscodingInfo.IsVideoDirect`/`IsAudioDirect` while the job runs must agree with it (`DirectStream` exactly when both are true), and `/Sessions` `PlayState.PlayMethod` after the confirmed report must equal it. The negotiated method, the server's answer, and the confirmed method are recorded in the log.
- The `fluster-noconv` user (transcoding and remuxing disabled) must get `conversion-not-allowed` for the BluRay folder, with no media request and no job signal.

The dvdsub and ISO samples run only with `FLUSTER_CONVERSION_SAMPLES=1` set for both `pnpm samples:generate` and `pnpm test:tripwire`; CI sets it. PGS has no synthetic sample, and real disc folders are not in the fixture (the BluRay folder has a minimal playlist and clip info, see `tests/samples/README.md`), so those still need a manual check with real media. Results on 2026-11-08: plan 002 decision log (P10-09).

3. Verify `DirectPlay` start, ten-second progress, pause/seek progress, and stopped reports. Resume from a second client.
4. On Wayland with supported NVIDIA and AMD hardware, verify automatic NVDEC, VA-API, or Vulkan decoding. Record observed libmpv properties; no user selection is available or required.
5. Set the test-only `testForceSoftware` launch field in a native harness. Confirm `Software — CPU`, continued local playback, and no second PlaybackInfo or media request.
6. Verify in-shell playback, surface resizing, fullscreen, natural end, and explicit stop restore the library and hide the native surface. Back during negotiation must never launch a hidden session. Load failures and recoverable libmpv errors must remain in the player with working Retry and Back to Library actions.
7. Inspect application output and crash diagnostics for known canary tokens and authenticated query strings; none may appear.
8. On Apple Silicon, validate VideoToolbox, windowed/fullscreen geometry, Retina scaling, signed DMG startup, and normal teardown.
9. Extract the release AppImage on a clean Linux x86_64 host with no system mpv or libmpv. Run `release/test-appimage.sh`, confirm exactly one pinned media closure under `usr/lib`, verify the checksum, SBOM, provenance, notices, and licenses, then confirm playback reaches the first frame and normal EOF returns to the library.

Current development evidence (2026-08-20): the Linux Wayland renderer launched on the development machine, rendered an authenticated ranged H.264 sample in the React shell through NVDEC, displayed runtime diagnostics, and returned to the library after natural completion. Browser-development mode completed the same mocked connect/login/library/player/pause/back flow. Broader codec, AMD, software-fallback, clean-image, and macOS evidence remain release gates rather than unit-test claims.
