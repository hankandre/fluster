---
name: change-review
description: Review a Fluster diff in a fresh context against its brief, invariants, and domain rules. Use for every change before the human gate; never on a change you implemented.
---

# Change review

## Setup

- Run in a fresh context.
- Never review a change you implemented.
- Use Opus when the diff touches playback negotiation, Tauri commands, tokens, redaction, or `src-tauri/`.
- Use Sonnet otherwise.
- Read the brief or plan first.
- Get the diff with `git diff <base>...HEAD`.
- List affected symbols and callers with codebase-memory `detect_changes`.

## Review

- Walk every item in `references/checklist.md`.
- Walk `references/design-checklist.md` when the diff touches `src/features/`, `src/components/`, or `src/styles/`.
- Look for correctness bugs and missed edge cases.
- Look for invariant and dependency-rule violations.
- Look for stubs, skipped tests, weakened assertions, and justified workarounds.
- Look for tokens or authenticated URLs in logs, errors, or diagnostics.
- Check that tests cover the changed behavior.

## Report

- Give each finding a `file:line`, a concrete failure scenario, and a severity.
- Rank findings most severe first.
- Skip style.
- Never propose a new abstraction unless a finding requires one.
- Say "no findings" when there are none.
