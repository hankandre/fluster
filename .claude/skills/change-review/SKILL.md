---
name: change-review
description: Review an Octave diff in a fresh context against its task, invariants, and domain rules. Use for every change before the owner gate; never on a change you implemented.
---

# Change review

## Setup

- Run in a fresh context.
- Never review a change you implemented.
- Run one round only; log low findings in the plan instead of re-reviewing.
- Use `guardian` (Opus) when the diff touches playback negotiation, the gateway, the player, a native method, the native HTTP client, tokens, redaction, Kotlin, or `docs/security.md`.
- Use `reviewer` (Sonnet) otherwise.
- Read the task (`pnpm task show <id>`, never the whole of `tasks/prd.json`) and the plan first.
- Get the diff with `git diff <base>...HEAD`.
- List affected symbols and callers with codebase-memory `detect_changes`.

## Review

- Walk every item in `references/checklist.md`.
- Walk `references/design-checklist.md` when the diff touches screens, shared controls, or design tokens.
- Look for correctness bugs and missed edge cases.
- Look for invariant and dependency-rule violations.
- Look for stubs, skipped tests, weakened assertions, and justified workarounds.
- Look for tokens or authenticated URLs in logs, errors, props, events, or diagnostics.
- Check that tests cover the changed behavior, and that a playback task has its Jellyscale wire test.

## Report

- Give each finding a `file:line`, a concrete failure scenario, and a severity.
- Rank findings most severe first.
- Skip style.
- Never propose a new abstraction unless a finding requires one.
- Say "no findings" when there are none.
