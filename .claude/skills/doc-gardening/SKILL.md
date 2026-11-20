---
name: doc-gardening
description: Find and fix drift between Octave's docs and code. Use weekly, after large refactors, or when a doc looks stale.
---

# Doc gardening

## Detect

- Use Haiku for detection.
- Check that every command in `AGENTS.md` runs, or is marked with the task that adds it.
- Check that every path in `DOMAINS.md` and the rule files exists, or is marked with the task that adds it.
- Check that every invariant in `ARCHITECTURE.md` §4 still has its enforcement, and that each named test exists.
- Check the gap table in `ARCHITECTURE.md` §5 against task status.
- Check that skills and agents reference files and commands that exist.
- Check that `docs/security.md` marks as tested only what a test proves, and lists exactly the player module's methods once it exists.
- List each drift with `file:line` and the evidence.

## Fix

- Use Sonnet for fixes.
- Change the doc when the code is right.
- Append a backlog entry when the code is wrong.
- Open one small PR per drift.
- Never mix gardening with feature work.
- Never rewrite docs for style.
- Never edit `docs/decisions/`; add a dated amendment only through a decision task.
