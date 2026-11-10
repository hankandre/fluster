export const meta = {
  name: 'task',
  description: 'Run one tasks/prd.json task: spec, check, implement, verify, review, ship',
  whenToUse: 'Build one Fluster task end to end. args: {task: "P13-06", risk: "routine" | "high", native: false}',
  phases: [
    { title: 'Spec', detail: 'refiner writes docs/specs/<TASK>.md' },
    { title: 'Check', detail: 'fresh spec-checker; one revision allowed' },
    { title: 'Implement', detail: 'implementer (TypeScript) or native-engineer (src-tauri)' },
    { title: 'Verify', detail: 'pnpm check, e2e, visual captures for UI' },
    { title: 'Review', detail: 'one round; fix critical, high, medium; log lows' },
    { title: 'Ship', detail: 'PR, auto-merge on green, clean up' },
  ],
};

// args: "P13-06" or {task, risk, native, from}
// from: "check" skips writing the spec (use after the human answers its questions)
// from: "implement" skips spec and check; pass notes: [...] for the implementer
const input = typeof args === 'string' ? { task: args } : args || {};
const task = input.task;
if (!task) {
  return { stopped: 'no-task', detail: 'Pass args: {task: "<ID>"}' };
}
const highRisk = input.risk === 'high';
const native = input.native === true;
const skipCheck = input.from === 'implement';
const skipSpec = input.from === 'check' || skipCheck;
let specNotes = Array.isArray(input.notes) ? input.notes : [];

const specModel = highRisk ? 'fable' : 'opus';
const implAgent = native ? 'native-engineer' : 'implementer';
const implModel = native ? 'opus' : 'sonnet';
const reviewAgent = native || highRisk ? 'guardian' : 'reviewer';
const reviewModel = native || highRisk ? 'opus' : 'sonnet';

const worktree = `/home/handre/Code/fluster-${task}`;
const branch = `task/${task}`;
const spec = `docs/specs/${task}.md`;
const common = `Task ${task} in tasks/prd.json. Worktree: ${worktree} (branch ${branch}). Spec: ${spec} in that worktree. Work only in that worktree. If a command is denied, report it in deniedCommands and do not work around it.`;

const strings = { type: 'array', items: { type: 'string' } };
const SPEC = {
  type: 'object',
  properties: { summary: { type: 'string' }, openQuestions: strings, deniedCommands: strings },
  required: ['summary', 'openQuestions'],
};
const CHECK = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, issues: strings },
  required: ['approved', 'issues'],
};
const WORK = {
  type: 'object',
  properties: { done: { type: 'boolean' }, summary: { type: 'string' }, blockers: strings, deniedCommands: strings },
  required: ['done', 'summary'],
};
const VERIFY = {
  type: 'object',
  properties: { passed: { type: 'boolean' }, evidence: { type: 'string' }, failures: strings },
  required: ['passed', 'evidence', 'failures'],
};
const REVIEW = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          where: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['severity', 'where', 'summary'],
      },
    },
  },
  required: ['findings'],
};
const SHIP = {
  type: 'object',
  properties: {
    prUrl: { type: 'string' },
    merged: { type: 'boolean' },
    ciFailures: strings,
    deniedCommands: strings,
  },
  required: ['merged'],
};

const stop = (reason, detail) => {
  log(`Stopped: ${reason}`);
  return { task, stopped: reason, detail };
};
const denied = (result) => (result && result.deniedCommands && result.deniedCommands.length ? result.deniedCommands : null);

// 1. Spec
phase('Spec');
const specPrompt = `${common}
Create the worktree if it is missing: git -C /home/handre/Code/fluster fetch -q && git -C /home/handre/Code/fluster worktree add ${worktree} -b ${branch} origin/main.
If ${spec} already exists with every section, keep it and report on it. Otherwise write it. Do not commit.
Resolve gaps yourself from the task, the code, the docs, and any Decisions section in the spec, and write the answers into the spec. Return as open questions only product or design choices that the human must make and has not already confirmed in the spec's Decisions section.
Return a short summary and those open questions.`;
const specResult = skipSpec
  ? { summary: `Existing spec ${spec}`, openQuestions: [] }
  : await agent(specPrompt, { agentType: 'refiner', model: specModel, schema: SPEC, label: `spec ${task}` });
if (!specResult) return stop('spec-failed', 'The refiner returned nothing.');
if (denied(specResult)) return stop('denied-command', denied(specResult));
if (specResult.openQuestions.length) return stop('open-questions', specResult.openQuestions);

// 2. Check (one revision round)
phase('Check');
if (!skipCheck) {
const checkPrompt = `${common}
Check the spec and append your "## Spec check" verdict to it. Set approved=true unless an issue is critical or high; list medium and low issues anyway, prefixed with their severity, and the implementer will resolve them. Treat decisions the spec marks as confirmed by the human as settled. Return approved and the numbered issues.`;
let check = await agent(checkPrompt, { agentType: 'spec-checker', model: specModel, schema: CHECK, label: 'spec check' });
if (!check) return stop('check-failed', 'The spec-checker returned nothing.');
if (!check.approved) {
  log(`Spec needs changes (${check.issues.length} issues); revising once`);
  const revised = await agent(
    `${common}
The spec check found these issues. Revise the spec to fix them and remove the old "## Spec check" section.
${check.issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}
Resolve gaps yourself from the task, the code, and the docs; return as open questions only product or design choices that the human must make.`,
    { agentType: 'refiner', model: specModel, schema: SPEC, label: 'spec revision' },
  );
  if (!revised) return stop('spec-failed', 'The spec revision returned nothing.');
  if (revised.openQuestions.length) return stop('open-questions', revised.openQuestions);
  check = await agent(checkPrompt, { agentType: 'spec-checker', model: specModel, schema: CHECK, label: 'spec re-check' });
  if (!check || !check.approved) return stop('spec-not-approved', check ? check.issues : 'The re-check returned nothing.');
}
  specNotes = specNotes.concat(check.issues);
}

// 3. Implement
phase('Implement');
const impl = await agent(
  `${common}
Implement the approved spec.${specNotes.length ? `\nAlso resolve these spec-check notes, updating the spec where they change it:\n${specNotes.join('\n')}` : ''} Commit the spec with the work, one milestone per commit. Set the task's status to in_progress with evidence in tasks/prd.json. The Review phase does the design review and the Ship phase links the screenshots; the task is marked done after those. Do not push or open a PR.
Return done=false with blockers if you cannot finish.`,
  { agentType: implAgent, model: implModel, schema: WORK, label: `implement ${task}` },
);
if (!impl) return stop('implement-failed', 'The implementer returned nothing.');
if (denied(impl)) return stop('denied-command', denied(impl));
if (!impl.done) return stop('implement-blocked', impl.blockers || impl.summary);

// 4. Verify (one fix round)
const verifyPrompt = `${common}
Run the verify skill: mise exec -- pnpm check, then pnpm test:e2e with FLUSTER_E2E_PORT set to a free port. If the diff against origin/main touches src/features/ or src/styles/, also run pnpm test:visual with FLUSTER_VISUAL_PORT set to a free port. Change no files. Return passed, the evidence (commands with their result lines), and each failure with file:line.`;
const fix = (what, items, label) =>
  agent(
    `${common}
Fix these ${what} and commit. Add or update a test for each behavior change. Do not push.
${items.map((item, i) => `${i + 1}. ${item}`).join('\n')}`,
    { agentType: implAgent, model: implModel, schema: WORK, phase: 'Verify', label },
  );
const runVerify = (label) => agent(verifyPrompt, { model: 'sonnet', effort: 'low', schema: VERIFY, phase: 'Verify', label });

phase('Verify');
let verify = await runVerify('verify');
if (!verify) return stop('verify-failed', 'The verify agent returned nothing.');
if (!verify.passed) {
  log(`Verify failed (${verify.failures.length}); fixing once`);
  const fixed = await fix('failing checks', verify.failures, 'fix checks');
  if (denied(fixed)) return stop('denied-command', denied(fixed));
  verify = await runVerify('re-verify');
  if (!verify || !verify.passed) return stop('verify-red', verify ? verify.failures : 'The re-verify returned nothing.');
}

// 5. Review (one round)
phase('Review');
const review = await agent(
  `${common}
Review git diff origin/main...${branch} against the spec, the task acceptance, and the hard rules. If the diff touches src/features/ or src/styles/, also do the design review: follow .claude/skills/change-review/references/design-checklist.md against DESIGN.md and look at the captures in visual-captures/ (run pnpm test:visual with FLUSTER_VISUAL_PORT set to a free port if they are missing). This is the only review round. Change no files. Return every finding with its severity, file:line, and a concrete failure scenario.`,
  { agentType: reviewAgent, model: reviewModel, schema: REVIEW, label: `review (${reviewAgent})` },
);
if (!review) return stop('review-failed', 'The reviewer returned nothing.');
const describe = (finding) => `[${finding.severity}] ${finding.where}: ${finding.summary}`;
const blocking = review.findings.filter((finding) => finding.severity !== 'low').map(describe);
const lows = review.findings.filter((finding) => finding.severity === 'low').map(describe);
log(`Review: ${blocking.length} to fix, ${lows.length} low to log`);
{
  const followUp = await agent(
    `${common}
${blocking.length ? `Fix these review findings and commit, with a test for each behavior change:\n${blocking.join('\n')}` : 'No findings need a fix.'}
${lows.length ? `Log these low findings as follow-ups in the active plan (docs/plans/active/) and commit; do not fix them:\n${lows.join('\n')}` : ''}
Then, if every acceptance item is met (the design review above counts as the fresh-context design review; screenshots are linked by the Ship phase), set the task's status to done and passes to true in tasks/prd.json, update its evidence, tick its line in the active plan, and commit.
Do not push.`,
    { agentType: implAgent, model: implModel, schema: WORK, label: 'review follow-ups' },
  );
  if (denied(followUp)) return stop('denied-command', denied(followUp));
  if (blocking.length) {
    const recheck = await agent(verifyPrompt, { model: 'sonnet', effort: 'low', schema: VERIFY, label: 'verify after review' });
    if (!recheck || !recheck.passed) return stop('verify-red-after-review', recheck ? recheck.failures : 'The verify returned nothing.');
    verify = recheck;
  }
}

// 6. Ship (one CI fix round)
phase('Ship');
const shipPrompt = `${common}
Ship with the ship skill: rebase onto origin/main if it moved (force-with-lease is allowed on this branch), push, open the PR if none exists, enable auto-merge with rebase, and wait for CI with gh pr checks --watch. The PR body must explain user impact, testing (use the evidence below), conversion and security implications, untested gates, and call out any change to invariants, docs/security.md, release signing, or CI. For a UI change, add a Screenshots section that links the visual-captures artifact from the PR's CI run (gh api repos/hankandre/fluster/actions/runs/<run>/artifacts) and names the captures that changed, plus a Design review notes section from the review. Change no source files. If CI is red, return merged=false with each failing check and its cause. After a merge, run git -C /home/handre/Code/fluster pull --ff-only and remove the worktree and branch.
Evidence: ${verify.evidence}
Review: ${blocking.length} fixed, ${lows.length} low logged in the plan.`;
let ship = await agent(shipPrompt, { model: 'sonnet', effort: 'low', schema: SHIP, label: 'ship' });
if (!ship) return stop('ship-failed', 'The ship agent returned nothing.');
if (denied(ship)) return stop('denied-command', denied(ship));
if (!ship.merged && ship.ciFailures && ship.ciFailures.length) {
  log('CI is red; fixing once');
  const fixed = await agent(
    `${common}
CI failed on the PR. Fix the cause, commit, and push.
${ship.ciFailures.join('\n')}`,
    { agentType: implAgent, model: implModel, schema: WORK, label: 'fix CI' },
  );
  if (denied(fixed)) return stop('denied-command', denied(fixed));
  ship = await agent(shipPrompt, { model: 'sonnet', effort: 'low', schema: SHIP, label: 'ship retry' });
}
if (!ship || !ship.merged) return stop('ci-red', ship ? { prUrl: ship.prUrl, ciFailures: ship.ciFailures } : 'The ship retry returned nothing.');

return { task, merged: true, prUrl: ship.prUrl, spec: specResult.summary, fixed: blocking, lowsLogged: lows };
