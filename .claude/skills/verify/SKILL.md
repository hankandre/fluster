---
name: verify
description: Run Octave's checks and record evidence before asking for review. Use after finishing a milestone or before opening a PR.
---

# Verify

## Always

- Run `mise exec -- pnpm check`.
- Read every failure in full before fixing it.
- Fix failures at the cause, never in the test.

## When playback negotiation or reporting changed

- Run the gateway tests.
- Confirm the tests assert both the request body and the query string.
- Run `pnpm test:tripwire` against the pinned servers.

## When Kotlin or a native module changed (from T3-01)

- Run `pnpm tv:native:test`.

## When the app changed (from T3-02)

- Run `pnpm tv:e2e` on the emulator.
- For visible changes run `pnpm tv:visual` (T3-07) and attach the changed images.

## When the app sends a request (from T3-05)

- Run the task's wire test with `pnpm tv:wire` against the pinned Jellyscale.
- A playback task passes only when its wire test passes.

## Evidence

- Record each command and a short result in the plan or PR.
- Quote failures verbatim.
- Never claim a pass without output.
- Never treat emulator success as evidence for the Shield, or Jellyfin success as evidence for Jellyscale.
- List every device, Android version, Jellyfin version, and Jellyscale gate you did not run.
