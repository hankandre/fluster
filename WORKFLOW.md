# Workflow

How Octave is built: one human steering, coding agents executing. This document adapts practices published by Anthropic, OpenAI, and the Bun team to a small React Native and Kotlin codebase over a TypeScript core, whose most important property, *never convert what the device can play as stored, and never convert silently*, can be checked mechanically.

Sources are listed at the end. Where a practice is adopted, the reason is stated so it can be dropped when the reason stops being true. A command or path marked with a task id does not exist yet; that task adds it.

## Principles

1. **The repository is the system of record.** If a decision, constraint, or plan lives only in a chat, a head, or an issue comment, agents cannot see it. Write it into the repo.
2. **Humans steer, agents execute.** The owner owns intent (what and why), look, wording and direction, saying "no", the merge decision, and the on-device gates on the Shield. Agents own implementation, tests, and first-pass review. The Product Owner agent (Fable 5.2) owns the backlog and priorities and approves scope-level acceptance edits, under the owner's veto.
3. **The verifier is the ceiling.** Agents reliably reach whatever the checks can distinguish and no further. Invest in oracles before investing in more agent throughput.
4. **Fix the process that generates the code, not the code.** When an agent makes the same class of mistake twice, add a test, lint, hook, or doc line.
5. **Enforce invariants mechanically.** Prose rules are suggestions. A rule that must hold every time becomes a test, a lint, a type, or a hook, and its failure message tells the agent how to fix it.
6. **Keep the harness minimal and re-test it.** Every step in this workflow encodes an assumption about what agents cannot do alone. Revisit those assumptions when models change.

## Documentation map (progressive disclosure)

Agents read the short map first and load detail only when needed.

| File | Role | Size target |
|---|---|---|
| `AGENTS.md` | Rules: short imperative sentences, no justification. Commands, hard rules, pointers. | ≤ ~200 lines |
| `CLAUDE.md` | Imports `AGENTS.md` so Claude Code and Codex share one rulebook | 1 line |
| `.claude/skills/<name>/SKILL.md` | Repeatable processes as short imperative steps; procedures and context in `references/` | ≤ ~60 lines each |
| `PRODUCT.md` | What Octave is, for whom, scope and non-goals, roadmap | stable |
| `ARCHITECTURE.md` | Stack, system shape, engines, Jellyfin API usage, invariants | stable |
| `DOMAINS.md` | Bounded contexts, ownership, dependency rules, ubiquitous language | stable |
| `DESIGN.md` | Design system: principles, tokens, components, interaction, voice, accessibility | stable |
| `WORKFLOW.md` | This file | stable |
| `docs/security.md` | The token and network boundary, each claim with its test or task | as needed |
| `docs/mpv-options-checklist.md` | What a future libmpv engine must pass | until T13 |
| `tasks/prd.json` | Phases and tasks with acceptance items and `passes` flags; agents change only status fields, through `pnpm task` | living |
| `tasks/backlog.jsonl` | Deferred and newly found work, one JSON object per line (§2a) | living |
| `docs/specs/<TASK-ID>.md` | Per-task spec written by `refiner`, with the `spec-checker` verdict appended; the first spec creates the folder | one per task |
| `docs/specs/<TASK-ID>.tests.json` | The frozen-test manifest the `test-writer` commits with the failing tests (§2b) | one per task |
| `tasks/product-owner-log.md` | One dated section per Product Owner pass: each decision, its backlog entry, its approval, its reason (§2c) | living |
| `docs/plans/active/`, `docs/plans/completed/` | Execution plans for work that needs more than one session; the first plan creates the folder | one per initiative |
| `docs/decisions/NNNN-slug.md` | Decision records for choices that would otherwise be re-litigated; history, never rewritten (later changes are dated amendments) | ~1 page each |

The desktop app, its specs, plans, and task list live only in the tag `desktop-tauri-final`.

## The unit of work

Every change follows the same lifecycle. Small changes compress steps; they do not skip verification.

### 1. Intent (owner or Product Owner)

A task in `tasks/prd.json` with acceptance items, or a brief with four headings: **Goal**, **Context**, **Constraints** (which invariants it touches), and **Done when**.

### 2. Execution plan (agent drafts, owner approves)

For work spanning more than one session or more than one domain, create `docs/plans/active/NNN-slug.md` from the `exec-plan` skill's template: goal and done when, domains touched, milestones each with a validation command, progress, decision log, surprises, validation evidence, and the outcome. When the work merges, move the plan to `completed/`.

### 2a. Refine and spec (per task)

Each task runs: refine + spec → spec check → failing tests → implement → verify → one review round → ship (the full order is in "The task flow, in the order it runs").

- `refiner` writes every task spec: Fable 5.2 for a high-risk task, Opus 5.5 otherwise. The Product Owner does not write specs.
- `refiner` reads the task (`pnpm task show <id>`), its plan, and the relevant code and docs. It writes only `docs/specs/<TASK-ID>.md`: goal; acceptance items mapped to how each is met and tested; files to touch; approach; test plan; risks and out of scope; validation commands; and, for every dependency the task adopts, the maintenance check from primary sources.
- `spec-checker` runs in a fresh context against the task, the `AGENTS.md` hard rules, `ARCHITECTURE.md`, `DESIGN.md` (for UI), and the code. It appends a verdict: "Approved" or "Changes needed" with numbered issues.
- Allow one revision round. If the spec is still not approved, stop and ask the owner.
- Work a task defers goes to `tasks/backlog.jsonl` in the same pull request, as one JSON line with:
  - `what`
  - `why`
  - `source` (a task id, PR, commit, or doc)
  - `size` (`S`, `M` or `L`)
  - `date` (`YYYY-MM-DD`)
  - optionally `taken_by`, a task id
- Append only, at the end of the file, and never delete or rewrite another entry.
- When a task takes an entry, set `taken_by` on that line in the task's pull request.
- A deferral names a task or a backlog entry.
- `P…` sources refer to the desktop task list in the tag `desktop-tauri-final`.
- Git merges the file with `union`, and `pnpm check` validates it. `pnpm lint:backlog` validates it alone.

### 2b. Tests first

After the spec check and before implementation, `test-writer` turns each acceptance item into a failing test and commits the tests with a manifest, `docs/specs/<TASK-ID>.tests.json`, as one commit (`test(<ID>): freeze failing acceptance tests`).

- The manifest lists the frozen `files` and one entry per acceptance item: a `run` (an argument list starting with `node` or `pnpm` that selects only that item's tests) or a `gate`. A gate is for an item that cannot be a failing test (`owner`, `device`, `review`, `ci`, or `met` for one already true on `main`); the spec's Acceptance row must say `gate: <kind>`, and `scripts/check-red.mjs` refuses any other.
- The **red gate** (`node scripts/check-red.mjs <ID>`) runs every `run`. If one passes before any implementation exists, the run stops with `tests-green`: either the behavior exists (the refiner marks it a `met` gate) or the test is weak (fix it and rerun from the Tests step, which amends the freeze commit). A broken manifest is retried once, then blocks the task.
- The implementer, the follow-ups step and the CI fix may not change or delete a frozen file; they add tests in new files. A wrong frozen test is returned in `frozenTestProblems`, and the Product Owner (Fable 5.2) rules once per task: to change a test it commits with `Frozen-Test-Change: <path> -- <reason>`, and the PR's Frozen tests section names the change.
- `pnpm lint:flow` (`scripts/check-flow.mjs`) runs after every implementer step and in CI. It fails when a frozen file differs from the test writer's or Product Owner's version. It reads only git history, so it cannot see an amend into the freeze commit; the run pins the frozen blobs from the red gate and stops on a moved one. CI has no such pin.
- After the follow-ups, `check-red.mjs --expect green` reruns every `run`, so a command that `pnpm check` does not cover cannot ship red.
- A branch implemented before this flow runs with `preFlow: true`; CI requires no manifest.

### 2c. Product Owner pass

A Product Owner pass (`.claude/workflows/product-owner.js`, Fable 5.2) triages `tasks/backlog.jsonl` entries without `taken_by` into `tasks/prd.json`, and is the only step that adds, splits, reorders or drops tasks. It works through `scripts/task-owner.mjs`, which changes no status field and has no operation for the `rules`.

- **Scope edits.** The Product Owner approves an acceptance edit that changes scope only (a path, a split, a dependency, what a task covers): the edit operation gives `scope`, its reason, and needs no approval file.
- **Owner edits.** An acceptance edit that changes on-screen wording or copy, look, or product direction needs an owner approval file naming the task (`owner_approval`: a `docs/specs/decisions-*.md` or `docs/decisions/*.md` file), and so does any edit of `human` or `verify`. It logs each decision, each scope edit with its reason, in `tasks/product-owner-log.md` and commits with a `Product-Owner-Pass:` trailer; `pnpm lint:flow` fails a task list change without both. The PR lists every decision; the owner can veto any of it, and the next pass reverts a veto and logs it.

## The task flow, in the order it runs

1. **Product Owner pass.** Backlog triage into the task list, with a log line and a veto for the owner. Outside the per-task run; it runs when the backlog has untaken entries.
2. **Spec.** `refiner` writes `docs/specs/<ID>.md`.
3. **Check.** A fresh `spec-checker` appends its verdict; only critical or high issues block.
4. **Tests.** `test-writer` commits the failing tests and the manifest. Red gate: the run stops with `tests-green` if one already passes.
5. **Implement.** `implementer` or `native-engineer` makes the tests pass without changing them and runs the verify skill. Frozen-test gate after the step.
6. **Review.** One review round, with a `guardian` on high-risk paths; the reviewer also judges whether the frozen tests test their items. The follow-ups step fixes and logs, then the frozen-test gate and the green gate (`check-red.mjs --expect green`) run.
7. **Ship.** The PR, with a Frozen tests section, auto-merge on green CI (`pnpm lint:flow` runs in CI); the run stops on a denied command, `tests-green` or `frozen-tests`.

### 3. Pilot before scale

For any repeated or mechanical change, do two or three units first, review them closely, and fix the plan or the docs. Then let agents do the rest.

### 4. Implement

- One milestone per commit. Conventional Commit subjects.
- **Stop and fix.** After each milestone run the relevant checks; a red check is fixed before the next milestone starts.
- Never stub, skip, or delete a test to make a check pass. Never write a paragraph-long comment justifying a workaround; fix the cause or record it in the plan's decision log.

### 5. Verify (agent, with evidence)

Minimum before asking for review:

```sh
mise exec -- pnpm check
```

`pnpm check` runs the import-boundary lint, ESLint, the ghost-term check, the flow check (frozen tests and the task list), the core's Vitest suite in Node (the task-list validator included), the type-check, and the task workflow's tests. Add, as each exists and as the change needs it:

| Change | Command | From |
|---|---|---|
| Negotiation, reporting, or anything the server sees | `pnpm test:tripwire` against the pinned servers | today |
| Kotlin or an Expo native module | `pnpm tv:native:test` (JVM tests) | T3-01 |
| The core on the device | `pnpm tv:e2e` (Hermes conformance, focus test) | T3-02 |
| Any request the app sends | `pnpm tv:wire` against the pinned Jellyscale | T3-05 |
| Anything visible | `pnpm tv:visual`; attach the changed images | T3-07 |

The PR or plan records the commands run and their results. "Tests pass" without output is not evidence. A Shield check is the owner's: the task says so and is left `blocked` until the owner reports it.

### 6. Independent review (fresh context)

The implementer never reviews its own work. Run one review round. Fix critical, high, and medium findings; log lows in the active plan. A separate agent with a fresh context reviews the diff against the task and plan, looking for:

- correctness bugs and missed edge cases
- violations of the invariants in `ARCHITECTURE.md` and the dependency rules in `DOMAINS.md`
- stubs, skipped tests, or justified workarounds
- tokens or authenticated URLs in logs, errors, props, or events

Any diff on a high-risk path (the core's negotiation, gateway, player and redaction code, `modules/player` from T8-01, the native HTTP client from T3-03, `docs/security.md`) also gets a `guardian` review.

### 7. Owner gate

The owner reviews **intent and design**, not every line:

- Does this do what the task asked, and nothing more?
- Does it touch the direct-play policy, a native method, token handling, or redaction? If so, read those lines.
- Which device, Jellyfin, or Jellyscale gates are untested? (Listed in the PR, per `AGENTS.md`.)

### 8. Ship

The agent opens the PR, waits for CI, and merges with the `ship` skill. The PR calls out any change to an invariant, `docs/security.md`, release signing, or CI.

### 9. Retrospective

If the change needed correction, ask: what capability or rule was missing? Promote the answer into a test, lint, hook, or doc line.

## Oracles

Octave's verifiers, from cheapest to most authoritative. New work should land a check at the cheapest level that can catch its failure.

| Level | Oracle | Catches | From |
|---|---|---|---|
| Type | TypeScript strict; Kotlin types | Shape errors | today; Kotlin T3-01 |
| Lint | dependency-cruiser layer rules, ESLint, the ghost-term check; the native network build check | Layering, platform leaks, desktop-era text; default Media3 data sources, stray HTTP clients | today; T3-04 |
| Unit | Vitest on the core in Node; JVM tests for Kotlin | Logic, policy flags, URL rules, redaction | today; T3-01 |
| Contract | Recorded Jellyfin 10.11 and 12.4 responses and Jellyscale as fixtures; gateway tests assert request bodies *and* query strings | API drift, silent conversion flags | today |
| Shared vectors | `packages/core/tests/fixtures/hls-master-urls.json`, `hls-playlists.json`, `host-classes.json`: every validator on every platform passes all three | Drift between the TypeScript rules and each native validator | today (TypeScript); Kotlin T3-03, T8-08 |
| **Server tripwire** | `pnpm test:tripwire` (`tests/integration/tripwire.ts`) plays every sample through the real gateway against pinned Jellyfin 10.11.7 and 12.4 (`tests/integration/docker-compose.yml`), watching ffmpeg in the container, `/Sessions` `TranscodingInfo`, and the transcode logs. Every playable sample must direct play with no job; the disc folder, the ISO, and a forced-limit run must convert with an indicator reason over same-origin, credential-free HLS; no job may outlive the stopped report by 10 s. Per device capability set and against Jellyscale from T2-09 | **The core invariant, independent of any UI** | today |
| Device | The core's conformance suite under Hermes on the emulator; the 500-press scripted focus test | Host divergence (URL, crypto); focus jumps | T3-02, T3-10 |
| **Wire** | `pnpm tv:wire`: tagged tests on the emulator against the pinned Jellyscale record every request and fail on one without the header, a credential in a URL, a followed redirect, or another origin. A playback task passes only when its wire test passes | Token leaks and unauthenticated paths, end to end | T3-05, T10-01 |
| Visual | Fixture screens at 1920×1080 compared with CI baselines | Unintended look changes | T3-07 |
| Shield (owner) | The owner's Nvidia Shield and a cheap Google TV box | HDR, passthrough, feel, performance budget | T0-06, the Shield checks |

Make check output agent-friendly: short summaries on stdout, full logs to files, `ERROR` on the same line as the cause so it can be grepped.

## Mechanical enforcement backlog

Rules stated in prose that should become checks:

- **Playback policy.** A test that fails unless body and query carry the policy's flags, and a test that fails if the DeviceProfile gains a codec or container condition or an `Hls` subtitle profile.
- **No generic player bridge.** The port and module allowlist tests (T2-05, T8-01).
- **No default network path.** The native build check (T3-04).
- **Redaction canaries across the JavaScript and native seam** (T3-05, T10-02).
- **File size.** Flag source files over ~400 lines.

Done and enforced today: dependency direction (`pnpm lint:boundaries`, which fails on zero modules read), no desktop-era terms (`pnpm lint:ghost-terms`), frozen tests and Product Owner changes to the task list (`pnpm lint:flow`), the task list's shape (`scripts/prd.test.ts`), the task file's size and evidence length (`scripts/task.test.ts`), and the backlog's shape (`scripts/check-backlog.test.ts`).

## Model routing

Pick the cheapest model that finishes the job **without rework**. Optimize cost per merged change, not cost per request.

Relative API list prices (per million input/output tokens, as of 2026-10):

| Model | In / out $ per MTok | Relative to Sonnet |
|---|---|---|
| Haiku 5.5 | $0.10 / $0.50 | ~1/20 |
| Sonnet 5.5 | $2 / $10 | 1× |
| Opus 5.5 | $4 / $20 | 2× |
| Fable 5.1 | $10 / $50 | 5× |

### Who does what

| Stage / work | Model | Agent |
|---|---|---|
| Codebase search, CI log triage, commit messages, watching PRs, doc-gardening detection | **Haiku 5.5** | `scout`, `ci-triage` |
| Refine + spec and spec check, routine tasks | **Opus 5.5** | `refiner`, `spec-checker` |
| Refine + spec and spec check, high-risk tasks (native, security, architecture, decision records) | **Fable 5.2** | `refiner`, `spec-checker` with a spawn-time `model: fable` override |
| Backlog triage, priorities, scope-level acceptance edits, and frozen-test rulings (T1-12); never task specs | **Fable 5.2** | `product-owner` |
| Failing acceptance tests before implementation | **Sonnet 5.5**; Opus 5.5 for Kotlin | `test-writer` |
| Kotlin, Expo native modules, Media3, the native HTTP client | **Opus 5.5** | `native-engineer` |
| TypeScript implementation and tests | **Sonnet 5.5** | `implementer` |
| Verify | **Sonnet 5.5** | coordinator or `implementer` |
| Review, routine diffs | **Sonnet 5.5** | `reviewer` |
| Review: native, token, redaction, or negotiation diffs | **Opus 5.5** | `guardian` |
| Plans and decision records | **Opus 5.5** | `planner` |
| Coordinator (one fresh session per task) | **Sonnet 5.5** | main session |
| Escalation after two failed attempts at the same problem | one tier up; **Fable 5.2** after Opus | any |

### Rules

1. **Effort before model.** Try a stronger model at lower effort before a cheaper model at high effort.
2. **Escalate on evidence.** Two failed attempts at the same milestone means move up a tier (or fix the brief).
3. **De-escalate once the pattern exists.** Opus pilots, Sonnet scales. Haiku maintains.
4. **Switch models only at task boundaries.** Prompt caches are per model.
5. **Reviewer >= implementer on risky paths.** Native, policy, and security diffs get `guardian`.
6. **Measure.** Note the model and approximate cost on each completed plan's retrospective.

### Wiring it up in Claude Code

`.claude/workflows/task.js` runs tasks in order through Spec, Check, Tests, Implement, Review, and Ship. Start it with the Workflow tool (`args: {tasks: ["T3-01", "T3-02"], risk: "routine" | "high", native: false}`). It builds each task's worktree as `../octave-<TASK-ID>` on the branch `task/<TASK-ID>` from the repository name. Its tests: `pnpm test:workflow`.

- The owner makes every look, wording, and direction call; the Product Owner approves scope-level acceptance edits, and the owner can veto them. Before a batch, a Fable pass collects the batch's design questions into `docs/specs/decisions-<phase>.md` and the owner answers them in one sitting.
- A task whose spec still needs a new design call is parked with its questions, and the run moves on.
- The spec check blocks only on critical or high issues; medium and low issues go to the implementer.
- Native work (Kotlin under `modules/` or `apps/tv/android`, from T3-01) routes to `native-engineer`, and any diff on a high-risk path adds a `guardian` review.
- The run stops early on a denied command, on a test that passes before implementation (`tests-green`), and on a changed frozen test (`frozen-tests`). `.claude/workflows/product-owner.js` runs a Product Owner pass.

Subagent definitions under `.claude/agents/*.md` set `model` in their frontmatter:

| Agent | Model | Role |
|---|---|---|
| `scout` | haiku | Read-only search and summarization |
| `ci-triage` | haiku | Read failing check output, return the cause and the file:line |
| `refiner` | opus | Refine one task and write `docs/specs/<TASK-ID>.md` |
| `spec-checker` | opus | Fresh-context spec check; appends the verdict |
| `implementer` | sonnet | Execute one TypeScript milestone from the approved spec |
| `reviewer` | sonnet | Fresh-context review of routine diffs |
| `native-engineer` | opus | Kotlin, Expo native modules, Media3, and the native HTTP client |
| `guardian` | opus | Review of policy, native-method, token, and redaction changes |
| `planner` | opus | Execution plans and decision records |
| `test-writer` | sonnet | Failing acceptance tests and the manifest, before implementation |
| `product-owner` | fable | Backlog triage, priorities, scope-level acceptance edits, and frozen-test rulings |

What the Claude Code docs say (https://code.claude.com/docs/en/sub-agents): the frontmatter `model` field accepts the aliases `sonnet`, `opus`, `haiku`, `fable`, a full model ID, or `inherit`; the spawn-time `model` parameter wins over the frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main session's model; the spawn-time parameter takes only an alias.

## Code intelligence tools

Three MCP servers let agents find code without reading whole files. **Rule: locate with tools, then read only the lines you need.**

| Tool | Best at | Use for |
|---|---|---|
| **semble** (`search`, `find_related`) | Search by intent in natural language | First stop when you don't know the symbol name; finding similar code before writing new code |
| **serena** (LSP-backed symbols) | `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `rename_symbol` | Outlining a file before reading it; impact analysis; safe renames during the `packages/core` move (T2-02) |
| **codebase-memory-mcp** (graph) | `get_architecture`, `search_graph`, `trace_path`, `detect_changes` | Architecture overviews, call paths across layers, the symbols a diff touches |

Serena runs the TypeScript language server (`.serena/project.yml`); add Kotlin when T3-01 brings Kotlin source. After large moves, check codebase-memory's `check_index_coverage` before trusting a graph answer.

## Parallel agents

Parallelism helps when work is independent and verifiable. It hurts when everyone is stuck on the same bug or editing the same file.

- **When:** separate domains, or a piloted mechanical change split by file.
- **When not:** the core extraction (T2-02 is the only task in progress while it is open), native module and player work, and anything on the Shield. Keep them serial.
- **Isolation:** one git worktree per agent. Commit only files you own; no `git stash` or `git reset --hard`; force-push only your own unmerged PR branch, with `--force-with-lease`, after a rebase; do not edit another agent's plan.
- **Shared resources:** one agent at a time on the Shield or an emulator serial. Gradle builds are expensive; give each worktree its own build directory.
- **Cap:** two to four concurrent streams.

## Garbage collection

- **Weekly doc-gardening pass:** check that the root docs match the code (commands still run, domains still map to directories, invariants still enforced); open small PRs for drift.
- **Weekly debt pass:** de-duplicate helpers, shrink oversized files, remove dead code; one small PR per finding.
- Promote any repeated review comment into a lint or doc line.

## Anti-patterns

- Declaring done after unit tests alone when the change is visible or reaches the server.
- Editing, skipping, or deleting tests to go green.
- Growing `AGENTS.md` with emphasis instead of turning the rule into a check.
- Long autonomous runs without a plan file.
- Letting an adversarial reviewer push toward speculative abstraction.
- Treating emulator success as evidence about the Shield, or Jellyfin success as evidence about Jellyscale.

## Sources

- Anthropic, *Building a C compiler with a team of parallel Claudes* (2026-02-05). https://www.anthropic.com/engineering/building-c-compiler
- Anthropic, *Effective harnesses for long-running agents* (2025-11-26). https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic, *Harness design for long-running application development* (2026-03-24). https://www.anthropic.com/research/harness-design-long-running-apps
- Anthropic, *Effective context engineering for AI agents* (2025-09-29). https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Claude Code, *Best practices*. https://code.claude.com/docs/en/best-practices
- OpenAI, *Harness engineering: leveraging Codex in an agent-first world* (2026-02-11). https://openai.com/index/harness-engineering/
- OpenAI Cookbook, *Using PLANS.md for multi-hour problem solving*. https://developers.openai.com/cookbook/articles/codex_exec_plans
- Jarred Sumner, *Rewriting Bun in Rust* (2026-07-08). https://bun.com/blog/bun-in-rust
