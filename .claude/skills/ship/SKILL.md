---
name: ship
description: Open a pull request for a finished Octave branch, wait for CI, merge it, and clean up. Use after verify and review pass, or when the owner asks to ship.
---

# Ship

## Before the PR

- Run the `verify` skill.
- Confirm the one review round has no open critical, high, or medium findings.
- Confirm the branch is not `main`.
- Rebase on `origin/main` before the first push and rerun failed checks.
- Push the branch with `git push -u origin <branch>`.

## Open the PR

- Create it with `gh pr create --base main`.
- Use a Conventional Commit subject as the title.
- Fill in every section of `.github/pull_request_template.md`.
- List the task ids and plan it covers.
- Set each completed task to `done` with `passes: true` and evidence of at most 600 characters before opening the PR, with `pnpm task set <id> --status done --evidence-file <file>`; the evidence names the PR or a commit.
- List every untested device, Jellyfin, and Jellyscale gate.
- End the body with the attribution line from the session.

## Wait for CI

- Enable auto-merge with `gh pr merge <number> --auto --rebase --delete-branch`, unless the task or the owner says not to.
- Run `gh pr checks <number> --watch`.
- Hand failing output to `ci-triage`.
- Fix failures in new commits on the branch.
- Never merge with a red or pending required check.
- Never skip or disable a check to merge.

## Keep the branch current

- `main` requires branches to be up to date with it before merging.
- Treat a `BEHIND` merge state as stale, not failed.
- Run `gh pr update-branch <number> --rebase` and let CI re-run.
- Never update a branch that is `DIRTY`; resolve conflicts instead.

## Resolve conflicts

- Treat a `DIRTY` merge state as a conflict; CI does not run on it.
- Rebase the branch on `origin/main` locally and rerun `verify`.
- Push it with `git push --force-with-lease`; the PR and its auto-merge stay.
- Use this only on your own unmerged PR branch.
- Never force-push `main` or another agent's branch.

## Merge

- Merge without asking when CI is green and the one review round left no critical, high, or medium finding open.
- Call out changes to an invariant, `docs/security.md`, release signing, or CI itself in the PR; merge on green.
- Merge with `gh pr merge <number> --rebase --delete-branch` when auto-merge is off.
- Never bypass or edit the `main` ruleset to merge.

## Dependabot PRs

- Let the auto-merge workflow merge minor and patch npm updates.
- Read the changelog for major updates before merging.
- Ask before merging GitHub Actions updates, and updates to Expo, react-native-tvos, Media3, or the Jellyfin SDK.

## After the merge

- Run `git switch main && git pull --ff-only`.
- Delete the local branch.
- Report the PR link and merge commit to the owner.
