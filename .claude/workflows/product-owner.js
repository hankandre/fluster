export const meta = {
  name: 'product-owner',
  description: 'A Product Owner pass: triage tasks/backlog.jsonl into tasks/prd.json, set priorities, log each decision, and ship it for the owner to veto',
  whenToUse: 'Run when tasks/backlog.jsonl has entries without taken_by, or the owner asks for a re-prioritisation. args: {root: "/abs/path/of/the/folder/holding/the/checkout"} (optional)',
  phases: [
    { title: 'Decide', detail: 'product-owner (Fable 5.2) applies its decisions through scripts/task-owner.mjs and logs them' },
    { title: 'Ship', detail: 'PR listing every decision for the owner to veto; auto-merge on green' },
  ],
};

// Only this pass adds, splits, reorders or drops tasks in tasks/prd.json (AGENTS.md; prd rule 15). The owner can veto any of it.
// The model is fixed here, not taken from args: the acceptance names Fable 5.2.
const REPO = 'octave';
const input = typeof args === 'string' ? {} : args || {};
const main = input.root ? `${input.root}/${REPO}` : '.';
const parent = input.root || '..';
const worktree = `${parent}/${REPO}-product-owner`;
const branch = 'chore/product-owner-pass';

const strings = { type: 'array', items: { type: 'string' } };
const DECIDE = {
  type: 'object',
  properties: { decisions: strings, approvals: strings, nothingToDo: { type: 'boolean' }, deniedCommands: strings },
  required: ['decisions', 'nothingToDo'],
};
const SHIP = {
  type: 'object',
  properties: { prUrl: { type: 'string' }, merged: { type: 'boolean' }, ciFailures: strings, deniedCommands: strings },
  required: ['merged'],
};
const denied = (result) => (result && result.deniedCommands && result.deniedCommands.length ? result.deniedCommands : null);

// Remove the worktree and branch on every exit but a merge, so the next pass can create them again.
const cleanup = () =>
  agent(
    `Remove the Product Owner pass's leftovers, ignoring any that are absent: git -C ${main} worktree remove --force ${worktree}; git -C ${main} worktree prune; git -C ${main} branch -D ${branch}. Change nothing else.`,
    { model: 'haiku', effort: 'low', phase: 'Ship', label: 'clean up product-owner pass' },
  );
const leave = async (outcome) => {
  await cleanup();
  return outcome;
};

const decide = await agent(
  `Run a Product Owner pass. First remove a worktree or branch an earlier pass left behind (git -C ${main} worktree remove --force ${worktree}; git -C ${main} worktree prune; git -C ${main} branch -D ${branch}; ignore errors if absent). Then create the worktree: git -C ${main} fetch -q && git -C ${main} worktree add ${worktree} -b ${branch} origin/main. Work only in ${worktree}.
1. Read the backlog entries without taken_by in tasks/backlog.jsonl, \`mise exec -- node ${worktree}/scripts/task.mjs list\`, and the parts of PRODUCT.md you need. Never load tasks/prd.json whole.
2. Decide what to add, split (a drop or an edit plus adds), reorder or drop, within the existing product direction. Look, wording and direction stay with the owner.
3. Write the operations file outside the repo (mktemp) and apply it: mise exec -- node ${worktree}/scripts/task-owner.mjs apply <ops.json> --date <today, from date +%F>. An add needs takes (the backlog entries it covers). An acceptance edit that changes scope only (a path, a split, a dependency, what a task covers) gives scope, your reason, and needs no approval file. An acceptance edit that changes on-screen wording or copy, look or product direction, and any edit of human or verify, needs owner_approval: a docs/specs/decisions-*.md or docs/decisions/*.md file that names the task; without one, leave it for the owner. There is no operation for rules.
4. Append a dated section to tasks/product-owner-log.md, one line per decision: what, the backlog entry, the approval path or "scope edit", why. Run mise exec -- pnpm check, and commit the task and backlog files and the log in one commit whose message ends with the trailer "Product-Owner-Pass: <today>".
Return every decision (one line each) and every approval path. Return nothingToDo=true, with no commit, when nothing needs a decision. If a command is denied, report it in deniedCommands and do not work around it.`,
  { agentType: 'product-owner', model: 'fable', schema: DECIDE, phase: 'Decide', label: 'product-owner pass' },
);
if (!decide) return leave({ outcome: 'failed', detail: 'The Product Owner returned nothing.' });
if (denied(decide)) return leave({ outcome: 'denied', detail: denied(decide) });
if (decide.nothingToDo) return leave({ outcome: 'nothing-to-do' });

const ship = await agent(
  `Work in ${worktree} (branch ${branch}). Ship with the ship skill: push, open the PR, enable auto-merge with rebase, and wait for CI with gh pr checks --watch. The PR body lists these decisions under a heading "The owner can veto any of these", and each approval path:
${decide.decisions.join('\n')}
${(decide.approvals || []).join('\n')}
A veto is reverted by the next pass and logged. Change no source files. If CI is red, return merged=false with each failing check. After a merge, run git -C ${main} pull --ff-only and remove the worktree and branch.`,
  { model: 'sonnet', effort: 'low', schema: SHIP, phase: 'Ship', label: 'ship product-owner pass' },
);
if (!ship) return leave({ outcome: 'failed', detail: 'The ship agent returned nothing.' });
if (denied(ship)) return leave({ outcome: 'denied', detail: denied(ship) });
return ship.merged ? { outcome: 'merged', prUrl: ship.prUrl, decisions: decide.decisions } : leave({ outcome: 'ci-red', prUrl: ship.prUrl, ciFailures: ship.ciFailures });
