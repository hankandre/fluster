---
name: doc-gardening
description: Find and fix drift between Fluster's docs and code. Use weekly, after large refactors, or when a doc looks stale.
---

# Doc gardening

## Detect

- Use Haiku for detection.
- Check that every command in `AGENTS.md` runs.
- Check that every code location in `DOMAINS.md` exists, using serena or codebase-memory.
- Check that every invariant in `ARCHITECTURE.md` §4 still has its enforcement.
- Check the gap table in `ARCHITECTURE.md` §5 against plan progress.
- Check that skills reference files and commands that exist.
- Check that `docs/security.md` lists exactly the registered Tauri commands.
- List each drift with `file:line` and the evidence.

## Fix

- Use Sonnet for fixes.
- Change the doc when the code is right.
- Open a plan or issue when the code is wrong.
- Open one small PR per drift.
- Never mix gardening with feature work.
- Never rewrite docs for style.
