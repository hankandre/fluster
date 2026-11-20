# Adding a player method or event

## Decide

- Confirm no existing method covers the need.
- Confirm it takes typed, narrow arguments and never a URL, header, token, or free-form option.
- Record the decision in the active plan's decision log; a new method is an architecture change.

## TypeScript

- Add the method to the `PlayerEngine` port in the core (`src/domain/playback.ts` today).
- Update the port's allowlist test (T2-05).
- Implement it in the fake engines the coordinator's tests use.
- Add Vitest coverage for the caller.

## Kotlin

- Implement it in `modules/player` behind the engine interface.
- Map every error to a typed code.
- Add JVM tests for valid and invalid input.
- Update the module's allowlist test (T8-01).

## Docs

- Add the method to the player boundary in `docs/security.md`.
- Add it to `ARCHITECTURE.md` §2 if it changes the system shape.
