# Workflow

How Fluster is built: one human steering, coding agents executing. This document adapts practices published by Anthropic, OpenAI, and the Bun team to a small Tauri/Rust + React codebase whose most important property, *never transcode*, can be checked mechanically.

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
| `WORKFLOW.md` | This file | stable |
| `docs/architecture.md`, `docs/security.md`, `docs/validation.md` | Deep detail for the playback core, security boundary, release gates | as needed |
| `tasks/prd.json` | Phases and tasks with acceptance criteria and `passes` flags; agents may only flip status fields | living |
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

The PR or plan records the commands run and their results. "Tests pass" without output is not evidence. User-visible changes are checked by driving the app (Playwright in browser mode, or the native harness), not only by unit tests.

### 6. Independent review (fresh context)

The implementer never reviews its own work. A separate agent with a fresh context reviews the diff against the brief and plan, looking for:

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

The agent opens the PR, waits for CI, and merges with the `ship` skill. Merges rebase onto `main` and delete the branch. The agent merges on its own when CI is green and review left nothing open. It asks the human first when the diff changes an invariant, `docs/security.md`, release signing, or CI itself.

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
| **Server tripwire** | Implemented (P0-04): `pnpm test:tripwire` (`tests/integration/tripwire.ts`) plays every sample through the real `JellyfinGateway` against pinned Jellyfin 10.11.7 and 12.4 in `tests/integration/docker-compose.yml`. It fails on any ffmpeg process in the container, any `/Sessions` `TranscodingInfo`, any `TranscodeManager` command line or `FFmpeg.Transcode-/Remux-/DirectStream-` log file, and any media request that is not `/Videos/{id}/stream?Static=true` or an external subtitle file. Summary on stdout, JSON log in `release-evidence/tripwire/`. CI job `tripwire` (not yet required). | **The core invariant. Language-independent, like Bun's test suite.** |
| Native | Rust tests for the command surface; native harness (`testForceSoftware`) | mpv lifecycle, decoder fallback |
| Hardware (human) | `docs/validation.md` gates on real GPUs and compositors | NVDEC/VA-API/VideoToolbox, Wayland composition, AppImage |

The server tripwire turns the product's defining rule into a pass/fail signal that works no matter what the implementation looks like. Run `pnpm samples:generate && pnpm fixture:up && pnpm fixture:setup` first; the tripwire starts a library scan itself and waits for the server to go quiet before playing.

Make check output agent-friendly: short summaries on stdout, full logs to files, `ERROR` on the same line as the cause so it can be grepped.

## Mechanical enforcement backlog

Rules currently stated in prose that should become checks:

- **Direct-play policy.** A test that scans request construction for `EnableTranscoding`, `EnableDirectStream`, `AllowVideoStreamCopy`, `AllowAudioStreamCopy` and fails on any value other than the frozen policy, in both body and query.
- **No generic mpv bridge.** A Rust test that enumerates registered Tauri commands and fails if the list changes without updating an allowlist in the same commit.
- **Redaction canaries.** Inject a known canary token. Assert it appears in no log, error string, or diagnostic export.
- **Dependency direction.** Done (P0-07): `pnpm lint:boundaries` runs `dependency-cruiser` (`.dependency-cruiser.cjs`) over the layer rules in `DOMAINS.md`, with remediation text in each error; `pnpm check` runs it.
- **Rust pitfalls (enforced).** Clippy denies `debug_assert_with_mut_call`, `unwrap_used` in non-test code, and `undocumented_unsafe_blocks`. Run release-mode tests in CI, not only debug. (Bun's port regressed because a side effect inside `debug_assert!` vanished in release builds.)
- **File size.** Flag source files over ~400 lines; `App.tsx` and `mpv.rs` are the current candidates to split along domain lines.

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

| Work | Model | Why |
|---|---|---|
| Codebase search, "where is X", reading many files to return a conclusion | **Haiku** | Reading-heavy and easy to verify. The answer is a file path, which is cheap to check. |
| Triage of CI / test / clippy output, log summarization | **Haiku** | Extraction, not judgment |
| Doc-gardening *detection* (list where docs and code disagree) | **Haiku** | Produces a list a stronger model or human acts on |
| Commit messages, PR descriptions from a finished diff, changelogs | **Haiku** | Summarization of known content |
| Mechanical fixes with a compiler/lint oracle (formatting, renames, lint autofix follow-through, dependency bumps with green CI) | **Haiku → Sonnet** on failure | The checker decides; escalate only if the loop doesn't converge |
| Implementing a well-specified milestone in React/TS, gateway endpoints, reducers, tests, Playwright journeys | **Sonnet** | The default implementer. Plan and oracle already exist. |
| Scaling a piloted mechanical change after the pilot passed review | **Sonnet** | The pilot removed the ambiguity |
| Routine fresh-context review (UI, catalog, copy, tests) | **Sonnet** | Bounded risk |
| Writing briefs into execution plans, architecture decisions, `DOMAINS.md` / `ARCHITECTURE.md` changes | **Opus** | Mistakes here multiply across every later task |
| **Pilot units** of any mechanical change | **Opus** | The pilot defines the pattern everyone copies |
| Rust native code: `mpv.rs`, `surface/*`, `unsafe`, FFI, threading, GTK/Cocoa main-thread rules | **Opus** | Hard to verify without hardware; bugs crash the process |
| Concurrency in `PlaybackCoordinator` (attempts, cancellation, report queue) | **Opus** | Subtle ordering bugs that unit tests catch only if someone thinks to write them |
| Review of anything touching direct-play policy, the Tauri command surface, tokens, or redaction | **Opus** | Security and core-invariant risk. The reviewer must be at least as capable as the implementer. |
| Debugging after a Sonnet attempt failed twice | **Opus** | Escalation |
| Spikes with no known answer (Wayland subsurface + `gpu-next` HDR, WebView2-over-D3D11 on Windows), or Opus stuck after two attempts | **Fable** | Rare. Reserve for genuinely novel, high-stakes design problems. |

### Rules

1. **Effort before model.** Try a stronger model at `low`/`medium` effort before reaching for a cheaper model at `high`. Raise effort only when a failure shows it is needed.
2. **Escalate on evidence.** Two failed attempts at the same milestone means move up a tier (or fix the brief). Don't start high "just in case".
3. **De-escalate once the pattern exists.** Opus pilots, Sonnet scales. Haiku maintains.
4. **Don't switch models mid-session.** Prompt caches are per model, so ping-ponging throws away cached context. Switch at task boundaries (plan → implement → review), which are natural fresh-context points anyway.
5. **Reviewer ≥ implementer on risky paths.** Sonnet may review Sonnet's UI work. Native, policy, and security diffs get an Opus reviewer.
6. **Measure.** Note the model and approximate cost on each completed plan's retrospective. Adjust this table when the data disagrees with it.

### Wiring it up in Claude Code

Subagent definitions under `.claude/agents/*.md` set `model` in their frontmatter, so routing is configured once instead of remembered. Suggested roster:

| Agent | Model | Role |
|---|---|---|
| `scout` | haiku | Read-only search and summarization |
| `ci-triage` | haiku | Read failing check output, return the cause and the file:line |
| `implementer` | sonnet | Execute one plan milestone in a worktree |
| `reviewer` | sonnet | Fresh-context review of routine diffs against the brief |
| `native-engineer` | opus | Rust/mpv/surface/FFI work |
| `guardian` | opus | Review of policy, command-surface, token, and redaction changes |
| `planner` | opus | Draft execution plans and decision records |

Run the main interactive session on Opus (for steering and planning) at modest effort, and delegate down.

## Code intelligence tools

Three MCP servers let agents find code without reading whole files. That saves context, and it lets cheaper models do navigation work well. **Rule: locate with tools, then read only the lines you need.** Reading a whole 1,100-line `mpv.rs` to find one function is the most common avoidable token spend.

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
  - no `git stash`, `git reset`, or force pushes
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
