# 002: Server conversion fallback and client parity

## Goal / Done when

Make Fluster a full replacement for other Jellyfin clients: keep playing the original file whenever mpv can, fall back to server direct stream and then transcode only when it must, always show it, and add Music and an early Android TV shell. Policy: [decision 0002](../../decisions/0002-server-transcoding-fallback.md).

Tasks: P10-01 to P10-12 (playback parity), P11-01 to P11-07 (music), P12-01 and P12-02 (early TV/mobile shell) in `tasks/prd.json`.

- [x] The user chose E1-B, accepted E2 with a canary test, set both streaming-limit defaults to no limit, and approved the order and acceptance changes (2026-11-07)
- [ ] `pnpm test:tripwire` passes the decision 0002 rules on 10.11.7 and 12.4.0: every playable sample direct plays with no server job; the BluRay folder and a forced-limit sample convert over same-origin, credential-free HLS with the indicator reason; no job survives 10 s after stop; `/Sessions` play method matches the plan
- [ ] Loopback Rust tests show the `Authorization` header on every HLS master, variant, segment, and subtitle request; a playlist with a cross-origin or credential-bearing URI, or a credential parameter anywhere in its body, is refused before mpv reads it; nothing reaches a second origin; and no token canary reaches logs, errors, events, or the UI
- [ ] A Transcode plan plays, seeks, pauses, and stops in `pnpm tauri dev` on Hankflix with the indicator visible and no job left on the server (P10-12)
- [ ] A music album plays as a gapless queue with playstate reported (P11-05, P11-06)
- [ ] The Android TV shell decision is recorded and P9-01 can start (P12-02)
- [ ] `pnpm check`, `pnpm test:e2e`, clippy are green

## Context and domains touched

- Product and policy: `PRODUCT.md` (principle 1, personas, M1b, M7, M6 order), decision 0002.
- `ARCHITECTURE.md` §3 (negotiation, profile, source decision, HLS URL rules, playstate, stopping conversions) and §4 invariants.
- Domains (`DOMAINS.md`): Playback Negotiation (core), Player Engine (core), Playback Session, Playstate Reporting, Catalog (music), App Shell & Presentation (indicator, settings, music views), Security & Redaction.
- Invariants: **I1** and **I2** are replaced (prefer original; transparent fallback; two URL shapes). **I3** (no new Tauri command for HLS; music queue commands are decided in P11-01). **I4** (HLS header auth, token canary). **I5** (redirects on HLS nested opens). **I6** (subtitles while converting). **I7** (browser engine does not play HLS).

Until P10-03 and P10-04 land, the code keeps enforcing the old direct-play-only rule. The docs say so where it matters.

## Milestones

Phase P10, playback parity (M1b). Native and mpv work stays serial: P10-01, then P10-04, then P11-05.

1. **HLS auth spike (P10-01).** Prototype E1-B: Rust fetches and validates the master and variant playlists (every URI same-origin and credential-free, fail closed on a credential parameter in the body) and serves validated copies to libmpv from a `127.0.0.1` loopback server. Loopback tests for the header on every server request, a cross-origin URI in a playlist being refused, redirect behavior, and whether `max_redirects` and `protocol_whitelist` reach nested opens; a rebuilt, key-free `master.m3u8` played to first frame on both fixtures. Decide whether mpv fetches segments directly with the header or Rust proxies them, and record the evidence. Validation: `cargo test --manifest-path src-tauri/Cargo.toml hls`. Model: Opus (`native-engineer`).
2. **Conversion contract fixtures (P10-02).** Record PlaybackInfo with the fallback profile for every sample at no limit, one sample under a forced limit, the BluRay folder, a user with transcoding disabled, a dvdsub sample, and an ISO sample if one can be generated. Tokens are replaced before commit. Validation: `pnpm test -- fixtures`. Model: Sonnet (`implementer`).
3. **Negotiation with fallback (P10-03).** `decideSource`, the new profile, flags in body and query, the forced-fallback re-request, HLS URL rebuilding, `playMethod` and reasons on the plan, new refusal reasons. Validation: `pnpm test -- source-acceptance device-profile gateway fixtures`. Model: Opus.
4. **mpv HLS playback with header auth (P10-04).** Typed `delivery` field, Rust HLS URL validation, E1-B playlist validation and loopback serving, cross-origin playlist and canary tests, final `docs/security.md` text. Validation: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml`. Model: Opus (`native-engineer`).
5. **Streaming limit setting (P10-05).** Local and remote maximum bitrate (both default to no limit), sent as `MaxStreamingBitrate`; "Play original" for the session when the user's limit is the only reason. Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.
6. **Indicator and PlayMethod reporting (P10-06).** "Converting on server: {reason}", "Repackaging on server, original quality: {reason}", burned-in subtitles, information panel, reports carry the plan's method. Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.
7. **Stop server conversions (P10-07).** `DELETE /Videos/ActiveEncodings` before a new play session for the same item and after a failed stopped report; ping while paused if the fixture shows it is needed. Validation: `pnpm test -- coordinator playstate-reporter gateway`. Model: Opus (coordinator concurrency).
8. **Track and quality changes while converting (P10-08).** Renegotiate at the current position for tracks the conversion lacks and for a limit change. Validation: `pnpm check && pnpm test:e2e`. Model: Opus.
9. **Tripwire repurpose (P10-09).** The decision 0002 rules (below). Validation: `pnpm test:tripwire`. Model: Opus.
10. **Browser engine for converted streams (P10-10).** Typed "needs the desktop player" refusal in the dev engine; no hls.js. Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.
11. **Fallback-aware refusal copy (P10-11).** Copy only for reasons that remain refusals. Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.
12. **Dogfood conversions on Hankflix (P10-12, human).** Validation: `pnpm tauri dev` plus the server dashboard. Model: Sonnet with the human.

Phase P12, early TV and mobile shell (runs beside P10 once P10-01 is done).

13. **Shell-neutral core (P12-01).** A boundary rule and a DOM-free type-check for domain, gateway, coordinator, and reporter. Validation: `pnpm check`. Model: Sonnet. Can start now.
14. **TV and mobile shell decision (P12-02).** Decision record: React Native (`react-native-tvos`) with libmpv on Android versus alternatives, how the engine sends the header on HLS, what P9-01 must prove. Validation: the record exists and the user approved it. Model: Opus (`planner`).

Phase P11, music (M7), after P10-03.

15. **Music playback decision (P11-01).** Queue transport to mpv (and any new typed Tauri commands), gapless approach, audio negotiation. Validation: decision record approved. Model: Opus.
16. **Music libraries (P11-02)** and **album and artist views (P11-03).** Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.
17. **Audio negotiation (P11-04).** Validation: `pnpm test -- source-acceptance device-profile gateway fixtures`. Model: Opus.
18. **Gapless queue in mpv (P11-05, human listening check).** Validation: `cargo test --manifest-path src-tauri/Cargo.toml` and a listening check. Model: Opus (`native-engineer`).
19. **Audio playstate (P11-06)** and **now-playing bar and queue view (P11-07).** Validation: `pnpm check && pnpm test:e2e`. Model: Sonnet.

Pilot: milestones 1 and 3 are the pilot for the conversion path. Review both (guardian) before 4 to 12 scale out.

## Progress

- [x] Decision 0002, doc and rule rewrites, tasks added (this commit)
- [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7 · [ ] 8 · [ ] 9 · [ ] 10 · [ ] 11 · [ ] 12
- [x] 13 (P12-01: rule `core-is-shell-neutral` plus `pnpm typecheck:core` with `tsconfig.core.json`, both in `pnpm check`; window timers and the gateway's browser-storage defaults fixed, no open exceptions; `@types/node` supplies URL, AbortSignal, TextEncoder, crypto, console, and a React Native shell needs polyfills for URL and crypto.subtle) · [ ] 14
- [ ] 15 · [ ] 16 · [ ] 17 · [ ] 18 · [ ] 19

## Tripwire rules after P10-09 (specified, not implemented)

`tests/integration/tripwire.ts` keeps its three independent job signals (container ffmpeg processes, `/Sessions` `TranscodingInfo`, `TranscodeManager` log lines and `FFmpeg.*` files) and its liveness checks. What changes:

- **Playable samples** (h264, hevc-hdr10, av1, ass, sidecar-srt, multitrack, versions, show-s01e01, show-s01e02, show-s00e01), with the default (no limit) setting: the plan must be `DirectPlay`, every media request a `/Videos/{id}/stream` with exactly one `Static=true` or an external subtitle file, and no job signal may fire. This is today's rule, applied per sample instead of globally.
- **bluray-folder:** the plan must be `DirectStream` or `Transcode` (expected field `expectMethod`), never a `Static=true` request; every media request must be same-origin `master.m3u8`, `main.m3u8`, or `hls1/…` with no credential parameter (any case) and no `EnableTrickplay` other than `false`; the plan must carry a conversion reason; the job must be gone 10 s after the stopped report.
- **forced-limit run:** one playable sample (h264) replayed with `MaxStreamingBitrate` below its bitrate must come back `Transcode` with `ContainerBitrateExceedsLimit` (or `VideoBitrateNotSupported`), the same HLS request rules, and no job after stop.
- **no-conversion user:** a second fixture user with transcoding and remuxing disabled must get `conversion-not-allowed` for the BluRay folder, with no media request and no job.
- **Play method check:** for every conversion, `/Sessions` `PlayState.PlayMethod` and `TranscodingInfo.IsVideoDirect`/`IsAudioDirect` are recorded and must agree with the plan's method (DirectStream means both direct).
- `TRANSCODE_MARKERS` in `tripwire-rules.ts` stays for the playable samples and is replaced by the HLS request rules for conversion samples; the existing sabotage cases (missing `Static`, `static=false&Static=true`, 302 to `master.m3u8`) must still fail for playable samples.
- CI job `tripwire` stays; making it required is a CI change and needs the human (AGENTS.md "Pull requests").

## Refusal copy changes (P3-09 to P10-11)

| Reason today | After decision 0002 |
|---|---|
| `no-direct-play` | Becomes a fallback (DirectStream or Transcode). Remains only as `conversion-not-allowed` when the server offers no conversion. |
| `server-requires-transcoding` | Becomes a fallback. Removed. |
| `not-a-file` | Becomes a fallback when the server offers a conversion (the server fetches the remote source; Fluster never direct plays a non-File URL). Otherwise `conversion-not-allowed`. |
| `disc-source` | Becomes a fallback (the server never direct plays disc folders). |
| `iso-source` | Becomes a fallback once P10-02 shows the server converts the ISO sample; stays a refusal until then. |
| `live-source` | Stays a refusal until Live TV has a decision record. |
| `no-sources`, `missing-source-data` | Stay. |
| new `conversion-not-allowed` | "This file needs converting, and the server doesn't allow that for your account." Names the admin settings (allow video transcoding, audio transcoding, remuxing). |
| new `unsafe-transcoding-url` | "Jellyfin offered a stream address Fluster won't use." Retry and Back. |

Every refusal still offers Retry and Back. "Play original" is offered only when the user's own streaming limit is the only reason; it is never offered when the server says direct play is not allowed, because the anonymous static route (ARCHITECTURE.md §3) would let Fluster bypass an admin's limit.

## Acceptance changes (approved by the user on 2026-11-07)

The rules forbid editing existing tasks' acceptance or `depends_on` without approval. These conflicted with decision 0002. The user approved them as proposed on 2026-11-07, and they are applied in `tasks/prd.json`. P1-03 took the "never direct played" wording; P3-09 is unchanged.

| Task or phase | Field | Current | Proposed |
|---|---|---|---|
| P0-04 (done) | acceptance 2 | "It fails if any active encoding job appears during playback" | "It fails if any active encoding job appears while a sample that the server offers for direct play is playing" |
| P0-04 (done) | acceptance 3 | "It fails if any media request lacks Static=true" | "It fails if a direct-play sample makes any media request without Static=true, or a conversion sample makes any request that is not same-origin, credential-free HLS" |
| P1 phase | goal | "…and the server provably never transcodes." | "…and the server provably never converts a file Fluster can play as stored." |
| P1-03 (done) | acceptance 2 | "BluRay, Dvd, and Iso VideoType sources are refused" | "BluRay, Dvd, and Iso VideoType sources are never direct played" (or leave as history; P10-03 supersedes it) |
| P3-09 (done) | acceptance 3 | "No play-anyway option exists" | Keep. P10-11 replaces the copy; title could become "Explain playback refusals". |
| P4 phase | exit 2 | "Zero transcode jobs observed" | "Zero conversions of files Fluster could play as stored; every conversion showed its reason" |
| P4-01 | acceptance 2 | "Hankflix shows no transcode or remux jobs for the week" | "Hankflix shows no transcode or remux job for an item Fluster could direct play, and every conversion showed its reason" |
| P4-01 | depends_on | (12 tasks) | add `P10-12`, so the dogfood week covers fallback |
| P9-01 | depends_on | `["P2-02", "P4-02"]` | `["P2-02", "P12-02"]`, so the TV spike starts after the shell decision instead of after the dogfood week |
| P9-01 | acceptance 2 | "Android TV plays a sample with direct play" | "Android TV plays a sample with direct play and a converted sample over HLS with header authentication" |

No other open task conflicts: P1-08, P1-09 ("The server dashboard shows Direct Play" holds for direct-playable titles), and P8-03 ("Downloads use the original static file") stay valid.

## Open questions for the human

1. **PlayMethod for stream-copy HLS:** report `DirectStream` (accurate) or `Transcode` (what the server's own `StreamInfo` says, `MediaInfoHelper.cs` v10.11.7 line 312)? The plan assumes `DirectStream` and checks the dashboard in P10-12.
2. **Live TV:** write its decision record after P10 (parity) or after Music?
3. **Apple TV and iOS:** after Android TV and phones (proposed), or alongside?
4. **ISO:** if the server cannot convert the ISO sample, keep `iso-source` as a refusal, or add an mpv-side ISO spike?

Answered on 2026-11-07: E1 versus E1-B, E2, the remote default limit, and the phase order (see the decision log).

## Decision log

- 2026-11-07: Server conversion is allowed as a fallback, in the order direct play, direct stream, transcode, always shown with its reason (the user, decision 0002).
- 2026-11-07: Music joins the roadmap as M7; the Android TV/mobile shell moves earlier (spike after the fallback core). No Flutter (the user).
- 2026-11-07: No `TranscodingUrl` is used as given; Playback Negotiation rebuilds it, strips credentials, and sets `EnableTrickplay=false`. Header auth is enough for every HLS request (decision 0002 Q1).
- 2026-11-07: No new Tauri command for HLS; a typed `delivery` field on the load request selects it.
- 2026-11-07: The browser development engine does not play HLS and gets no hls.js dependency.
- 2026-11-07: Disc folders and ISOs never direct play, even if the server offers it; Fluster re-requests with `EnableDirectPlay: false`.
- 2026-11-07: E1 (trust server playlists with `access-references` on) rejected; E1-B adopted: Rust fetches and validates every HLS playlist (master and variant) before mpv reads it; every variant, segment, media, key, and map URI must resolve same-origin and credential-free, or the playlist is rejected. Approved by the user on 2026-11-07.
- 2026-11-07: E2 accepted with a canary test (P10-04: a token in a playlist body never reaches logs, errors, or the UI). Defence in depth: Rust rejects a playlist body containing `ApiKey`, `api_key`, `access_token`, `Token`, or `X-Emby-Token` parameters and fails closed. Approved by the user on 2026-11-07.
- 2026-11-07: Streaming limit defaults are no limit for both local and remote; the server's own remote limit still applies. Approved by the user on 2026-11-07.
- 2026-11-07: Phase order P10 and P12 before the P4 dogfood week, P11 after it, P12 in parallel with P10. Approved by the user on 2026-11-07.
- 2026-11-07: P0-04 acceptance 2 and 3 reworded for decision 0002. Approved by the user on 2026-11-07.
- 2026-11-07: P1 phase goal reworded to "never converts a file Fluster can play as stored". Approved by the user on 2026-11-07.
- 2026-11-07: P1-03 acceptance 2 reworded to "never direct played". Approved by the user on 2026-11-07.
- 2026-11-07: P4 exit 2 reworded to cover only files Fluster could play as stored. Approved by the user on 2026-11-07.
- 2026-11-07: P4-01 acceptance 2 reworded and `P10-12` added to its `depends_on`. Approved by the user on 2026-11-07.
- 2026-11-07: P9-01 `depends_on` changed to `["P2-02", "P12-02"]` and acceptance 2 extended to a converted sample over HLS with header authentication. Approved by the user on 2026-11-07.
- 2026-11-07: New phases are P10 (parity), P11 (music), P12 (early shell). In `tasks/prd.json` they sit after P3, before P4 (P10, P12) and after P4 (P11), so the "first todo task" rule picks them in the intended order. Phase ids are names, not order.

## Risks

| Risk | Mitigation |
|---|---|
| HLS needs `access-references` on, which widens what the mpv handle opens | Only typed HLS sessions; E1-B: mpv reads only playlists Rust validated (same-origin, credential-free, fail closed on credential names); redirect and cross-origin loopback tests |
| The Rust playlist validator misses a URI form (a new tag, an unusual attribute) | Validate every `URI=` attribute and URI line generically, not by tag allowlist; reject unparsable playlists; fixture playlists from both servers in tests |
| The loopback playlist server is reachable by other local processes | Bind `127.0.0.1` only, random per-session path, serve only validated playlists (no token), close with the session |
| `max_redirects=0` or the header does not reach nested opens in some FFmpeg build | P10-01 loopback tests on the bundled FFmpeg; the AppImage FFmpeg must pass them (release gate) |
| DirectStream vs Transcode classified wrongly from the URL | Tripwire compares with `/Sessions` `TranscodingInfo`; the indicator falls back to "Converting on server" when unsure |
| A conversion keeps running after the user leaves | Stopped report kills jobs; `DELETE /Videos/ActiveEncodings` on new sessions and failed stops; tripwire checks no job after 10 s |
| A codec condition sneaks into the profile and transcodes playable files | Profile test fails on any `CodecProfiles` or `ContainerProfiles` entry; tripwire playable-sample rule |
| Audio or subtitle change while converting needs a new stream | P10-08 renegotiates at the current position; direct play keeps local switching |
| Music queue needs new Tauri commands (I3) | P11-01 decides them with `docs/security.md` and allowlist updates |
| Scope growth slows the desktop daily driver | P10 first; P11 after P4; P12 is two small tasks until P9-01 |

## Untested gates

- Wayland and GPU: HLS fMP4 HEVC/AV1 stream copy with hardware decode on the RTX 4070 Ti (NVDEC) and Radeon 610M (VA-API) is untested.
- Jellyfin: 10.11.7 and 12.4.0 fixtures only; Hankflix 12.4.0 is checked by P10-12. Admin policies other than "transcoding disabled" and remote bitrate limits are untested. Hardware-accelerated server transcoding is untested.
- AppImage: the bundled FFmpeg must pass the HLS header and redirect tests; not yet run.
- macOS: HLS through the macOS libmpv build is untested.
- Android TV: everything in P12 and P9-01.

## Docs that follow the code

These describe the current code and change with the milestone that changes it: `docs/architecture.md` (line 5, negotiation summary) with P10-03; `docs/validation.md` (gates 1 and 2) and `tests/samples/README.md` (line 40) with P10-09; `docs/security.md` planned HLS section with P10-04; `src/features/player/refusal-copy.ts` comments with P10-11.

## Proposed GitHub description

"Native Jellyfin client for Linux and macOS. Plays your original files with embedded mpv, falls back to server conversion only when it must, and always shows it. Tauri + React + Rust, no Flutter." (Not applied; run `gh repo edit --description` after approval.)

## Surprises & discoveries

- `master.m3u8` defaults `enableTrickplay` to `true`, and the server then writes `ApiKey={token}` into the playlist body, whatever the request used for auth (`DynamicHlsController.cs` v10.11.7 line 464; `DynamicHlsHelper.cs` line 652).
- The server disables progressive direct stream for streaming ("direct-stream http streaming is currently broken", `MediaInfoHelper.cs` v10.11.7 lines 249-253), so "remux" always arrives as HLS with stream copy.
- `TranscodeReasons` reaches the client only inside `TranscodingUrl`; the `MediaSourceInfo` property is `[JsonIgnore]`.
- The 12.4 stable OpenAPI (`https://repo.jellyfin.org/files/openapi/jellyfin-openapi-stable.json`, version 12.4.0) lists no `master.m3u8`, `main.m3u8`, segment, or `ActiveEncodings` paths, and SDK 1.0.2 has no client for them, so the gateway calls them with the raw Axios client like the other narrow calls.

## Validation evidence

## Outcome & retrospective
