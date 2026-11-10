# Fluster agent rules

Fluster is a Jellyfin client that plays the original file whenever it can and shows every server conversion: Tauri 2 + React/TypeScript + Rust with embedded libmpv.

## Read first

- Read `PRODUCT.md` before changing scope or user-facing behavior.
- Read `ARCHITECTURE.md` before changing server calls, playback, or invariants.
- Read `DOMAINS.md` before adding or moving code.
- Read `WORKFLOW.md` before planning multi-step work.

## Tasks

- Pick work from `tasks/prd.json` and follow its `rules`.
- Change only a task's `status`, `owner`, `passes`, and `evidence` fields.
- Never edit acceptance items without human approval.
- Link the task id in commits, plans, and PRs.
- Read the dogfood server URL from `FLUSTER_DOGFOOD_SERVER`; never commit it.


## Subagents

- `scout` (Haiku): read-only search.
- `ci-triage` (Haiku): failing check output.
- `refiner` (Opus; Fable for high-risk tasks): task refinement and `docs/specs/<TASK-ID>.md`.
- `spec-checker` (Opus; Fable for high-risk tasks): fresh-context spec check.
- `implementer` (Sonnet): one specified TypeScript milestone.
- `reviewer` (Sonnet): routine diff review.
- `native-engineer` (Opus): `src-tauri/` and player engine work.
- `guardian` (Opus): high-risk diff review.
- `planner` (Opus): plans and decision records.

## Commands

- Use the Node version in `.node-version` (mise reads it via `mise.toml`; run `mise exec --` in non-interactive shells).
- Install: `pnpm install`
- Browser dev: `pnpm dev`
- Desktop dev: `pnpm tauri dev`
- Unit tests: `pnpm test`
- Build and type-check: `pnpm build`
- All checks: `pnpm check`
- End-to-end: `pnpm test:e2e`
- Rust lint: `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- Format Rust: `cargo fmt --manifest-path src-tauri/Cargo.toml`

## Hard rules

- Prefer direct play; fall back to direct stream, then transcode, only through Playback Negotiation.
- Never request conversion for a source that passes the direct-play rules in `ARCHITECTURE.md` §3.
- Show every server conversion and its reason in the player.
- Send the same PlaybackInfo flags in the request body and the query string.
- Send the Fluster DeviceProfile with every PlaybackInfo request.
- Never add codec or container conditions to the DeviceProfile.
- Use a `TranscodingUrl` only after Playback Negotiation validates and rebuilds it.
- Never let an HLS master playlist list subtitle or trickplay renditions.
- Validate every HLS playlist in Rust before mpv reads it; reject any URI that is not same-origin and credential-free.
- Refuse media sources that `ARCHITECTURE.md` §3 can neither play nor convert.
- Never add a generic mpv command, property, or option bridge.
- Treat every new Tauri command as an architecture change.
- Never log, persist, or display tokens, passwords, authenticated URLs, or play-session IDs.
- Never put a token in a URL; authenticate HLS playlists and segments with the header.
- Never store tokens in WebView storage, Query caches, or React state.
- Never use the browser player as a fallback for the native player.
- Talk to Jellyfin only through `src/lib/jellyfin/gateway.ts`.
- Build media URLs only in Playback Negotiation.
- Keep `src/domain/` free of React, SDK, Tauri, and HTTP imports.
- Never introduce Flutter.

## Code style

- Prefer simple, explicit code over clever abstractions.
- Use `switch` statements in reducers.
- Use two-space indentation and semicolons in TypeScript.
- Use camelCase identifiers, PascalCase components, kebab-case multiword module files.
- Use snake_case functions and PascalCase types in Rust.
- Keep player commands typed and narrow.
- Document every `unsafe` block with a `SAFETY:` comment.
- Never put side effects inside `debug_assert!`.
- Split files that grow past about 400 lines along domain lines.
- Build new UI only under `src/features/`.

## Design

- Follow `DESIGN.md` for every UI change.
- Use tokens from `src/styles/tokens.css`; never hard-code colours, sizes, radii, or durations.
- Build UI from `src/features/shared/ui/`; never use a native select, radio, or checkbox in a feature.
- Make every screen work with arrow keys, Enter, and Escape alone, and honour reduced motion.
- Map errors to plain copy; never show a transport error message.
- Include before/after screenshots at 1440×900 and 1920×1080 in UI PRs.

## Tests

- Add a focused test with every behavior change.
- Place unit tests beside modules as `*.test.ts` or `*.test.tsx`.
- Use Vitest for reducers and gateways, Testing Library for views, Rust tests for native code, Playwright for flows.
- Never skip, weaken, or delete a test to pass a check.
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
- Keep native surface and mpv work serial.

## Models

- Run each task as: refine + spec, spec check, implement, verify, one review round, ship.
- Use Haiku for search, log triage, commit messages, and watching PRs.
- Use Sonnet for the coordinator, TypeScript implementation, tests, verify, and routine review.
- Use Opus for specs and spec checks on routine tasks, native Rust, `guardian` review, and plans.
- Use Fable for specs and spec checks on high-risk tasks (native, security, architecture, ADRs), and after Opus fails twice on the same problem.
- Run one review round; fix critical, high, and medium findings; log lows in the plan.
- Lower effort before choosing a weaker model.
- Escalate one tier after two failed attempts.
- Switch models only at task boundaries.

## Pull requests

- Ship every finished branch with the `ship` skill.
- Never commit directly to `main`.
- Merge only with green CI.
- Call out changes to invariants, `docs/security.md`, release signing, or CI in the PR; merge on green.
- Explain user impact, testing performed, and direct-play, conversion, and security implications.
- List every untested Wayland, GPU, Jellyfin, or AppImage gate.
- Include screenshots for visible UI changes.
- Link the plan or issue.
