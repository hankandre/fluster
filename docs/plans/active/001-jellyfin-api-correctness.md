# 001: Jellyfin API correctness and 12.x compatibility

## Goal / Done when

Fluster plays correctly against Jellyfin 10.11.x **and** 12.x with default server settings, and the server provably starts no FFmpeg job.

Done when:

- [ ] Playback of each `docs/validation.md` sample succeeds on pinned 10.11 and 12.x fixtures with legacy authorization **off**
- [x] No request URL from Fluster contains a token (`api_key`, `ApiKey`, `Token`)
- [ ] External subtitles load from `DeliveryUrl`
- [ ] Audio/subtitle selection maps correctly for an item with one external subtitle plus embedded tracks
- [ ] A BluRay-folder source is refused with a typed reason before any stream request
- [ ] Server tripwire: no active encoding job during any fixture playback
- [ ] `pnpm check`, `pnpm test:e2e`, clippy are green

## Context and domains touched

Tasks: P1-01 through P1-09 in `tasks/prd.json`.

`ARCHITECTURE.md` §3 and §5; domains: Server Connection & Identity, Playback Negotiation, Player Engine (track mapping), Playstate Reporting. Invariants I1, I2, I4.

## Milestones

1. **Contract fixtures.** Record PlaybackInfo responses (with and without a DeviceProfile, plus an external-subtitle item and a BluRay-folder item) from 10.11 and 12.x. Validation: gateway tests replay them.
2. **Version gate.** Use a semver `>= 10.11.0` check and accept 12.x. Validation: unit tests for 10.10, 10.11.x, 12.4, malformed input.
3. **DeviceProfile + source acceptance.** Send `FLUSTER_PROFILE`; add the `VideoType` rejection; return typed refusal reasons. Validation: fixture tests; the empty-codec-matches-anything assumption is confirmed or the profile adjusted.
4. **Header auth to libmpv.** Add a typed auth-header field to `LaunchRequest`. Rust sets `http-header-fields` for the stream and `sub-add`. Remove `api_key` URL building; strip `ApiKey` from `DeliveryUrl`. Validation: Rust tests; a URL-token scan test; redaction canary.
5. **Track mapping.** Embedded index = `ff-index + count(IsExternal)`; external tracks by add order; apply the `Default*StreamIndex` values. Validation: Rust unit tests with mixed external and embedded fixtures.
6. **Session hygiene.** Stable derived DeviceId; `POST /Sessions/Logout` on logout; `Failed: true` on error stops. Validation: gateway and coordinator tests.
7. **Tripwire automation.** Add a script that plays the fixture samples and asserts no encoding jobs and only `Static=true` ranged requests. Validation: the script runs in CI against the docker fixture.
8. **SDK and paths.** Upgrade to `@jellyfin/sdk` 1.0.x; replace `/Users/{id}/Items` with `/Items`; remove invalid `fields`. Validation: full suite.

Suggested model routing (see `WORKFLOW.md`): Opus pilots milestones 3–5 (policy, native, mapping). Sonnet takes 1, 2, 6, 8. Opus reviews 3–5.

## Progress

- [x] 1 · [x] 2 · [x] 3 · [x] 4 · [ ] 5 · [x] 6 · [ ] 7 · [x] 8

## Decision log

- 2026-11-07: Support 10.11 and 12.x. Header auth via a fixed mpv header field is acceptable under the "no generic mpv bridge" rule, because it is a single typed value set by Rust at load time.

- 2026-11-07 (P1-03): Source-acceptance rules run in the `ARCHITECTURE.md` §3 order and the first failing rule names the `RefusalReason`. The recorded BluRay folder therefore refuses as `no-direct-play` (the server already reports `SupportsDirectPlay: false` for it); `disc-source` applies when a server reports direct play for a disc folder. When nothing is acceptable, the first source's reason is reported.
- 2026-11-07 (P1-03, follow-up): The `VideoType` checks (BluRay/Dvd, then Iso) now run before `SupportsDirectPlay`, so the recorded BluRay folder refuses as `disc-source` and the UI can say why. This replaces the order in the entry above; `ARCHITECTURE.md` §3 lists the new order.
- 2026-11-07 (P1-03, review): Defense in depth after guardian review. `VideoType` matches in any case; a `BDMV`/`VIDEO_TS` path segment refuses as `disc-source` and a `.iso` path as `iso-source`, in case a server mislabels a disc. `RequiresOpening: true` refuses with a new `live-source` reason. Subtitle `DeliveryUrl` credential parameters (`ApiKey`, `api_key`, `access_token`, `Token`, `X-Emby-Token`, any case) are stripped before the same-origin check; before this, the profile-filled `?ApiKey=` passed the guard and the token was sent twice. P1-04 replaces the remaining `api_key` with header auth.
- 2026-11-07 (P1-04): The header travels as `LaunchRequest.authorization` (a validated `MediaBrowserAuthorization`, shared with the realtime socket), not inside the plan sent to Rust. Rust sets it as the only `http-header-fields` item on the per-session mpv handle, with commas escaped as `\,` because mpv splits string lists on commas (`get_nextsep` in `options/m_option.c`); `http-header-fields-append` is refused by `mpv_set_option` (error -5, option not found). No Tauri command was added. Browser development mode keeps playing the token-free URL: a `<video>` cannot send a header, a `?ApiKey=` URL would break I4, and fetching into a blob would buffer whole files. Playwright mocks media, so it is unaffected.
- 2026-11-07 (P1-03): Remote bitrate limits and `ForceRemoteSourceTranscoding` need no reason of their own: the server folds them into `SupportsDirectPlay: false` (`MediaInfoHelper.cs` v12.4 lines 259, 277, 307-309), so they surface as `no-direct-play`.
- 2026-11-07 (P1-03): `MediaSourceId` goes in the PlaybackInfo body only (as in `ARCHITECTURE.md` §3), and the gateway also filters the response to that id, so it never falls back to another version. Without a choice, the first acceptable source plays; the server already sorts direct-play file sources first (`MediaInfoHelper.cs` v12.4 line 382).
- 2026-11-07 (P1-03): The source refusal is checked before the missing `PlaySessionId` error, so an empty `MediaSources` response gives `no-sources` and not a generic error.

## Surprises & discoveries

- Jellyfin applies direct-play policy only when a DeviceProfile is sent.
- Disc-folder sources with `Static=true` start ffmpeg on the server.
- (P1-04) Jellyfin 10.11.7 and 12.4.0 serve the static stream and subtitle routes without authentication: no `[Authorize]` on `VideosController.GetVideoStream` (v12.4 line 314) or `SubtitleController.GetSubtitle` (line 208), and both fixtures answered 206/200 with no header and with a bogus token. The old `api_key` URLs therefore did not break 12.x playback; their cost was the token in every URL. On 12.4 with legacy authorization off, `/Users/Me` rejects `?api_key=` (401) but still accepts `?ApiKey=` and the header (200); 10.11.7 accepts all three.

## Validation evidence

- Milestone 1 (P1-01): fixtures for 10.11.7 and 12.4.0 under `tests/fixtures/jellyfin/` (h264 with and without profile, external subtitle, multi-version, BluRay folder). `src/lib/jellyfin/fixtures.test.ts` replays them. Both servers returned the same shape; with the profile `SupportsTranscoding` is false and the external subtitle has `DeliveryMethod: External` with an `?ApiKey=` `DeliveryUrl`; the BluRay folder source reports `VideoType: BluRay` and `SupportsDirectPlay: false`.
- Milestone 3 (P1-03): `FLUSTER_PROFILE` (`src/lib/jellyfin/device-profile.ts`) goes in the body of every PlaybackInfo request; the false flags stay in body and query. `src/lib/jellyfin/source-acceptance.ts` applies the seven §3 rules (disc and ISO by `VideoType` or path, live sources, then direct play, protocol, transcoding URL, ids) and returns a typed `RefusalReason`; the gateway throws `PlaybackRefusedError`. Empty-codec assumption: new profile fixtures `playbackinfo-{hevc-hdr10,av1,ass,multitrack}-profile.json` recorded on 10.11.7 and 12.4.0 all report `SupportsDirectPlay: true`, `SupportsTranscoding: false`, no `TranscodingUrl` (ASS gets `DeliveryMethod: Embed`), so the profile needs no change. `fixtures.test.ts` asserts that, the BluRay `VideoType` refusal with the server saying direct play, `MediaSourceId` version selection, and the recorded sidecar `DeliveryUrl` losing its `ApiKey`; tests assert body and query with `toEqual`. `pnpm check` (258 Vitest tests, Rust tests) and `pnpm test:e2e` (11 passed) pass. Not run: native playback, tripwire against a real stream.
- Milestone 6 (P1-06): `pnpm test -- gateway coordinator` covers DeviceId stability, `POST /Sessions/Logout`, and `Failed: true` on error stops. DeviceId uses the username in place of the user id because login needs it before the user id exists.
- Milestone 4 (P1-04): `buildStaticStreamUrl` and the subtitle builder no longer add a token; `PlaybackPlan.authorization` carries the header and `NativePlayerEngine` sends it as `LaunchRequest.authorization`. Rust `validate_playback_urls` refuses credential query names in any case. Loopback tests in `src-tauri/src/mpv.rs` (`media_auth_wire`) check the exact `Authorization` line for the stream and `sub-add`, and that a 302 to a second origin reaches nothing with the header set; reverting the comma escaping or `max_redirects=0` makes them fail. URL-token scans: `fixtures.test.ts`, `gateway.test.ts`, and the Playwright smoke test `never puts a token in a request URL`. Live, with plans from the real gateway: the ignored `live_fixture_server_playback` test (headless libmpv, `vo=null`, production network options) reached `file-loaded` and `playback-restart` for the H.264 and sidecar samples on 12.4.0 (legacy authorization off) and 10.11.7, and `sub-add` added the sidecar track. Checks: `cargo fmt --check`, clippy `-D warnings`, `cargo test` and `cargo test --release` (54 passed, 2 ignored live tests), `pnpm check` (407 Vitest tests, build, Rust tests), `pnpm test:e2e` (14 passed), `pnpm lint:boundaries` clean. Not run: `pnpm tauri dev` on a real surface, any GPU or hwdec, Wayland compositors, macOS, the AppImage, the server tripwire (milestone 7).
- M8: SDK pinned to 1.0.2; `latest()` uses `GET /Items?userId=`; `Fields` is `Overview` only. pnpm audit, check, e2e, lint:boundaries pass.

## Outcome & retrospective

_(fill in on completion)_
