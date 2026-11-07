---
name: ship
description: Open a pull request for a finished Fluster branch, wait for CI, merge it, and clean up. Use after verify and review pass, or when the human asks to ship.
---

# Ship

## Before the PR

- Run the `verify` skill.
- Confirm the change review has no open findings.
- Confirm the branch is not `main`.
- Rebase on `origin/main` and rerun failed checks.
- Push the branch with `git push -u origin <branch>`.

## Open the PR

- Create it with `gh pr create --base main`.
- Use a Conventional Commit subject as the title.
- Write the body from `references/pr-body.md`.
- List the `tasks/prd.json` task ids and plan it covers.
- List every untested Wayland, GPU, Jellyfin, and AppImage gate.
- End the body with the attribution line from the session.

## Wait for CI

- Run `gh pr checks <number> --watch`.
- Hand failing output to `ci-triage`.
- Fix failures in new commits on the branch.
- Never merge with a red or pending required check.
- Never skip or disable a check to merge.

## Merge

- Merge without asking when CI is green and review found nothing open.
- Ask the human first when the diff changes an invariant, `docs/security.md`, release signing, or CI itself.
- Merge with `gh pr merge <number> --rebase --delete-branch`.

## After the merge

- Run `git switch main && git pull --ff-only`.
- Delete the local branch.
- Record the PR link in the task evidence in `tasks/prd.json`.
- Report the PR link and merge commit to the human.
