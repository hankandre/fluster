# Code quality review: triage

Status: **answered 2026-11-13.** The owner answered all six decisions as recommended; see "Answers" below. The rest of the document is kept as proposed, so its recommendations read as they did when asked.

## Answers (owner, 2026-11-13)

Relayed by the coordinating agent, which reports that the owner answered directly. Every answer is the recommended option in §5.

| # | Answer | Applied in |
|---|---|---|
| D1 | A: run `typecheck:core`, `typecheck:integration`, and `test:no-test-engine` in CI. | **P0-15**, added |
| D2 | A: ESLint with only the React hooks rules, no formatter. | **P0-16**, added |
| D3 | A: turn on `noUnusedLocals` and `noUnusedParameters` for the app. | **P0-16** |
| D4 | B: a macOS `cargo check` and clippy job on `main` and on pull requests that change `src-tauri/`, not required until P6-01. | **P0-17**, added |
| D5 | A: the dogfood week waits for P3-31. | **Not applied here.** The coordinating agent appends `"P3-31"` to P4-01's `depends_on`; this pass may not edit an existing task. |
| D6 | A: the lint fails on zero modules, and dependency-cruiser gets its own TypeScript 6. Putting the app back on TypeScript 6 is the fallback. | **P0-14**, added |

### Tasks added after the answers

In `tasks/prd.json`, which is the source of truth for acceptance. They sit in P0, "Dogfood foundation", whose goal is that the core invariants are checked by machines.

| Id | Title | Place | Waits for | Priority | Size | Model |
|---|---|---|---|---|---|---|
| P0-14 | Make the import-boundary lint read the code again | P0, after P0-13 | nothing | **Top: runs next**, before the remaining P13 tasks | S to M | Sonnet |
| P0-15 | Run every `pnpm check` guard in CI | P0, after P0-14 | P0-14 | High | S | Sonnet |
| P0-16 | Lint hook dependencies and unused code | P0, after P0-15 | P0-14, P13-34, P13-22, P13-24, P13-23 | Medium | S to M | Sonnet |
| P0-17 | Compile and lint the macOS surface in CI | P0, after P0-16 | P0-13, P13-23 | Medium | S, or unknown if `macos.rs` does not compile | Opus (`native-engineer`) |

- **P0-14 is first.** Invariant I8 has had no working check since 2026-11-12. The task has no dependencies, and it is the first eligible `todo` task in the file, so the rule "pick the first task whose status is todo" selects it.
- **P0-15 waits for P0-14** so the top priority is unambiguous, and so the guard it adds to CI is one that can fail.
- **P0-16 waits for the four P13 player tasks**, because fixing hook dependencies edits the player's hooks. It waits for P0-14 so its new dependencies do not land under a lint that reads nothing.
- **P0-17 waits for P0-13 and P13-23**, because it may have to change `macos.rs` and native work stays serial. P2-11 and P2-12 list the macOS surface as an untested gate; once P0-17 passes, their changes to it are at least compiled.
- **P2-08 and P2-09 rely on the lint.** Their `depends_on` is not edited. P0-14 sits ahead of them in the file with no dependencies, so it is picked first.
- Each of the four changes CI or what it runs, and each task's acceptance says its pull request calls that out.

This is a Fable 5.2 product-review pass under the `AGENTS.md` "Tasks" rule. It triages an independent code-quality review into `tasks/prd.json` and `tasks/backlog.md`.

- The review, verbatim: [`docs/research/code-quality-review-2026-11-13.md`](../../research/code-quality-review-2026-11-13.md). It covers commit `fb8d071` and was written by reading the code; it ran nothing.
- `origin/main` was at `fb8d071` when this triage ran, so every check below is against the code the reviewer read. No finding is already fixed.
- The findings are passed on as the reviewer wrote them. Where the code differs from a detail, the difference is stated beside it and the finding stays.
- The checks here are `grep` and reads of the cited lines. This pass also ran no test against the findings. The codebase-memory index was not available ("project not found or not indexed").

## 1. Summary

| # | Finding | Verdict | Where it goes |
|---|---|---|---|
| 1 | The Authorization header is stored in React state | Confirmed | **In progress** on `fix/plan-without-token`. No task. |
| 2 | Native failures reach the UI as strings, and the session path drops them | Confirmed; one detail partly | **P3-31**, **P2-11** |
| 3 | Playback orchestration is two interleaved hand-rolled state machines | Confirmed | **P2-13** |
| 4 | Guards that exist locally are not run in CI; no TypeScript linter | Confirmed | Owner decisions **D1 to D4**; backlog |
| 5 | `gateway.ts` is 955 lines and carries dead and inconsistent code | Confirmed | **P2-07**, **P2-08** |
| 6 | Leftover structure from the migration to `src/features/` | Confirmed | **P2-09**, **P2-10**; backlog |
| – | `select_track` takes a string | Confirmed | **P2-12** |
| – | `.expect("… mutex poisoned")` throughout `controller.rs` | Confirmed | **P2-12** |
| – | `ensure_numeric_locale` accepts a data race | Confirmed | Backlog |
| – | "Import boundaries are machine-checked" (listed under what is done well) | **Wrong today**: the lint checks no file | Owner decision **D6**; backlog |

No problem the reviewer raised is wrong. One thing the reviewer praised does not hold: the import-boundary lint passes without reading any file (§2, "A check that passes without checking"). This pass found it by running `pnpm check`. Two questions the reviewer left unverified are answered in §2 (problems 1 and 2).

## 2. Findings and evidence

Paths are relative to the repository root at `fb8d071`.

### Problem 1: the Authorization header in React state. Confirmed; in progress

- `src/lib/jellyfin/gateway.ts:764` sets `authorization: this.authorizationHeader()` on the plan.
- `src/features/player/use-playback-session.ts:153` holds the plan in `useState<PlaybackPlan>()`.
- The reviewer left unverified whether the browser and e2e engines read the field. Neither does: `grep -n authorization src/lib/player/browser-player.ts src/test/e2e-hls-engine.ts` finds only an error text at `browser-player.ts:24`. They are still handed it.
- The fix is being built on `fix/plan-without-token`. This pass adds no task. One backlog entry asks that `docs/security.md` lines 9 and 30 be checked when it lands.

### Problem 2: native failures as strings. Confirmed

- Every command that can fail returns `Result<_, String>`: `src-tauri/src/commands.rs:13,25,38,45,55,62,69,80,91,98,112,130`. `realtime_disconnect` (line 122) returns nothing.
- `src/lib/player/native-player.ts:45` tests `typeof error === "string"`.
- `src/lib/redact.ts:44` returns a non-object unchanged, so `src/lib/player/coordinator.ts:255` (`throw redactError(error)`) passes a string through unredacted on the TypeScript side.
- `src/features/player/use-playback-session.ts:91-93` turns any non-`Error` into "Something went wrong."
- `src/components/PlayerView.tsx:127` uses `String(operationError)` for the same case. A third reading exists: `src/features/player/player-status.ts:24` accepts a string for a failed `initialize`.
- The prefix contract: `src-tauri/src/player/mod.rs:38` and `src/lib/player/native-player.ts:16`. `src-tauri/src/player/media_tests.rs:183` pins the Rust side; nothing reads the TypeScript constant against it.
- **Partly confirmed detail.** "The tests do not model this" holds for the lines the reviewer cites (`src/features/player/player-view.test.tsx:189,207,213` reject with `new Error`), which is the launch path. Other tests do reject with strings: `player-view.test.tsx:720` and `src/features/detail/item-detail-view.test.tsx:541` for `initialize`, and `src/lib/player/native-player.test.ts:62,70` for `invoke`. The gap is the launch failure through the session hook.
- **Answer to the reviewer's unverified question.** Rust emits no player event for a launch that returns an error. The only `emit` in `src-tauri/src/player/controller.rs` is at line 233, for a panic in the event thread; the early returns (`controller.rs:165,185,199`) emit nothing. So nothing restores the message.

### Problem 3: two hand-rolled state machines. Confirmed

- `src/lib/player/coordinator.ts` is 476 lines. Lines 59-81 declare 16 mutable fields; the reviewer wrote "about 13".
- `src/features/player/use-playback-session.ts` is 434 lines: `ActiveSession` at lines 95-112, the module-level `WeakMap` at line 30, six `useState` values (lines 150-158), and six refs (lines 154, 155, 159, 161, 162, 303); the reviewer counted five.
- `src/features/player/index.tsx:170-174` reads `upNext` (declared at line 185) and `leaveTarget` (line 182), and the comment at lines 166-169 explains it.
- The reducer pattern the reviewer points to is `src/lib/player/session-state.ts` (56 lines).
- Test sizes match: `coordinator.test.ts` 699 lines, `track-renegotiation.test.tsx` 608.

### Problem 4: guards not run in CI. Confirmed

- `package.json:27`: `pnpm check` runs `test:no-test-engine`, `typecheck:integration`, and `typecheck:core`.
- `.github/workflows/ci.yml:54-61`, the frontend job, runs install, audit, Playwright install, `lint:boundaries`, `test:dogfood-redaction`, `test`, `build`, and `test:e2e`. A search of `.github/workflows/` for `typecheck` and `no-test-engine` finds one line: `release-appimage.yml:42`.
- `.dependency-cruiser.cjs:23` says DOM globals "are caught by `pnpm typecheck:core`".
- No ESLint, Biome, Prettier, or oxlint config or dependency exists. The two disable comments are at `src/features/player/chrome/player-sheet.tsx:37` and `src/features/shared/ambient-backdrop.tsx:61`.
- `tsconfig.app.json:10` has `strict` only; `tsconfig.integration.json:7-8` has `noUnusedLocals` and `noUnusedParameters`.
- Every `runs-on` in `.github/workflows/` is `ubuntu-22.04`. `src-tauri/src/surface/macos.rs` is 331 lines with `#![allow(deprecated)]` at line 1. `src-tauri/Cargo.toml:4` says "for Linux and macOS".
- All of this is the owner's decision: D1 to D4.

### Problem 5: `gateway.ts`. Confirmed

- 955 lines (`wc -l`).
- `latest()` is at lines 398-430 with PascalCase parameters. No production caller: the only uses are in `gateway.test.ts:141,623,657,803`, `redact-canary.test.ts:141`, and `error-strip.test.tsx:118,161`. That is three more test uses than the reviewer listed.
- `get`, `post`, and `delete` at lines 899-930 are the same wrapper three times.
- Line 823 builds `/Items/${itemId}/PlaybackInfo` with no encoding. Every other path encodes (lines 564, 593, 615, 639, 666, 685, 694, 708).
- `mediaSegments` (lines 706-712) does not call `requireSession()`. Every other authenticated call does.
- Line 63 hard-codes `version: "0.1.0"`. `package.json:4` is `0.1.0` today, so the value is right until the first version bump. Line 54 is `DEVICE_NAME = "Fluster Linux"`.

### Problem 6: leftover structure. Confirmed

- `src/components/` holds `PlayerView.tsx`, `NativeVideoSurface.tsx`, `player-keymap.ts`, and their tests. `PlayerView.tsx` has 24 import lines from `src/features/`. The imports back are at `src/features/player/index.tsx:6`, `chrome/use-player-keys.ts:2`, `chrome/transport-controls.tsx:4`, and `chrome/scrubber.tsx:3`.
- `#/next` appears in 52 non-test lines under `src/` (the reviewer counted 51), 21 of them in `src/app/App.tsx`.
- `SIGN_IN_ROUTE` is declared in six files, and the redirect is copied six times: `library-page.tsx:12`, `series-view.tsx:21`, `item-detail-view.tsx:19`, `home-view.tsx:28`, `player/index.tsx:49`, `search-view.tsx:18`.
- The placeholder pages: `src/app/App.tsx:121,125`, `src/features/detail/index.tsx:3`, `src/features/player/index.tsx:33`.
- `src/app/compose.ts:15` imports `E2eHlsEngine` from `src/test/`; line 44 uses it behind a build-time flag.

### Smaller points. Confirmed

- `select_track`: `src-tauri/src/commands.rs:78` takes `track_type: String`; `src-tauri/src/player/controller.rs:292-301` matches on it.
- Poisoned locks: `controller.rs` has 18 `poisoned` sites (the reviewer wrote "about 20"). Across `src-tauri/src` there are 30, under three policies: panic (`controller.rs`, `player/pending.rs`, `media_controls.rs:329`, `surface/linux.rs:176,182`, `surface/macos.rs:62,67`), recover the guard (`realtime.rs:375,386`), and return an error (`surface/linux.rs:225`, `surface/macos.rs:150`).
- `ensure_numeric_locale`: `src-tauri/src/player/version.rs:25-32`, as described.

### A check that passes without checking. Found by this pass

The review lists under "What is done well" that import boundaries are machine-checked by `.dependency-cruiser.cjs`. The rules are there. The check does not read the code.

- `pnpm lint:boundaries` prints `no dependency violations found (0 modules, 0 dependencies cruised)`, in this worktree and in the main checkout.
- It then warns `missing-tsc-transpiler`: dependency-cruiser found no compatible TypeScript compiler (`typescript: >=2.0.0 <7.0.0`) and "support for typescript@>=7 will follow".
- `package.json:54` has `"typescript": "~7.0.2"` and `package.json:50` has `"dependency-cruiser": "18.7.2"`. Commit `7cfa705` (2026-11-12) raised TypeScript from 5.7.3 to 7.0.2.
- So since that commit the lint exits 0 whatever the imports are. It is the enforcement named for invariant I8 (`ARCHITECTURE.md:257`) and for the `DOMAINS.md` dependency rules, and CI runs it (`.github/workflows/ci.yml:57`).
- Whether any boundary was broken since 2026-11-12 is unverified; nothing has checked.
- The reviewer could not have seen this without running the command. It is D6.

## 3. Tasks added

In `tasks/prd.json`, which is the source of truth for acceptance. Tasks have no priority field, so priority is given here and by the place in the file.

| Id | Title | Place | Waits for | Priority | Size | Model |
|---|---|---|---|---|---|---|
| P3-31 | Show the native player's reason when it fails | P3, after P3-30 | nothing | High: before the dogfood week (D5) | S | Sonnet; `guardian` review |
| P2-07 | Fix the gateway's small inconsistencies | P2, after P2-06 | nothing | Medium | S | Sonnet; `guardian` review |
| P2-08 | Split `gateway.ts` along its domains | P2, after P2-07 | P2-07 | Medium | M | Sonnet; `guardian` review |
| P2-09 | Move the player view out of `src/components/` | P2, after P2-08 | P13-34, P13-22, P13-24, P13-23, P3-31 | Medium | S to M | Sonnet |
| P2-10 | Keep routes and the sign-in guard in one place | P2, after P2-09 | P13-24, P13-31, P13-34 | Medium | M | Sonnet |
| P2-11 | Return typed errors from the native commands | P2, after P2-10 | P3-31, P0-13, P13-23 | Medium | M | Opus (`native-engineer`); Fable spec; `guardian` review |
| P2-12 | Type the track selector and survive a poisoned lock | P2, after P2-11 | P2-11 | Low | S to M | Opus (`native-engineer`); Fable spec; `guardian` review |
| P2-13 | Make the playback session lifecycle an explicit state | P2, last | P13-34, P13-22, P13-24, P13-23, P3-30, P2-09, P4-02 | Medium, after the dogfood week | L | Opus plan (`planner`) and implementation; Fable spec; `guardian` review |

The structural tasks sit in P2, "Structure by domain", whose goal is that the core matches `DOMAINS.md`. P3-31 changes what the viewer sees, so it sits in P3.

Every task gets a spec in `docs/specs/<TASK-ID>.md` before implementation. P2-11, P2-12, and P2-13 are high-risk (native, redaction, Playback Session), so their specs and spec checks use Fable.

### Why this order

**The reviewer's order was 1, 4, 2, 5, 6, 3.** This triage keeps it except in two places.

- **Problem 2 is split in two.** P3-31 is the TypeScript half: read a string rejection in one module and show its reason. It is small, touches no Rust, and matters for the dogfood week: without it a native launch failure shows "Something went wrong." and the log cannot say why. P2-11 is the Rust half and replaces the string with a typed shape.
- **The CI work (reviewer's second) is not ordered here.** It is the owner's decision. The recommendation in D1 is to do it first, as the reviewer says.

**Player work in flight.** P13-34, P13-22, P13-24, and P13-23 are being built and all touch the player.

- P2-09 moves `PlayerView.tsx`, which those four edit. It waits for all four, and for P3-31, which edits the same file. A move that lands under an open branch makes that branch rebase across a rename.
- P2-10 rewrites how routes are named and guarded. P13-24 and P13-31 change Back and what it restores, and P13-34 changes Back on Home, so P2-10 waits for those three.
- P2-13 rewrites the session hook and the coordinator. It waits for the four P13 tasks, for P3-30 (which changes what Retry asks the coordinator for), and for P2-09 so it works on the files in their final place.
- P2-11 and P2-12 are native. `AGENTS.md` keeps native work serial, so they wait for P0-13 and P13-23 and for each other.

**The dogfood week (P4-01).**

- Only P3-31 should come before it, and D5 asks the owner to gate the week on it. It is a fix, not a refactor.
- P2-07 and P2-08 may land before the week. They do not gate it and do not touch the player's files.
- P2-13 waits for P4-02 on purpose. It is the largest change to the best-tested code, it gives the viewer nothing, and the week's findings may change what the lifecycle must do. It sits in P2, ahead of P15 in the file, so it is picked before the player comforts in P15 add more flags.
- P2-11 and P2-12 do not gate the week. They should not merge while the week is running, because they change every command's error path.

**Notes for the coordinator.**

- P2-07 and P2-08 are eligible now. They should not pre-empt the P13 tasks in flight.
- Start P2-08 when no open pull request touches `gateway.ts`. `fix/plan-without-token` does.
- P13-29 and P13-33 also touch the player and are not started. If either is in flight when P2-09 is picked, finish it first.

### Calls made inside the tasks

The owner merging this pull request is the approval of these. Each can be overruled by saying so.

- **P2-07, the device name.** The finding is that the name is "Fluster Linux" on every platform. The task names the platform ("Fluster macOS" on macOS) and keeps the Linux name. It does not use the host name, which would need a new Tauri command and would send the computer's name to the server.
- **P2-07, a deleted test.** `latest()` is dead code. The one test of its own mapping (`gateway.test.ts:141`) goes with it. The other six uses only need some authenticated call and move to one that production uses.
- **P2-10, the placeholder pages.** `#/next/detail` and `#/next/player` are removed; they then show the not-found view.
- **P2-10, the prefix.** The `#/next` prefix stays. Dropping it is a backlog entry.
- **P2-13 and `strategy.keep`.** `tasks/prd.json` lists "PlaybackCoordinator and its tests" under `keep`. P2-13 changes the coordinator's inside and keeps its tests, and its first acceptance item is a plan the owner approves.

### Invariants the tasks touch

| Task | Invariant or hard rule | How the acceptance guards it |
|---|---|---|
| P3-31 | I4: tokens never appear in errors | A string with a token, URL, and path is rejected in a test and none is shown; `guardian` review |
| P2-07 | Same PlaybackInfo flags in body and query; the DeviceProfile on every request; I1 | Unchanged for ordinary ids; `pnpm test:tripwire` |
| P2-08 | I8: only the gateway talks to Jellyfin; the token is held only by the gateway; media URLs only in Playback Negotiation | `gateway.ts` stays the one entry; modules get a request function, not the token; boundary rules cover the new modules |
| P2-09 | `DOMAINS.md` dependency rules | A boundary rule fails if `src/components/` returns |
| P2-10 | None | – |
| P2-11 | I3: a fixed command list; I4 | No command added, removed, or renamed; the allowlist test unchanged; the Rust canary covers the new shape |
| P2-12 | I3; "keep player commands typed and narrow" | Wire values unchanged; the allowlist test unchanged |
| P2-13 | I1; exactly one Stopped report for each started session | Nothing sent to Jellyfin changes; `pnpm test:tripwire`; existing tests unweakened |

## 4. Backlog entries

Appended to `tasks/backlog.md` under "Code quality review (2026-11-13)".

- The three guards missing from CI (D1). S.
- A TypeScript lint for hook dependencies (D2). S to M.
- `noUnusedLocals` and `noUnusedParameters` in `tsconfig.app.json` (D3). S.
- Compile and lint the macOS surface in CI (D4). S if it compiles today.
- Add P3-31 to P4-01's `depends_on` (D5).
- The e2e engine imported into the composition root (`src/app/compose.ts:15`). Covered by D1 A; otherwise a small change. S.
- The data race `ensure_numeric_locale` accepts. S.
- A file-size check, from `WORKFLOW.md`'s enforcement backlog. S.
- Drop the `#/next` prefix after P2-10. Noted by this triage, not by the review. S to M.
- Check `docs/security.md` lines 9 and 30 when the problem 1 fix lands. S.
- Review what the first pass did not read, and run the checks. M.
- The import-boundary lint cruises no module since TypeScript 7 (D6). S to M.

## 5. Decisions for the owner

Each can be answered alone. D1 to D4 and D6 change CI or what it runs. D5 edits an existing task.

### D1. Run the three missing guards in CI?

`pnpm check` runs `typecheck:core`, `typecheck:integration`, and `test:no-test-engine`. CI's frontend job runs none of them, so the rule that the shell-neutral core uses no DOM global, and the rule that no build ships the e2e engine, hold only when someone runs `pnpm check` locally.

- **A.** Add all three to the frontend job: `test:no-test-engine` directly after `pnpm build`, the two type-checks after it.
- **B.** Add `typecheck:core` and `test:no-test-engine` only, the two that guard a written rule.
- **C.** Leave CI as it is.

**Recommendation: A.** The scripts exist and pass locally, so the cost is CI seconds. Proposed task: "Run every `pnpm check` guard in CI", S, Sonnet. Acceptance: the three steps run in the frontend job; a throwaway commit that uses `window` in `src/domain/` fails CI, and is reverted, as P13-25 proved its gate.

### D2. Add a TypeScript linter?

No linter is configured. Two `eslint-disable-next-line react-hooks/exhaustive-deps` comments exist and do nothing. Hook dependency arrays, which the player relies on, are checked by nobody.

- **A.** ESLint with only the React hooks rules (`rules-of-hooks` and `exhaustive-deps`, both errors), as `pnpm lint` inside `pnpm check` and CI. No formatter.
- **B.** Biome, lint only, with its hook rules. The two comments are rewritten in its syntax.
- **C.** A full setup: typescript-eslint's recommended rules and a formatter. The first run rewrites most files.
- **D.** No linter. Delete the two comments, since they claim a check that does not run.

**Recommendation: A.** It checks the one thing the review found unchecked, matches the comments already in the code, and adds no formatting diff. It adds dev dependencies. The number of findings on the first run is unverified, and some may be real stale-closure bugs in the player, so the proposed task ("Lint hook dependencies", S to M, Sonnet) fixes or justifies each one and should land after the P13 player tasks.

### D3. Turn on `noUnusedLocals` and `noUnusedParameters` for the app?

`tsconfig.integration.json` has both; `tsconfig.app.json` does not. `pnpm build` runs `tsc -b` in CI, so turning them on changes what CI rejects.

- **A.** Turn both on and remove what they report.
- **B.** Leave them off.

**Recommendation: A.** It would have flagged dead code of the kind the review found by hand. The number of findings is unverified. It can ride in the D2 task.

### D4. Compile the macOS surface in CI?

`src-tauri/src/surface/macos.rs` is never compiled or linted, and whether it compiles today is unverified. P6-01 ships the macOS build and waits for P4-02. The repository is public (`gh repo view`: `PUBLIC`); GitHub does not charge public repositories for standard hosted runners, which this pass did not re-check against GitHub's current terms.

- **A.** A macOS job that runs `cargo check` and `cargo clippy` on every pull request, required.
- **B.** The same job on pushes to `main` and on pull requests that change `src-tauri/`, not required until P6-01.
- **C.** No job until P6-01. Record in `docs/validation.md` that the macOS source is uncompiled.
- **D.** `cargo check --target aarch64-apple-darwin` on the Linux runner. Whether the build scripts of the native crates run without the macOS SDK is unverified.

**Recommendation: B.** It finds rot in the `unsafe` code months before P6-01 without making Linux work wait on a macOS runner. Proposed task: "Compile and lint the macOS surface in CI", Opus (`native-engineer`). Its size is S if the file compiles and unknown if not; the job needs libmpv 0.41 or newer from Homebrew, also unverified. P2-11 and P2-12 change error paths in `macos.rs` and list it as an untested gate until this exists.

### D5. Gate the dogfood week on P3-31?

Today a native launch failure (the renderer cannot attach, a session is already playing, the plan is invalid) shows "Something went wrong." P4-01's acceptance asks the log to record every problem.

- **A.** Append `"P3-31"` to the end of P4-01's `depends_on`, after `"P13-31"`.
- **B.** Leave P4-01 alone; P3-31 lands when it lands.

**Recommendation: A.** P3-31 is small and has no dependencies. This pass may not edit an existing task, so the owner or the coordinating agent applies it.

### D6. Repair the import-boundary lint?

`pnpm lint:boundaries` has cruised 0 modules since TypeScript went to 7.0.2 on 2026-11-12, because dependency-cruiser 18.7.2 supports TypeScript below 7. It exits 0, so CI is green while invariant I8 and the `DOMAINS.md` layer rules are unenforced. Evidence is in §2.

- **A.** Make the script fail when it cruises no module, now. Then give dependency-cruiser a compiler it supports: a second, aliased TypeScript 6 dev dependency used only by the lint. Whether dependency-cruiser can be pointed at an aliased package is unverified.
- **B.** Make the script fail on no modules, and put the app back on TypeScript 6 until dependency-cruiser supports 7.
- **C.** Make the script fail on no modules, and replace dependency-cruiser with a tool or a source-scanning test that reads TypeScript 7.
- **D.** Leave it until dependency-cruiser supports TypeScript 7.

**Recommendation: A, and B if A does not work.** The first half is the same in A, B, and C and is the urgent part: a guard that cannot fail is worse than none, because the docs say the rule is enforced. This should come before P2-08 and P2-09, whose acceptance relies on the lint. Proposed task: "Make the boundary lint read the code again", S to M, Sonnet. Acceptance: the lint reports more than zero modules and fails if it reports zero; a throwaway import from `src/domain/` into React fails it and is reverted; any violation that entered since 2026-11-12 is fixed or listed. This pass did not add the task, because it changes what CI runs and adds or moves a dependency.

## 6. What this pass did not do

- It did not change CI, `AGENTS.md`, `DOMAINS.md`, or any code.
- It did not edit any existing task. A script compared every existing task before and after; all 145 are identical.
- It did not re-review the code the reviewer did not read.
