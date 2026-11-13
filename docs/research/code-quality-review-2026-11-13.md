# Fluster code quality review

Reviewed: `/home/handre/Code/fluster-quality-review` at `fb8d071` (286 commits, 2026-08-21 to 2026-11-13).
Method: read-only reading and grep. Paths below are relative to that root.

**Nothing was executed.** The checkout has no `node_modules` and no `src-tauri/target`, so I ran no tests, type-check, clippy or build. Every statement about what a check would report is unverified. Findings come from reading the code.

Coverage: I read in full `src/lib/jellyfin/gateway.ts`, `src/lib/player/coordinator.ts`, `src/features/player/use-playback-session.ts`, `src/features/player/index.tsx`, `src/app/App.tsx`, `src/app/compose.ts`, `src/lib/player/native-player.ts`, `src/lib/redact.ts`, `src/lib/transport-error.ts`, `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, and the config and CI files. I read parts of `src/app/session.tsx`, `src/components/PlayerView.tsx`, `src-tauri/src/player/controller.rs` and `src-tauri/src/model.rs`. I did not read the catalog views, the shared UI primitives, the HLS validator, the surface code, the e2e specs or the CSS beyond greps.

## Overall assessment

This is a disciplined codebase with a few structural debts concentrated in the player path.

- **Size:** about 430 TypeScript files (157 unit test files) and 72 Rust files (about 14k lines).
- **Strong:** the security-critical rules are mostly enforced by tests and tooling, not convention. The Rust side is small-filed, lint-gated and well tested.
- **Weak:** one hard rule is broken in the player (the token-bearing plan sits in React state), the playback orchestration is spread over two hand-rolled state machines, and several guards that exist locally are not run in CI.

## Most significant problems

### 1. The signed-in Authorization header is stored in React state (hard-rule violation)

- `src/lib/jellyfin/gateway.ts:764` puts `authorization: this.authorizationHeader()` on every `PlaybackPlan`.
- `src/features/player/use-playback-session.ts:153` holds that plan in `useState<PlaybackPlan>()`, sets it at lines 216, 243 and 288, and returns it at line 421.
- `src/features/player/index.tsx:178,183` passes `playback.plan` on to `conversionIndicator` and `useMediaSegments`.
- This contradicts `AGENTS.md` ("Never store tokens in WebView storage, Query caches, or React state") and `DOMAINS.md:61` ("The token is held only by the gateway").
- `docs/security.md:9` documents that the plan carries the header to the native engine, but not that the plan lives in component state.
- The browser engine and the e2e engine also receive the full plan, although `docs/security.md:30` says the browser player "never receives the header". Unverified whether either reads the field.
- The split already exists at the boundary: `src/lib/player/native-player.ts:41` separates `authorization` from the plan before `invoke`. The fix is to do that split earlier, so the UI only ever sees a token-free plan.

### 2. Native failures reach the UI as strings, and the session path drops them

- Every Tauri command returns `Result<_, String>` (`src-tauri/src/commands.rs:10-135`), so `invoke` rejects with a plain string. `native-player.ts:45` relies on this (`typeof error === "string"`).
- `src/lib/redact.ts:44` returns non-objects unchanged, so `coordinator.ts:255` (`throw redactError(error)`) does not redact a string error on the TypeScript side. Rust's `safe_error` is the only redaction on that path.
- `use-playback-session.ts:91-93` maps any non-`Error` value to "Something went wrong.", so a native launch failure (`AlreadyPlaying`, a renderer error, an invalid plan) loses its reason.
- `src/components/PlayerView.tsx:127` handles the same case differently (`String(operationError)`), so the two paths disagree.
- The tests do not model this: `src/features/player/player-view.test.tsx:189,207,213` reject with `new Error(...)`, never a string.
- The refusal contract is a string prefix shared by hand between `src-tauri/src/player/mod.rs:38` and `native-player.ts:16`. Rust tests pin the prefix (`media_tests.rs:183`); nothing ties the TypeScript constant to it.
- Unverified: whether Rust also emits a `player-event` error for launch failures that would restore the message.

### 3. Playback orchestration is two interleaved hand-rolled state machines

- `src/lib/player/coordinator.ts` (476 lines) tracks one session with about 13 mutable fields at lines 59-81, including `attempt`, `operation`, `attemptController`, `attemptTask`, `cancelStop`, `finishTask`, `requestedStopReason`, `eventQueue` and `confirmController`.
- `src/features/player/use-playback-session.ts` (434 lines) adds a second layer: an `ActiveSession` with `started`, `stopping`, `ending`, `stop` and `destination` flags (lines 95-112), a module-level `WeakMap` of pending stops (line 30), five refs and six `useState` values.
- Correctness depends on comments describing orderings, for example `coordinator.ts:74-76` and `use-playback-session.ts:25-29,176-178`.
- `src/features/player/index.tsx:170-174` reads `upNext` and `leaveTarget` before they are declared (lines 182, 185) and explains it in a comment. `AGENTS.md` says not to justify workarounds in comments.
- Test coverage is heavy (`coordinator.test.ts` 699 lines, `coordinator-renegotiate.test.ts`, `track-renegotiation.test.tsx` 608 lines), which lowers the risk today. The cost is that each new feature (renegotiation, Play original, limit changes, auto-play next) has added another flag.
- An explicit state type with a reducer for the session lifecycle would replace most of the flags. The repo already uses that pattern in `src/lib/player/session-state.ts`.

### 4. Guards that exist locally are not run in CI, and there is no TypeScript linter

- `pnpm check` (`package.json`) runs `typecheck:core`, `typecheck:integration` and `test:no-test-engine`. `.github/workflows/ci.yml` runs none of them (frontend job, lines 54-61). `test:no-test-engine` runs only in `release-appimage.yml:42`.
- `.dependency-cruiser.cjs` says DOM globals in the shell-neutral core "are caught by `pnpm typecheck:core`". With that script absent from CI, the rule is enforced only when someone runs `pnpm check`.
- There is no ESLint, Biome or Prettier config, yet two `eslint-disable-next-line react-hooks/exhaustive-deps` comments exist (`src/features/player/chrome/player-sheet.tsx:37`, `src/features/shared/ambient-backdrop.tsx:61`). Hook dependency arrays, which the player code leans on heavily, are checked by nobody.
- `tsconfig.app.json` has `strict` but not `noUnusedLocals` or `noUnusedParameters`; `tsconfig.integration.json` has both.
- Every CI job runs on `ubuntu-22.04`. `src-tauri/src/surface/macos.rs` (331 lines, `#![allow(deprecated)]`, about eight `unsafe` blocks) is never compiled or linted in CI, while `Cargo.toml` describes the app as "for Linux and macOS".

### 5. `gateway.ts` is 955 lines and carries dead and inconsistent code

- `AGENTS.md` says to split files past about 400 lines. `src/lib/jellyfin/gateway.ts` is 955 and mixes sign-in, Quick Connect, catalog, user data, playback negotiation and playstate reporting.
- `latest()` (lines 398-430) has no production caller; only tests call it (`gateway.test.ts:141`, `redact-canary.test.ts:141`, `error-strip.test.tsx:118,161`). It also uses PascalCase query parameters where the rest of the file uses camelCase.
- `get`, `post` and `delete` (lines 899-930) are three copies of the same wrapper.
- Line 823 builds `/Items/${itemId}/PlaybackInfo` without `encodeURIComponent`; every other path in the file encodes the id (lines 564, 593, 639, 666, 685, 708).
- `mediaSegments` (line 706) is the only authenticated call that skips `requireSession()`.
- The client version is hard-coded as `"0.1.0"` at line 63 although `__APP_VERSION__` exists (`vite.config.ts`), and `DEVICE_NAME` is `"Fluster Linux"` (line 54) on every platform.

### 6. Leftover structure from the migration to `src/features/`

- `src/components/PlayerView.tsx` imports about 20 modules from `src/features/player/chrome/` (lines 8-31), and `src/features/player/` imports back from `src/components/` (`index.tsx:6`, `chrome/use-player-keys.ts:2`, `chrome/transport-controls.tsx:4`, `chrome/scrubber.tsx:3`). There is no file-level cycle, but the two directories are one module split in two.
- Routing is string matching on a `#/next` prefix that appears in 51 non-test lines. `SIGN_IN_ROUTE` is declared separately in six files, and the same "no gateway, go to sign-in" effect is copied into six views (for example `home-view.tsx:28`, `search-view.tsx:18`, `series-view.tsx:21`, `library-page.tsx:12`, `item-detail-view.tsx:19`, `player/index.tsx:49`).
- Placeholder routes still ship: `#/next/detail` and `#/next/player` render stub pages (`src/features/detail/index.tsx:3`, `src/features/player/index.tsx:33`).
- `src/app/compose.ts:15` imports the e2e engine from `src/test/` into the composition root. The build guard covers it, but see problem 4 for where that guard runs.

### Smaller points

- `select_track` takes `track_type: String` and matches on it (`commands.rs:76-84`, `controller.rs:292-300`); an enum would fit the "typed and narrow" rule better.
- Mutex access uses `.expect("... mutex poisoned")` throughout `controller.rs` (about 20 sites), so one panic while a lock is held makes every later command panic.
- `ensure_numeric_locale` documents an accepted data race in its `SAFETY` comment (`src-tauri/src/player/version.rs:25-32`).

## What is done well

- **Invariants are tested, not just written down.** `src-tauri/src/command_allowlist.rs` fails if a `#[tauri::command]` is unregistered or vice versa; `logger_guard.rs` fails if a logger crate enters `Cargo.lock`; redaction has canary tests on both sides (`src/lib/redact-canary.test.ts`, `src-tauri/src/trace_canary/`).
- **Shared test vectors keep TypeScript and Rust in step.** `tests/fixtures/hls-master-urls.json` and `tests/fixtures/host-classes.json` are consumed by both (`src-tauri/src/url_policy.rs:99`, `src-tauri/src/player/hls/master_url_tests.rs:11`).
- **Import boundaries are machine-checked.** `.dependency-cruiser.cjs` encodes the `DOMAINS.md` rules, including type-only imports and a no-circular rule.
- **Rust hygiene.** `Cargo.toml` denies `unwrap_used`, `undocumented_unsafe_blocks` and `debug_assert_with_mut_call`; every `unsafe` block I sampled has a specific `SAFETY:` comment; non-test Rust files stay under about 410 lines; the commands are thin (`commands.rs` is 135 lines) and typed.
- **Transport handling in the gateway.** Redirects are refused on every response and error (`gateway.ts:132-149`), Axios errors are stripped of config and headers before leaving the gateway (`transport-error.ts:36-54`), and requests carry explicit timeouts and abort signals.
- **Token and style rules mostly hold.** A grep finds `localStorage` only for the install id, LAN confirmations and streaming limits; no native `select`, radio or checkbox in features; no skipped or focused tests; only two `console` calls, both with fixed or redacted text.
- **CI supply chain.** Actions are pinned by commit SHA, with dependency review, `cargo audit`, `pnpm audit`, a visual-regression job and a live-server tripwire job.
- **Comments cite sources.** Server behaviour is referenced by file and line (for example `gateway.ts:843-848`, `coordinator.ts:394-399`), which makes the non-obvious decisions checkable.

## Where I would focus first

1. **Take the header out of the UI-visible plan** (problem 1). It is the one place the code breaks its own hard rule, and the fix is contained: the gateway hands the header to the engine path, and the hook stores a token-free plan.
2. **Close the CI gaps** (problem 4). Add `typecheck:core`, `typecheck:integration` and `test:no-test-engine` to the frontend job, add a hooks lint, and at least `cargo check` the macOS target. This is cheap and protects everything else.
3. **Give native errors a typed shape** (problem 2). Return a serialized error enum from the commands, handle string rejections in one place, and add a test that rejects with what Tauri really sends.
4. **Split `gateway.ts` along its domains and delete `latest()`** (problem 5), fixing the unencoded path and the missing session check on the way.
5. **Fold `src/components/` into `src/features/player/` and centralise routes and the sign-in guard** (problem 6).
6. **Then simplify the session lifecycle** (problem 3). It is the largest piece of work and the best tested, so it can wait until the cheaper items are done.
