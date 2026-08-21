# Repository Guidelines

## Project Structure & Module Organization

Fluster combines a React/Vite frontend in `src/` with a Tauri/Rust native player in `src-tauri/src`. Domain types live in `src/domain`, Jellyfin code in `src/lib/jellyfin`, player coordination in `src/lib/player`, and views in `src/components`. Keep unit tests beside modules as `*.test.ts` or `*.test.tsx`. Browser journeys are in `e2e/`, integration resources in `tests/`, packaging in `release/`, and CI in `.github/workflows/`.

## Build, Test, and Development Commands

- `pnpm install` installs the pinned Node dependencies (Node 22+, pnpm 11).
- `pnpm dev` runs browser-development mode at the Vite URL.
- `pnpm tauri dev` runs the desktop shell; Linux requires Wayland and libmpv 0.41+.
- `pnpm build` type-checks and creates the frontend production bundle.
- `pnpm test` runs Vitest unit/component tests; `pnpm test:watch` supports iteration.
- `pnpm test:e2e` runs Playwright smoke and interaction tests.
- `pnpm check` runs Vitest, the frontend build, and Rust tests.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` enforces Rust lint cleanliness.

## Coding Style & Naming Conventions

Across the repository, prefer simple, human-readable code in TypeScript, React, Rust, tests, CI, and shell scripts. Choose straightforward control flow, explicit names, and focused helpers over clever abstractions, dense expressions, or premature generalization. Use `switch` statements for reducers so event branches remain easy to scan.

Use TypeScript with two-space indentation and semicolons, camelCase identifiers, PascalCase React components, and kebab-case file names for multiword library modules. Keep player commands typed and narrow. Format Rust with `cargo fmt`; use snake_case functions/modules and PascalCase types. Never weaken the fixed direct-play policy or introduce a generic mpv command bridge.

## Testing Guidelines

Add focused tests with behavior changes. Cover reducers and gateways with Vitest, rendered interactions with Testing Library, native behavior with Rust tests, and user flows with Playwright. Use fixtures instead of credentials or copyrighted samples. Run `pnpm check`, Playwright, and Clippy before opening a PR.

## Commit & Pull Request Guidelines

History follows Conventional Commit-style subjects, such as `feat: establish embedded direct-play vertical slice`. Keep commits scoped and imperative. PRs should explain user impact, testing performed, and direct-play/security implications; link relevant issues and include screenshots for visible UI changes. Call out untested Wayland, GPU, Jellyfin, or AppImage release gates explicitly.

## Security & Configuration

Tokens are session-only. Never log authenticated URLs, access tokens, or play-session IDs. Preserve URL redaction and keep transcoding/remuxing disabled in both request bodies and query parameters.
