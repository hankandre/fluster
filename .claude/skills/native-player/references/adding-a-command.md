# Adding a Tauri command

## Decide

- Confirm no existing command covers the need.
- Confirm the command takes typed, narrow arguments.
- Record the decision in the active plan's decision log.

## Rust

- Define request and response types in `src-tauri/src/model.rs`.
- Implement the behavior on `MpvController` in `mpv.rs`.
- Add a thin `#[tauri::command]` handler in `lib.rs`.
- Register it in `generate_handler!`.
- Map errors through redaction.
- Add Rust unit tests for valid and invalid input.

## TypeScript

- Add the method to the `PlayerEngine` port in `src/domain/playback.ts`.
- Implement it in `src/lib/player/native-player.ts`.
- Implement it in `src/lib/player/browser-player.ts`.
- Add Vitest coverage for the caller.

## Docs

- Add the command to the list in `docs/security.md`.
- Add the command to the list in `docs/architecture.md`.
- Update `ALLOWED_COMMANDS` in `src-tauri/src/command_allowlist.rs`; its tests fail until it matches `generate_handler!`.
