# Workflow

How Fluster is built: one human steering, coding agents executing. This document adapts practices published by Anthropic, OpenAI, and the Bun team to a small Tauri/Rust + React codebase whose most important property, *never convert what it can play as stored, and never convert silently*, can be checked mechanically.

Sources are listed at the end. Where a practice is adopted, the reason is stated so it can be dropped when the reason stops being true.

## Principles

1. **The repository is the system of record.** If a decision, constraint, or plan lives only in a chat, a head, or an issue comment, agents cannot see it. Write it into the repo.
2. **Humans steer, agents execute.** The human owns intent (what and why), tradeoffs, saying "no", the merge decision, and the hardware release gates. Agents own implementation, tests, and first-pass review.
3. **The verifier is the ceiling.** Agents reliably reach whatever the checks can distinguish and no further. Invest in oracles before investing in more agent throughput.
4. **Fix the process that generates the code, not the code.** When an agent makes the same class of mistake twice, add a test, lint, hook, or doc line. Do not just hand-patch the output.
5. **Enforce invariants mechanically.** Prose rules are suggestions. A rule that must hold every time becomes a test, a lint, a type, or a hook, and its failure message tells the agent how to fix it.
6. **Keep the harness minimal and re-test it.** Every step in this workflow encodes an assumption about what agents cannot do alone. Revisit those assumptions when models change.

## Documentation map (progressive disclosure)

Agents read the short map first and load detail only when needed.

| File | Role | Size target |
|---|---|---|
| `AGENTS.md` | Rules: short imperative sentences, no justification. Commands, hard rules, pointers. | ≤ ~120 lines |
| `CLAUDE.md` | Imports `AGENTS.md` so Claude Code and Codex share one rulebook | 1 line |
| `.claude/skills/<name>/SKILL.md` | Repeatable processes as short imperative steps; procedures and context in `references/` | ≤ ~60 lines each |
| `PRODUCT.md` | What Fluster is, for whom, scope and non-goals, roadmap | stable |
| `ARCHITECTURE.md` | Stack decision, system shape, Jellyfin API usage, invariants | stable |
| `DOMAINS.md` | Bounded contexts, ownership, dependency rules, ubiquitous language | stable |
| `DESIGN.md` | Design system: principles, tokens, components, interaction, voice, accessibility | stable |
| `WORKFLOW.md` | This file | stable |
| `docs/architecture.md`, `docs/security.md`, `docs/validation.md` | Deep detail for the playback core, security boundary, release gates | as needed |
| `tasks/prd.json` | Phases and tasks with acceptance criteria and `passes` flags; agents may only flip status fields | living |
| `docs/specs/<TASK-ID>.md` | Per-task spec written by `refiner`, with the `spec-checker` verdict appended | one per task |
| `docs/plans/active/`, `docs/plans/completed/` | Execution plans for tasks that need more than one session | one per initiative |
| `docs/decisions/NNNN-slug.md` | Short architecture decision records for choices that would otherwise be re-litigated | ~1 page each |

`AGENTS.md` should link to the five root documents and contain only what the code cannot say: exact commands, the hard rules, and gotchas that have been corrected at least twice.

## The unit of work

Every change follows the same lifecycle. Small changes compress steps; they do not skip verification.

### 1. Intent (human)

Write a brief with four headings: **Goal**, **Context** (links to the domain and docs), **Constraints** (which invariants it touches), and **Done when** (observable, checkable outcomes). A GitHub issue is fine; a plan file is required for anything multi-step.

### 2. Execution plan (agent drafts, human approves)

For work spanning more than one session or more than one domain, create `docs/plans/active/NNN-slug.md`:

```markdown
# NNN: <title>
## Goal / Done when
## Context and domains touched
## Milestones          (each independently verifiable, with its validation command)
## Progress            (- [x] checkboxes, updated as work lands)
## Decision log        (date — decision — why)
## Surprises & discoveries
## Validation evidence (commands run and their results)
## Outcome & retrospective
```

The plan is a living document. An agent starting a fresh session reads the plan, the git log, and runs the smoke check before touching code. When the work merges, move the plan to `completed/`.

### 2a. Refine and spec (per task)

Each task runs: refine + spec → spec check → implement → verify → one review round → ship.

- `refiner` reads the task in `tasks/prd.json`, its plan, and the relevant code and docs. It writes only `docs/specs/<TASK-ID>.md`: goal; acceptance items mapped to how each is met and tested; files to touch; approach; test plan; risks and out of scope; validation commands.
- `spec-checker` runs in a fresh context. It checks the spec against the task acceptance, `AGENTS.md` hard rules, `ARCHITECTURE.md`, `DESIGN.md` (for UI), and the code. It appends a verdict: "Approved" or "Changes needed" with numbered issues.
- Allow one revision round. If the spec is still not approved, stop and ask the human.
- Implement from the approved spec.
- Work a task defers goes to `tasks/backlog.md` in the same pull request: one line with what, why, where it came from, and a rough size. A deferral names a task or a backlog entry, or it is not a deferral.

### 3. Pilot before scale

For any repeated or mechanical change (a new set of API endpoints, a refactor across modules, a new platform surface), do two or three units first, review them closely, and fix the plan or the docs. Then let agents do the rest. This is how Bun ported 1,448 files: three pilot files first, then a corrected porting guide.

### 4. Implement

- One milestone per commit. Conventional Commit subjects.
- **Stop and fix.** After each milestone run the relevant checks; a red check is fixed before the next milestone starts.
- Write the test that fails first when the behavior is checkable.
- Never stub, skip, or delete a test to make a check pass. Never write a paragraph-long comment justifying a workaround; fix the cause or record it in the plan's decision log.

### 5. Verify (agent, with evidence)

Minimum before asking for review:

```sh
pnpm check
pnpm test:e2e
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

For visible UI changes also run `pnpm test:visual`. It writes screenshots to `visual-captures/<width>x<height>/` and a contact sheet at `visual-captures/index.html`; attach the affected captures to the PR. It is output only and not part of `pnpm check` or CI.

The PR or plan records the commands run and their results. "Tests pass" without output is not evidence. User-visible changes are checked by driving the app (Playwright in browser mode, or the native harness), not only by unit tests.

### 6. Independent review (fresh context)

The implementer never reviews its own work. Run one review round. Fix critical, high, and medium findings; log lows in the active plan instead of re-reviewing. A separate agent with a fresh context reviews the diff against the brief and plan, looking for:

- correctness bugs and missed edge cases
- violations of the invariants in `ARCHITECTURE.md` and dependency rules in `DOMAINS.md`
- stubs, skipped tests, or justified workarounds
- secrets, tokens, or authenticated URLs in logs or errors

Tell the reviewer to skip style. Adversarial reviewers always find *something*. The human decides which findings justify more complexity.

### 7. Human gate

The human reviews **intent and design**, not every line:

- Does this do what the brief asked, and nothing more?
- Does it touch the direct-play policy, the native command surface, token handling, or redaction? If so, read those lines.
- Which hardware/compositor/Jellyfin gates are untested? (List them explicitly in the PR, per `AGENTS.md`.)

### 8. Ship

The agent opens the PR, waits for CI, and merges with the `ship` skill. Merges rebase onto `main` and delete the branch. The agent enables auto-merge and merges when CI is green. The PR calls out any change to an invariant, `docs/security.md`, release signing, or CI itself.

### 9. Retrospective

If the change needed correction, ask: what capability or rule was missing? Promote the answer into a test, lint, hook, or doc line in the same PR or a follow-up.

## Oracles

These are Fluster's verifiers, from cheapest to most authoritative. New work should land a check at the cheapest level that can catch its failure.

| Level | Oracle | Catches |
|---|---|---|
| Type | TypeScript strict, Rust types, narrow Tauri commands | Shape errors, invalid commands |
| Unit | Vitest (reducers, gateway, planning), `cargo test` | Logic, policy flags, URL redaction, track mapping |
| Contract | Recorded Jellyfin responses as fixtures; gateway tests assert request bodies *and* query strings | API drift, silent transcode flags |
| Component | Testing Library on views | Rendered interaction |
| Journey | Playwright against browser mode with a mocked server | User flows end to end |
| **Server tripwire** | Decision 0002 rules (P10-09): `pnpm test:tripwire` (`tests/integration/tripwire.ts`) plays every sample through the real `JellyfinGateway` against pinned Jellyfin 10.11.7 and 12.4 in `tests/integration/docker-compose.yml`, watching ffmpeg processes in the container, `/Sessions` `TranscodingInfo`, and `TranscodeManager` command lines and `FFmpeg.*` log files. Every playable sample must direct play with no job signal and only `/Videos/{id}/stream` requests with exactly one `Static=true` or external subtitle files, never redirected. The BluRay folder, the ISO, and a forced-limit H.264 run must come back DirectStream or Transcode with an indicator reason, request only same-origin `master.m3u8`, `main.m3u8`, and `hls1/` URLs with no credential parameter and `EnableTrickplay=false`, agree with `/Sessions` `PlayMethod` and `TranscodingInfo.IsVideoDirect`/`IsAudioDirect`, and leave no job 10 s after the stopped report. The `fluster-noconv` user must get `conversion-not-allowed`. Liveness checks fail the run if the Jellyfin log does not grow, `/Sessions` never shows the playback, or a poll errors. Summary on stdout, JSON log in `release-evidence/tripwire/`. CI job `tripwire`, required through `linux-wayland-beta`; details in `docs/validation.md`. | **The core invariant. Language-independent, like Bun's test suite.** |
| Native | Rust tests for the command surface; native harness (`testForceSoftware`) | mpv lifecycle, decoder fallback |
| Hardware (human) | `docs/validation.md` gates on real GPUs and compositors | NVDEC/VA-API/VideoToolbox, Wayland composition, AppImage |

The server tripwire turns the product's defining rule into a pass/fail signal that works no matter what the implementation looks like. Run `pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup` first; the tripwire starts a library scan itself and waits for the server to go quiet before playing.

Make check output agent-friendly: short summaries on stdout, full logs to files, `ERROR` on the same line as the cause so it can be grepped.

## Mechanical enforcement backlog

Rules currently stated in prose that should become checks:

- **Playback policy.** A test that scans request construction for `EnableTranscoding`, `EnableDirectStream`, `AllowVideoStreamCopy`, `AllowAudioStreamCopy` and fails unless body and query carry the same values as the policy, and a test that fails if the DeviceProfile gains a codec or container condition or an `Hls` subtitle profile.
- **No generic mpv bridge.** A Rust test that enumerates registered Tauri commands and fails if the list changes without updating an allowlist in the same commit.
- **Redaction canaries.** Inject a known canary token. Assert it appears in no log, error string, or diagnostic export.
- **Dependency direction.** Done (P0-07): `pnpm lint:boundaries` runs `dependency-cruiser` (`.dependency-cruiser.cjs`) over the layer rules in `DOMAINS.md`, with remediation text in each error; `pnpm check` runs it.
- **Rust pitfalls (enforced).** Clippy denies `debug_assert_with_mut_call`, `unwrap_used` in non-test code, and `undocumented_unsafe_blocks`. Run release-mode tests in CI, not only debug. (Bun's port regressed because a side effect inside `debug_assert!` vanished in release builds.)
- **File size.** Flag source files over ~400 lines; `App.tsx` is the current candidate to split along domain lines.

## Model routing

Pick the cheapest model that finishes the job **without rework**. Optimize cost per merged change, not cost per request. A cheap run that needs three retries and a human rescue costs more than one capable run.

Relative API list prices (per million input/output tokens, as of 2026-10). Subscription usage is weighted by model in a similar way, so the ratios are the useful part:

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
| Refine + spec and spec check, routine tasks (screens, docs, tests) | **Opus 5.5** | `refiner`, `spec-checker` |
| Refine + spec and spec check, high-risk tasks (native, security, architecture, ADRs: e.g. P3-01, P12-02, P2-06, #12) | **Fable 5.2** | `refiner`, `spec-checker` with a spawn-time `model: fable` override |
| Native Rust implementation (`player/*`, `surface/*`, `unsafe`, FFI, threading) | **Opus 5.5** | `native-engineer` |
| TypeScript implementation, tests, Playwright journeys | **Sonnet 5.5** | `implementer` |
| Verify | **Sonnet 5.5** | coordinator or `implementer` |
| Review, routine diffs | **Sonnet 5.5** | `reviewer` |
| Review: native, Tauri command, token/redaction, or negotiation-security diffs | **Opus 5.5** | `guardian` |
| Plans and decision records | **Opus 5.5** | `planner` |
| Coordinator (one fresh session per task; specs and plans live in the repo) | **Sonnet 5.5** | main session |
| Escalation after two failed attempts at the same problem | one tier up; **Fable 5.2** after Opus | any |

### Rules

1. **Effort before model.** Try a stronger model at `low`/`medium` effort before reaching for a cheaper model at `high`. Raise effort only when a failure shows it is needed.
2. **Escalate on evidence.** Two failed attempts at the same milestone means move up a tier (or fix the brief). Don't start high "just in case".
3. **De-escalate once the pattern exists.** Opus pilots, Sonnet scales. Haiku maintains.
4. **Switch models only at task boundaries.** Prompt caches are per model. Start a fresh coordinator session per task.
5. **Reviewer >= implementer on risky paths.** Sonnet may review Sonnet's UI work. Native, policy, and security diffs get `guardian`.
6. **Measure.** Note the model and approximate cost on each completed plan's retrospective. Adjust this table when the data disagrees with it.

### Wiring it up in Claude Code

`.claude/workflows/task.js` runs tasks in order through Spec, Check, Implement, Review, and Ship. Start it with the Workflow tool (`args: {tasks: ["P13-08", "P13-09"], risk: "routine" | "high", native: false}`) and watch it in `/workflows`. The script moves between stages, so the coordinator spends no tokens on handoffs.

- The human makes every design call. Before a batch, a Fable pass collects the batch's design questions into `docs/specs/decisions-<phase>.md` and the human answers them in one sitting; every spec treats those answers as settled.
- A task whose spec still needs a new design call is parked with its questions, and the run moves on. Answer, then run it again with `{task, from: "check"}`.
- The spec check blocks only on critical or high issues; medium and low issues go to the implementer.
- The implementer runs the verify skill itself. A step that is not green gets one retry, then one attempt on Fable.
- The run stops early only on a denied command. Red CI after the Fable attempt is returned for the human.

Subagent definitions under `.claude/agents/*.md` set `model` in their frontmatter, so routing is configured once instead of remembered.

| Agent | Model | Role |
|---|---|---|
| `scout` | haiku | Read-only search and summarization |
| `ci-triage` | haiku | Read failing check output, return the cause and the file:line |
| `refiner` | opus | Refine one task and write `docs/specs/<TASK-ID>.md` |
| `spec-checker` | opus | Fresh-context spec check; appends the verdict |
| `implementer` | sonnet | Execute one milestone from the approved spec |
| `reviewer` | sonnet | Fresh-context review of routine diffs against the brief |
| `native-engineer` | opus | Rust/mpv/surface/FFI work |
| `guardian` | opus | Review of policy, command-surface, token, and redaction changes |
| `planner` | opus | Draft execution plans and decision records |

High-risk specs use Fable: the coordinator passes `model: fable` when spawning `refiner` and `spec-checker`.

What the Claude Code docs say (https://code.claude.com/docs/en/sub-agents):

- The frontmatter `model` field accepts the aliases `sonnet`, `opus`, `haiku`, `fable`; a full model ID such as `claude-opus-5-5`; or `inherit`.
- Order of precedence: the spawn-time `model` parameter, then the frontmatter, then `CLAUDE_CODE_SUBAGENT_MODEL`, then the main session's model.
- The spawn-time parameter takes only an alias, not a full ID or `inherit`.
- Checked on 2026-11-10: a subagent spawned with `model: fable` reported `claude-fable-5-2` (Fable 5.2), so the alias already selects 5.2. To pin a version, set the full model ID in the agent's frontmatter.

## Code intelligence tools

Three MCP servers let agents find code without reading whole files. That saves context, and it lets cheaper models do navigation work well. **Rule: locate with tools, then read only the lines you need.** Reading a whole 1,000-line file to find one function is the most common avoidable token spend.

| Tool | Best at | Use for | Typical caller |
|---|---|---|---|
| **semble** (`search`, `find_related`) | Search by *intent* ("where is the subtitle URL validated?") in natural language | First stop when you don't know the symbol name; finding similar code before writing new code (dedupe) | Haiku `scout`, any agent starting a task |
| **serena** (LSP-backed symbols) | Exact symbol work: `find_symbol`, `get_symbols_overview`, `find_referencing_symbols`, `rename_symbol`, `replace_symbol_body`, `get_diagnostics_for_file` | Outlining a file before reading it; impact analysis ("who calls `createPlaybackPlan`?"); safe renames and moves during the `DOMAINS.md` layout migration; checking type errors without a full build | Sonnet `implementer`, Opus `native-engineer` |
| **codebase-memory-mcp** (graph) | Structure across the whole repo: `get_architecture`, `search_graph`, `trace_path`, `query_graph`, `detect_changes`, `manage_adr` | Architecture overviews at session start; tracing call paths across layers (UI → coordinator → gateway → Rust command); checking that a diff respects the `DOMAINS.md` dependency rules; storing decision records | Opus `planner` / `guardian`, doc-gardening passes |

Suggested order for an unfamiliar task:

1. Get the shape: `get_architecture` (codebase-memory).
2. Find the area: `semble search` with the intent.
3. Outline the files: `get_symbols_overview` (serena).
4. Read specific bodies: `find_symbol` with bodies, or `get_code_snippet`.
5. Check impact before editing: `find_referencing_symbols` or `trace_path`.
6. Fall back to Grep only for literals (e.g. `api_key`, error strings).

Setup notes:

- **Serena** runs both `typescript` and `rust` language servers (`.serena/project.yml`). Rust needs rust-analyzer for the pinned toolchain: `rustup component add rust-analyzer --toolchain 1.95.0`. It is kept out of `rust-toolchain.toml` so CI doesn't download it. Decide whether `.serena/project.yml` is committed (shared config); today `.serena/` is untracked.
- **codebase-memory-mcp** auto-refreshes this project's index. After large moves, check `check_index_coverage` before trusting a graph answer.
- Use `detect_changes` (codebase-memory) in review to list affected symbols and callers. Give that list to the reviewer instead of making it read the whole diff context.
- Decision records can live in `docs/decisions/` *or* in codebase-memory's `manage_adr`. Pick one. The repo file wins by default because the repo is the system of record.

## Parallel agents

Parallelism helps when work is independent and verifiable. It hurts when everyone is stuck on the same bug or editing the same file.

- **When:** separate domains (catalog UI vs. playstate reporting vs. release packaging), or a piloted mechanical change split by file.
- **When not:** native surface and mpv work. It needs real hardware and a human watching the screen. Keep it serial.
- **Isolation:** one git worktree per agent. Rules every parallel agent follows:
  - commit only files you own
  - no `git stash` or `git reset --hard`; force-push only your own unmerged PR branch, with `--force-with-lease`, after a rebase
  - do not edit another agent's plan
  - pull and rebase before pushing
- **Claiming:** when running more than two agents from a plan, each claims a milestone by writing its name under that milestone in the plan file and committing. Git conflicts tell the loser to pick another.
- **Shared resources:** Rust builds are expensive. Use a per-worktree `CARGO_TARGET_DIR` or `sccache`. Do not let several agents run `cargo` against one target directory at once.
- **Cap:** two to four concurrent streams. Beyond that, human review, not agent capacity, is the bottleneck.

## Garbage collection

Agents copy existing patterns, including bad ones. Schedule cleanup instead of letting it accumulate.

- **Weekly doc-gardening pass:** check that the five root docs match the code (commands still run, domains still map to directories, invariants still enforced); open small PRs for drift.
- **Weekly debt pass:** de-duplicate helpers, shrink oversized files, remove dead code; one small PR per finding.
- Promote any repeated review comment into a lint or doc line.

Only schedule a recurring task after it has worked reliably when run by hand.

## Anti-patterns

- Declaring done after unit tests or `curl` alone when the change is user-visible.
- Editing, skipping, or deleting tests to go green.
- Growing `AGENTS.md` with emphasis (ALL CAPS) instead of turning the rule into a check.
- Long autonomous runs without a plan file: work is lost at context resets.
- Letting an adversarial reviewer push toward speculative abstraction.
- Running agents with unrestricted shell on the host. Use the sandbox or a container for long autonomous runs.
- Treating browser-mode success as evidence about native playback.

## Sources

- Anthropic, *Building a C compiler with a team of parallel Claudes* (2026-02-05). https://www.anthropic.com/engineering/building-c-compiler
- Anthropic, *Effective harnesses for long-running agents* (2025-11-26). https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Anthropic, *Harness design for long-running application development* (2026-03-24). https://www.anthropic.com/research/harness-design-long-running-apps
- Anthropic, *Redesigning source control at Anthropic* (2026-10-13). https://www.anthropic.com/research/redesigning-source-control
- Anthropic, *Effective context engineering for AI agents* (2025-09-29). https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Claude Code, *Best practices*. https://code.claude.com/docs/en/best-practices
- OpenAI, *Harness engineering: leveraging Codex in an agent-first world* (2026-02-11). https://openai.com/index/harness-engineering/ (read via a mirror; original returned 403)
- OpenAI Cookbook, *Using PLANS.md for multi-hour problem solving*. https://developers.openai.com/cookbook/articles/codex_exec_plans
- OpenAI, *Run long horizon tasks with Codex*. https://developers.openai.com/blog/run-long-horizon-tasks-with-codex
- Jarred Sumner, *Rewriting Bun in Rust* (2026-07-08). https://bun.com/blog/bun-in-rust, and oven-sh/bun PR #30412 and `REVIEW.md`
