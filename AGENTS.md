# Octave agent rules

Octave is a Jellyfin and Jellyscale client for the TV that plays the original file whenever the device can and shows every server conversion: React Native (Expo, react-native-tvos) over a shared TypeScript core, with native Kotlin for networking and playback (Media3 first, libmpv later for originals only).

## Read first

- Read `PRODUCT.md` before changing scope or user-facing behavior.
- Read `ARCHITECTURE.md` before changing server calls, playback, native code, or invariants.
- Read `DOMAINS.md` before adding or moving code.
- Read `WORKFLOW.md` before planning multi-step work.
- Read `docs/security.md` before touching tokens, the network, or redaction.

## Layout

- The core is the pnpm workspace package `@octave/core` in `packages/core` (`packages/core/src/domain/`, `packages/core/src/jellyfin/`, `packages/core/src/player/`, `packages/core/src/`) with its fixtures in `packages/core/tests/fixtures/`.
- Planned: `apps/tv` (T3-01) and `modules/player` (T8-01). Until a task creates a path, do not write rules or code that assume it.

## Tasks

- Read and update tasks only through `pnpm task` (`next`, `show`, `list`, `set`); never load `tasks/prd.json` whole.
- Follow the `rules` array at the top of `tasks/prd.json`.
- Change only a task's `status`, `owner`, `passes`, and `evidence` fields.
- Keep evidence to 600 characters and name the PR or commit.
- Append deferred or newly found work to `tasks/backlog.jsonl` as one JSON line (fields in `WORKFLOW.md` §2a); any agent or pull request may.
- Only a Product Owner pass (Fable 5.2) adds, splits, reorders, or drops tasks, after triaging the backlog, through `scripts/task-owner.mjs` and a line in `tasks/product-owner-log.md`; the owner can veto any of it. `pnpm lint:flow` fails any other change.
- Never edit acceptance items without the owner's approval.
- Link the task id in commits, plans, and PRs.
- Read the dogfood server URL from `OCTAVE_DOGFOOD_SERVER`; never commit a server address, a credential, or the owner's name.

## Subagents

- `scout` (Haiku): read-only search.
- `ci-triage` (Haiku): failing check output.
- `refiner` (Opus; Fable for high-risk tasks): task refinement and `docs/specs/<TASK-ID>.md`.
- `spec-checker` (Opus; Fable for high-risk tasks): fresh-context spec check.
- `implementer` (Sonnet): one specified TypeScript milestone.
- `reviewer` (Sonnet): routine diff review.
- `native-engineer` (Opus): Kotlin, Expo native modules, Media3, and the native HTTP client.
- `guardian` (Opus): high-risk diff review.
- `planner` (Opus): plans and decision records.
- `test-writer` (Sonnet; Opus for Kotlin): failing tests and `docs/specs/<TASK-ID>.tests.json` before implementation.
- `product-owner` (Fable): backlog triage, priorities, and frozen-test rulings.

## Commands

- Use the Node version in `.node-version` (mise reads it via `mise.toml`; run `mise exec --` in non-interactive shells).
- Install: `pnpm install`
- Core unit tests (Vitest, Node environment): `pnpm --filter @octave/core test`; `pnpm test` runs them, then the root scripts and workflow tests
- Type-check: `pnpm typecheck`
- Lint: `pnpm lint`, `pnpm lint:boundaries`, `pnpm lint:ghost-terms`, `pnpm lint:backlog`, `pnpm lint:flow`
- Task workflow tests: `pnpm test:workflow`
- All checks: `pnpm check`
- Server tripwire (needs `pnpm samples:generate`, `pnpm fixture:up`, `pnpm fixture:setup`): `pnpm test:tripwire`
- Jellyscale fixture check (needs the fixture servers up and set up): `pnpm fixture:check-jellyscale` re-probes the pinned Jellyscale and fails if its endpoint inventory changed.
- Task CLI: `pnpm task next`, `pnpm task show <id>`, `pnpm task list [--status s] [--phase p]`, `pnpm task set <id> --status s [--owner o] [--evidence-file f]`.
- Not yet built: `pnpm tv:native:test` (T3-01), `pnpm tv:e2e` (T3-02), `pnpm tv:wire` (T3-05), `pnpm tv:visual` (T3-07).

## Hard rules

Playback

- Prefer direct play; fall back to direct stream, then transcode, only through Playback Negotiation.
- Never request a conversion for a source that an engine on this device can play under the direct-play rules in `ARCHITECTURE.md` §3.
- Show every server conversion and its reason in the player.
- Send the same PlaybackInfo flags in the request body and the query string.
- Send the Octave DeviceProfile with every PlaybackInfo request.
- Never add codec or container conditions to the DeviceProfile.
- Use a `TranscodingUrl` only after Playback Negotiation validates and rebuilds it.
- Never let an HLS master playlist list subtitle or trickplay renditions.
- Validate every HLS playlist natively before the player reads it (Media3's playlist parser hook on Android); refuse any URI that is not same-origin and credential-free. Every validator passes `packages/core/tests/fixtures/hls-playlists.json` and `packages/core/tests/fixtures/hls-master-urls.json`.
- Refuse media sources that `ARCHITECTURE.md` §3 can neither play nor convert.
- Never add a generic player command, property, option, or header bridge.
- Treat every new native module method or event as an architecture change.
- Never fall back to a player or image path that cannot send the header (a web video element, Media3's default data sources).

Tokens and network

- Keep the token in native memory only (decision 0005): Kotlin's session registry holds it, and JavaScript holds an opaque session id and never sees the token. Kotlin alone sends and parses the sign-in calls.
- Send every server request (sign-in, catalog, artwork, playlists, segments, media, subtitles) through the one authenticated OkHttp client; it adds the header only for the session's origin, follows no redirect, uses no proxy, stores no cookie, and refuses any other origin.
- Strip the session's token value, as written and percent-encoded, from every response body before it crosses to JavaScript.
- Keep the native session surface to `signIn`, `request`, `restoreSessions`, `endSession`, and the `sessionEnded` event; `request` takes no header and no absolute URL. Adding a method or event needs a decision record.
- Load artwork natively: the image view takes an item id, image type, tag, size, and session id, never a URL, header, or token (T3-11).
- Never use `DefaultHttpDataSource`, `DefaultDataSource.Factory`, or an ExoPlayer built without Octave's media source factory.
- Treat a 3xx answer and a status of 0 as errors everywhere. A host with no native transport (Node tests, the tripwire) sets `redirect: "manual"` in one place, the core's transport adapter.
- Never put a token in a URL, a React prop, an event, or a log; authenticate media, playlists, segments, and images with the header.
- Never log or display tokens, passwords, authenticated URLs, or play-session IDs.
- Never persist a token, except as the one encrypted record native code writes under an Android Keystore key in the no-backup directory (decision 0005); users stay signed in by default.
- Never let a token reach JavaScript storage, Query caches, React state, a prop, an event, or a log.
- Sign in from a development build only to a development server, never to a server holding a real library.
- A playback task passes only when its wire test passes against Jellyscale: the header on every request, no token in any URL, no redirect followed, no other origin contacted.
- Never work around a missing Jellyscale feature with a token in a URL.

Code boundaries

- Talk to Jellyfin and Jellyscale only through `packages/core/src/jellyfin/gateway.ts`.
- Build media URLs only in Playback Negotiation.
- Keep `packages/core/src/domain/` free of React, React Native, Expo, SDK, and HTTP imports.
- Keep the core free of platform APIs; take them through ports.
- Never introduce Flutter.

Dependencies

- Before adopting a dependency, verify from primary sources that it is actively maintained: recent releases and commits, not archived, and no maintainer statement of maintenance mode or supersession. Record the check in the task's spec.
- Re-check every dependency when a phase starts.

## Code style

- Prefer simple, explicit code over clever abstractions.
- Use `switch` statements in reducers.
- Use two-space indentation and semicolons in TypeScript.
- Use camelCase identifiers, PascalCase components, kebab-case multiword module files.
- Follow the Kotlin coding conventions; keep Kotlin behind interfaces a Swift implementation can mirror.
- Keep player commands typed and narrow.
- Split files that grow past about 400 lines along domain lines.

## Design

- Follow `DESIGN.md` for every UI change.
- Use the design tokens (T3-06 adds them in TypeScript); never hard-code colours, sizes, radii, or durations.
- Build screens from the shared controls; never use a platform picker or dialog the D-pad cannot style or focus.
- Make every screen work with the D-pad, select, and Back alone, and honour reduced motion.
- Map errors to plain copy; never show a transport error message.
- Include before and after screenshots at 1920×1080 in UI PRs.

## Tests

- Add a focused test with every behavior change.
- Place unit tests beside modules as `*.test.ts`.
- Use Vitest for the core, JVM tests for Kotlin, and the emulator tests T3-02 and T3-10 add for the app.
- Never skip, weaken, or delete a test to pass a check.
- Never change or delete a frozen test (a file listed in `docs/specs/<TASK-ID>.tests.json`); report a wrong one and the Product Owner step rules.
- Never stub a function to make a build pass.
- Use fixtures; never commit credentials or copyrighted media.

## Reasoning

- Prefer retrieval-led reasoning over training-led reasoning.
- Read the code, docs, and plans before relying on memory.
- Check APIs, versions, and library behavior against current sources.
- Cite the file, command output, or URL behind each claim.
- Say "unverified" when no source backs a claim.

## Navigating code

- Start unfamiliar work with codebase-memory `get_architecture`.
- Find code by intent with semble `search`.
- Outline files with serena `get_symbols_overview` before reading them.
- Read single symbols with serena `find_symbol`; avoid reading whole large files.
- Check callers with serena `find_referencing_symbols` before changing a signature.
- Use Grep only for literal strings.

## Working

- Fix a red check before starting the next milestone.
- Commit one milestone at a time with a Conventional Commit subject.
- Never review your own change.
- Never write long comments justifying a workaround; fix the cause or log it in the plan.
- Record decisions in the active plan's decision log.
- Propose a test, lint, or rule after the second correction for the same mistake.
- Never claim a check passed without showing its output.

## Parallel work

- Work in your own git worktree.
- Commit only files you own.
- Never run `git stash` or `git reset --hard`.
- Never force-push `main` or another agent's branch.
- Rebase your own unmerged PR branch, then `git push --force-with-lease`.
- Resolve PR conflicts by rebasing, as the `ship` skill describes.
- Never edit another agent's claimed milestone.
- Keep native module, player, and on-device work serial.

## Models

- Run each task as: refine + spec, spec check, failing tests, implement, verify, one review round, ship.
- Use Haiku for search, log triage, commit messages, and watching PRs.
- Use Sonnet for the coordinator, TypeScript implementation, tests, verify, and routine review.
- Use Opus for specs and spec checks on routine tasks, native Kotlin, `guardian` review, and plans.
- Use Fable for specs and spec checks on high-risk tasks (native, security, architecture, ADRs), and after Opus fails twice on the same problem.
- Run one review round; fix critical, high, and medium findings; log lows in the plan.
- Lower effort before choosing a weaker model.
- Escalate one tier after two failed attempts.
- Switch models only at task boundaries.
- The task workflow's model choices live in MODELS in `.claude/workflows/task.js`; override per run with args.models.

## Pull requests

- Ship every finished branch with the `ship` skill.
- Never commit directly to `main`.
- Merge only with green CI.
- Call out changes to invariants, `docs/security.md`, release signing, or CI in the PR; merge on green.
- Explain user impact, testing performed, and direct-play, conversion, and security implications.
- List every untested device, Jellyfin, and Jellyscale gate.
- Include screenshots for visible UI changes.
- Link the plan or issue.
