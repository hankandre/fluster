---
name: verify
description: Run Fluster's checks and record evidence before asking for review. Use after finishing a milestone or before opening a PR.
---

# Verify

## Always

- Run `pnpm check`.
- Read every failure in full before fixing it.
- Fix failures at the cause, never in the test.

## When TypeScript UI or flows changed

- Run `pnpm test:e2e`.
- Drive the changed flow in browser mode with Playwright.
- For visible UI changes run `pnpm test:visual` and attach the affected captures from `visual-captures/` (contact sheet: `index.html`). `pnpm check` does not run it, but CI gates on `e2e/visual/baselines/`; for an intended change run `pnpm test:visual:accept <run-id>` (see `WORKFLOW.md` §5).

## When Rust changed

- Run `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
- Run `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.
- Run `cargo test --release --manifest-path src-tauri/Cargo.toml`.

## When playback negotiation changed

- Run the gateway tests.
- Confirm the tests assert both the request body and the query string.
- Run the server tripwire when it exists.

## Evidence

- Record each command and a short result in the plan or PR.
- Quote failures verbatim.
- Never claim a pass without output.
- Never treat browser-mode success as evidence for native playback.
- List every native, GPU, compositor, Jellyfin-version, and AppImage gate you did not run.
