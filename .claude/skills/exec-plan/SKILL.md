---
name: exec-plan
description: Create, resume, or close a Fluster execution plan. Use for work that spans more than one session or more than one domain, or when claiming a milestone in parallel work.
---

# Execution plans

## Create

- Use Opus.
- Number the plan after the highest existing number in `docs/plans/`.
- Create `docs/plans/active/NNN-slug.md` from `references/template.md`.
- Write "Done when" as observable, checkable outcomes.
- Name the domains and invariants the work touches.
- Give every milestone its own validation command.
- Suggest a model for each milestone.
- Get human approval before implementing.

## Pilot

- Do the first two or three units of repeated work first.
- Review the pilot before scaling.
- Update the plan with what the pilot taught before scaling.

## Resume

- Read the plan.
- Read `git log --oneline -20`.
- Run `pnpm test`.
- Fix any red result before new work.
- Continue at the first unchecked milestone.

## Maintain

- Tick progress as each milestone lands.
- Log each decision with its date.
- Record surprises when they happen.
- Paste validation commands and results after each milestone.
- Never ask what to do next; move to the next milestone.
- Stop and ask only when a decision changes scope, an invariant, or the product.

## Claim (parallel work)

- Write your agent name under the milestone.
- Commit the claim before starting.
- Pick another milestone if the claim conflicts.

## Close

- Confirm every "Done when" item with evidence.
- Write the outcome and retrospective.
- Note model used and rough cost per milestone.
- Move the file to `docs/plans/completed/`.
