---
name: native-player
description: Change Fluster's Rust native player, libmpv integration, Tauri commands, or platform video surfaces. Use for any edit under src-tauri/ or to the PlayerEngine port.
---

# Native player

## Before editing

- Use Opus.
- Read `docs/architecture.md` and `DOMAINS.md` §6–7.
- Outline the target file with serena `get_symbols_overview`.
- Read only the symbols you need.

## Boundaries

- Keep libmpv calls in `player/`.
- Keep windowing and render contexts in `surface/`.
- Keep `lib.rs` to command registration and glue.
- Keep `#[tauri::command]` handlers in `commands.rs`.
- Keep renderer objects and render contexts on the platform UI thread.
- Never touch Jellyfin data in `surface/`.

## Commands

- Never add a generic mpv command, property, or option passthrough.
- Follow `references/adding-a-command.md` to add or change a Tauri command.
- Validate every URL in Rust before libmpv sees it.
- Pass auth to libmpv only as a fixed, typed header value.

## Safety

- Route every error that can carry a URL through redaction.
- Document every `unsafe` block with a `SAFETY:` comment.
- Never put side effects inside `debug_assert!`.
- Never `unwrap` on values from libmpv, the platform, or the frontend.
- Keep mpv config, scripts, and default input bindings disabled.

## Verify

- Run clippy and `cargo test --release` after each change.
- Run `pnpm tauri dev` and play a sample for visible changes.
- Report observed `hwdec-current` before claiming hardware decoding.
- List every platform, GPU, and compositor you did not test.
- Keep this work serial; never run it in parallel with other native work.
