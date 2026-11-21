# 001: T2-07 review follow-ups

## Goal / Done when

Record the low findings of the T2-07 fresh-context review so the owner and later tasks see them (T2-07).

- [x] Medium findings fixed: profile rule pinned in `packages/core/src/domain/player-engine.ts` and T8-07 backlog entry; `device-conversion-client-reason.test.ts` added
- [x] Lows below logged as follow-ups (not fixed in T2-07; the PR calls them out)
- [x] T2-07 set to done; the Jellyscale wire test is an untested gate the PR must list

## Context and domains touched

Playback Negotiation; ARCHITECTURE.md §3 and invariant I1; decision 0002.

## Milestones

1. **Review fixes.** Validation: `pnpm check`. Model: sonnet.

## Progress

- [x] 1

## Decision log

- 2026-11-21: Match decoder profiles exactly and pin that in the port's comment, instead of by hierarchy — the frozen `device-capabilities.test.ts:55` expects "Main" to be refused by a "High" decoder, and a frozen test cannot change.
- 2026-11-21: Set T2-07 to done without a Jellyscale wire test. The approved spec defers it (docs/specs/T2-07.md:9, :256, :316): the task sends nothing from a device, the wire test is T8-07's item run by `pnpm tv:wire` (T3-05, not built), and the PR lists it as an untested gate. The verify skill scopes the wire test "from T3-05", and T2-05 was recorded done the same way. The owner can veto in the PR.

## Surprises & discoveries

Follow-ups (low, not fixed in T2-07):

- ARCHITECTURE.md:141-150: the §3 request sketch still shows only EnableDirectPlay:true and AllowVideoStreamCopy:true, with no forced-conversion step or device-cannot-play in its decide block. Update the sketch.
- tests/integration/record-jellyscale-fixtures.ts:218-221: the Jellyscale recorder's forced request differs from the gateway's: MediaSourceId also in the query, no AlwaysBurnInSubtitleWhenTranscoding, MaxStreamingBitrate from OCTAVE_PROFILE not the viewer's limit. The T8-07 wire test is the real guard.
- docs/specs/T2-07.tests.json:21-22: spec and frozen artifacts drifted. (a) The manifest lists both recorders but the spec (T2-07.md:157) says they stay out; commits 8daa264b and 2110f86d reverted that ruling. (b) The spec's test plan (line 235) says a failed probe converts the h264 sample; commit 4fc62d06 replaced it with multitrack, so "a failed probe converts a single-track source on Jellyfin" rests on inference. Call both out in the PR.
- packages/core/src/jellyfin/gateway.ts:788-840: with an audio pick one negotiation can send three PlaybackInfo requests (pick, plain, forced; device-conversion-negotiation.test.ts:173-197). Acceptance item 3 says "never a third request"; the spec reads it as "the forced request is sent once". The PR must ask the owner for a ruling (spec issue 5).
- tasks/backlog.jsonl:131: the first new entry says "Do not read HDR in the direct-play decision", the opposite of the work (read the hdr list so Dolby Vision profile 5 is not direct-played on a display without it). Reword when triaged.
- AGENTS.md:90: a playback task passes only when its wire test passes against Jellyscale. `pnpm tv:wire` (T3-05) and T8-07's wire test do not exist yet. Untested gate: the Jellyscale wire test. The spec defers it to T8-07 (see the decision log); the PR must list it as an untested gate.
- packages/core/src/player/fake-player-engine.ts:16-17 (frozen by T2-05): `fakeCapabilities()` lists one profile per codec (h264 "High", hevc "Main 10"), which does not follow the rule now pinned on `VideoDecoder.profile` (one entry per supported profile). T8-07 should fix the fake when it builds the probe.

## Validation evidence

At commit 6fc83c99, 2026-11-21:

- `mise exec -- pnpm check`: exit 0. Core `Test Files 96 passed (96)`, `Tests 2570 passed (2570)`; workflow `Test Files 23 passed (23)`, `Tests 335 passed (335)`.
- `pnpm --filter @octave/core exec vitest run src/jellyfin/device-conversion-client-reason.test.ts`: `Tests 4 passed (4)`.
- `node scripts/check-red.mjs T2-07 --expect green`: items 1-8 green, `"problems":[]`; item 9 is the review gate, met by the review (decision 0002's table and the I1 row are amended).
- `pnpm test:tripwire` after `pnpm fixture:up && pnpm fixture:setup` (the earlier "fetch failed" runs had no fixture containers): exit 0, "Tripwire passed", Jellyfin 10.11.7 and 12.4.0, 14 samples each; log release-evidence/tripwire/2026-11-21T14-33-49-790Z.json. Opt-in samples dvdsub and iso skipped.
- Not run: the Jellyscale wire test (`pnpm tv:wire`, not built), the tripwire per capability set (T2-09), `tv:e2e`, `tv:native:test`, `tv:visual`. No device or Android version tested. The tripwire does not play against Jellyscale.

## Outcome & retrospective

Open.
