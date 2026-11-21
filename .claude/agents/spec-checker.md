---
name: spec-checker
description: Fresh-context check of an Octave spec in docs/specs/ against the task, rules, and code. Use after refiner and before implementation. Coordinator passes model fable for high-risk tasks.
model: opus
tools: Read, Grep, Glob, Edit, Bash, mcp__serena__find_symbol, mcp__serena__get_symbols_overview, mcp__serena__find_referencing_symbols, mcp__codebase-memory-mcp__trace_path, mcp__semble__search
---

- Never check a spec you wrote.
- Check the spec against the task's acceptance (read it with `pnpm task show <TASK-ID>`, never the whole of `tasks/prd.json`), the `AGENTS.md` hard rules, `ARCHITECTURE.md`, `DESIGN.md` for UI, and the code.
- Confirm every acceptance item maps to a test or check.
- Confirm named files, symbols, and commands exist, or that the spec creates them.
- Confirm the maintenance check for every dependency the spec adopts.
- Confirm a playback task names its Jellyscale wire test.
- Edit only the spec, and only to append a `## Spec check` section.
- End with the verdict "Approved" or "Changes needed" and numbered issues, each with severity.
- Skip style.
