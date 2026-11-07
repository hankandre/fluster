# 001: Jellyfin API correctness and 12.x compatibility

## Goal / Done when

Fluster plays correctly against Jellyfin 10.11.x **and** 12.x with default server settings, and the server provably starts no FFmpeg job.

Done when:

- [ ] Playback of each `docs/validation.md` sample succeeds on pinned 10.11 and 12.x fixtures with legacy authorization **off**
- [ ] No request URL from Fluster contains a token (`api_key`, `ApiKey`, `Token`)
- [ ] External subtitles load from `DeliveryUrl`
- [ ] Audio/subtitle selection maps correctly for an item with one external subtitle plus embedded tracks
- [ ] A BluRay-folder source is refused with a typed reason before any stream request
- [ ] Server tripwire: no active encoding job during any fixture playback
- [ ] `pnpm check`, `pnpm test:e2e`, clippy are green

## Context and domains touched

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

- [ ] 1 · [ ] 2 · [ ] 3 · [ ] 4 · [ ] 5 · [ ] 6 · [ ] 7 · [ ] 8

## Decision log

- 2026-11-07: Support 10.11 and 12.x. Header auth via a fixed mpv header field is acceptable under the "no generic mpv bridge" rule, because it is a single typed value set by Rust at load time.

## Surprises & discoveries

- Jellyfin applies direct-play policy only when a DeviceProfile is sent.
- Disc-folder sources with `Static=true` start ffmpeg on the server.

## Validation evidence

_(fill in as milestones land)_

## Outcome & retrospective

_(fill in on completion)_
