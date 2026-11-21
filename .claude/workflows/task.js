export const meta = {
  name: 'task',
  description: 'Run tasks/prd.json tasks in order: spec, check, failing tests, implement, review, ship; park tasks with open design questions',
  whenToUse:
    'Build Octave tasks end to end. args: {tasks: ["T3-01", "T3-02"], risk: "routine" | "high", native: false} or {task: "T3-01", from: "check" | "tests" | "implement" | "review", preFlow: true, notes: [...], evidence: "...", models: {spec: {high: "opus"}}, root: "/abs/path/of/the/folder/holding/the/checkout"}',
  phases: [
    { title: 'Spec', detail: 'refiner writes docs/specs/<TASK>.md' },
    { title: 'Check', detail: 'fresh spec-checker; blocks only on critical or high' },
    { title: 'Tests', detail: 'test-writer commits failing tests and a manifest; the red gate stops the run if one already passes' },
    { title: 'Implement', detail: 'implementer or native-engineer; runs the verify skill' },
    { title: 'Review', detail: 'one round; fix critical, high, medium; log lows' },
    { title: 'Ship', detail: 'PR, auto-merge on green, clean up' },
  ],
};

// args:
//   {tasks: ["T3-01", ...], risk, native}  run tasks in order
//   {task: "T3-01", risk, native}           run one task
//   root: "/abs/dir"                        folder that holds the main checkout (default "..", relative to it)
//   from: "check" | "tests" | "implement" | "review"  skip finished phases (single task only)
//   preFlow: true                           a branch implemented before the test-first flow: no Tests phase, no manifest required (single task, never inferred)
//   approvedFrozen: [paths]                 frozen test paths a Product Owner ruling already changed (a resumed run)
//   notes: [...]                            spec-check notes for the test writer and the implementer (with from: "tests" or "implement")
//   models: {...}                           per-run model override, deep-merged over MODELS (see below)
//   evidence: "..."                         verify evidence from the finished implementation (with from: "review")
//   ciSteps: [...]                          acceptance steps that need a pushed branch or CI runs (with from: "review")
// notes reach ONLY the Tests and Implement steps (via specNotes). Spec, check, review, follow-ups and ship never receive them.
// (Check issues are appended to specNotes by the check step itself, so a resumed run with from: "implement" must pass them again.)
// A task whose spec needs a new design call is parked, and the run moves on.
// The run stops early only on STOP_OUTCOMES: a denied command, a test that passes before implementation (tests-green), or a changed frozen test (frozen-tests).
// MODELS-BEGIN (pure; extracted and tested by .claude/workflows/task.test.mjs)
const MODELS = {
  spec: { routine: 'opus', high: 'fable' },
  check: { routine: 'opus', high: 'fable', native: 'fable' },
  implement: { routine: 'sonnet', native: 'opus' },
  review: { routine: 'sonnet', guarded: 'opus' },
  guardian: 'opus',
  ship: 'sonnet',
  escalate: 'fable',
  tests: { routine: 'sonnet', native: 'opus' },
  owner: 'fable',
  gate: 'haiku',
};
const MODEL_NAMES = ['haiku', 'sonnet', 'opus', 'fable'];
function resolveModels(defaults, override) {
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const merge = (base, extra, path) => {
    const out = {};
    for (const key of Object.keys(base)) out[key] = base[key];
    for (const key of Object.keys(extra)) {
      const where = path ? `${path}.${key}` : key;
      if (!path && key === 'owner') throw new Error('models.owner cannot be overridden; a frozen-test ruling always runs on the Product Owner model');
      if (!Object.prototype.hasOwnProperty.call(base, key)) throw new Error(`Unknown models key "${where}". Known: ${Object.keys(base).join(', ')}`);
      if (isObject(base[key])) {
        if (!isObject(extra[key])) throw new Error(`models.${where} must be an object`);
        out[key] = merge(base[key], extra[key], where);
      } else {
        if (!MODEL_NAMES.includes(extra[key])) throw new Error(`models.${where} must be one of ${MODEL_NAMES.join(', ')}; got ${JSON.stringify(extra[key])}`);
        out[key] = extra[key];
      }
    }
    return out;
  };
  if (override === undefined || override === null) return merge(defaults, {}, '');
  if (!isObject(override)) throw new Error('args.models must be an object');
  return merge(defaults, override, '');
}
// MODELS-END
// PATHS-BEGIN (pure; extracted and tested by .claude/workflows/task.test.mjs)
// The repository is octave; each task gets a sibling worktree and branch named by its id.
const REPO = 'octave';
const TASK_ID = /^T\d+-\d{2}$/;
function taskPaths(task, root) {
  if (typeof task !== 'string' || !TASK_ID.test(task)) throw new Error(`Unknown task id ${JSON.stringify(task)}; expected an id such as T3-01`);
  const parent = root || '..';
  const main = root ? `${root}/${REPO}` : '.';
  return { main, worktree: `${parent}/${REPO}-${task}`, branch: `task/${task}`, spec: `docs/specs/${task}.md` };
}
// Paths whose change always needs a guardian review (AGENTS.md: policy, tokens, redaction, native).
const HIGH_RISK_PATH =
  /^(packages\/core\/.*(jellyfin|negotiat|gateway|player|playback|redact|safe-reason|transport|host-class|session|lan-http)|packages\/core\/tests\/fixtures\/(hls-|host-classes)|src\/lib\/jellyfin\/|src\/lib\/player\/|src\/lib\/redact|src\/lib\/safe-reason|src\/lib\/transport-error|src\/lib\/lan-http|src\/domain\/(playback|host-class)|modules\/|apps\/tv\/android\/|docs\/security\.md|tests\/fixtures\/(hls-|host-classes))/;
// Kotlin and native module work goes to native-engineer.
const NATIVE_PATH = /^(modules\/|apps\/tv\/android\/)/;
// PATHS-END
// GATE-BEGIN (pure; extracted and tested by .claude/workflows/task.test.mjs)
// A gate agent relays a script's exit code and its output: one JSON line on stdout, then any ERROR lines from stderr. These functions decide what the run does with it.
const STOP_OUTCOMES = ['denied', 'tests-green', 'frozen-tests'];
function readGate(gate) {
  if (!gate || typeof gate.exitCode !== 'number' || typeof gate.output !== 'string') return null;
  const lines = gate.output.split('\n').map((line) => line.trim()).filter(Boolean);
  // The last line that parses as a JSON object: ERROR lines may follow it.
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const value = JSON.parse(lines[i]);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value;
    } catch (error) {
      // not JSON; keep looking
    }
  }
  return null;
}
const unreadable = (what) => ({ action: 'retry', unreadable: true, detail: `${what} gave no readable result` });
// check-red.mjs <ID>: every run must be red before implementation. Returns the frozen blob ids and the gated items on pass.
function decideRed(gate) {
  const json = readGate(gate);
  if (!json) return unreadable('the red gate');
  const green = json.green || [];
  const problems = json.problems || [];
  if (green.length) return { action: 'stop', detail: `acceptance items ${green.join(', ')} already pass before any implementation` };
  if (problems.length || gate.exitCode !== 0) return { action: 'retry', detail: problems.join('; ') || `the red gate exited ${gate.exitCode}` };
  return { action: 'pass', detail: '', blobs: json.blobs || {}, gates: json.gates || [] };
}
// check-red.mjs <ID> --expect green, after the follow-ups: every run must pass.
function decideGreen(gate) {
  const json = readGate(gate);
  if (!json) return unreadable('the green gate');
  const problems = json.problems || [];
  if (problems.length) return { action: 'blocked', detail: problems.join('; ') };
  if ((json.red || []).length || gate.exitCode !== 0) return { action: 'blocked', detail: `acceptance items ${(json.red || []).join(', ') || '?'} still fail` };
  return { action: 'pass', detail: '' };
}
// check-flow.mjs --json. approvedPaths: frozen paths a Product Owner ruling changed in this run. pinned: the red gate's blob ids (undefined on a resumed run).
// Unreadable output is retried by the caller once (final = false), then stops the run (final = true).
function decideFrozen(gate, approvedPaths, pinned, final) {
  const json = readGate(gate);
  if (!json) return final ? { action: 'stop', unreadable: true, detail: 'the frozen-test check gave no readable result twice' } : unreadable('the frozen-test check');
  if (json.missingManifest) return { action: 'blocked', detail: 'no manifest: rerun with from: "tests", or pass preFlow: true for a branch that predates the flow' };
  if (gate.exitCode !== 0 || json.ok !== true) return { action: 'stop', detail: (json.problems || []).join('; ') || `the frozen-test check exited ${gate.exitCode}` };
  const approved = approvedPaths || [];
  const unapproved = (json.changes || []).map((change) => change.path).filter((path) => !approved.includes(path));
  if (unapproved.length) return { action: 'stop', detail: `frozen test changes the Product Owner step did not return: ${unapproved.join(', ')}` };
  if (pinned) {
    const now = {};
    for (const entry of json.frozen || []) now[entry.path] = entry.blob;
    const moved = Object.keys(pinned).filter((path) => !approved.includes(path) && now[path] !== pinned[path]);
    if (moved.length) return { action: 'stop', detail: `frozen files differ from the red gate's versions (an amended or squashed freeze commit): ${moved.join(', ')}` };
  }
  return { action: 'pass', detail: '' };
}
// GATE-END
// STEP-BEGIN (pure; extracted and tested by .claude/workflows/task.test.mjs)
const mergeUnique = (a, b) => (a || []).concat(b || []).filter((item, i, all) => all.indexOf(item) === i);
// Decide what a work() attempt leads to. A check that fails locally is never CI-only: ciOnly counts only when done and checksPassed are both true.
//   denied: stop; owner: the work reports frozen tests that look wrong; done: green, ciOnly items (if any) go to Ship as steps; retry: not green, so retry or escalate.
//   The order is none, denied, owner, done, retry.
function decideStep(out, isDenied) {
  if (!out) return { action: 'none', ciOnly: [] };
  if (isDenied) return { action: 'denied', ciOnly: [] };
  if (out.frozenTestProblems && out.frozenTestProblems.length) return { action: 'owner', ciOnly: [] };
  const problems = (out.blockers || []).concat(out.failures || []);
  const green = out.done === true && out.checksPassed === true && problems.length === 0;
  if (green) return { action: 'done', ciOnly: out.ciOnly || [] };
  return { action: 'retry', ciOnly: [] };
}
// STEP-END
const input = typeof args === 'string' ? { task: args } : args || {};
const items = Array.isArray(input.tasks) ? input.tasks : input.task ? [input.task] : [];
const models = resolveModels(MODELS, input.models);
if (!items.length) return { stopped: 'no-task', detail: 'Pass args: {tasks: ["<ID>", ...]} or {task: "<ID>"}' };

const strings = { type: 'array', items: { type: 'string' } };
const SPEC = {
  type: 'object',
  properties: { summary: { type: 'string' }, openQuestions: strings, deniedCommands: strings, touchesNative: { type: 'boolean' } },
  required: ['summary', 'openQuestions', 'touchesNative'],
};
const CHECK = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, issues: strings, touchesNative: { type: 'boolean' } },
  required: ['approved', 'issues', 'touchesNative'],
};
const WORK = {
  type: 'object',
  properties: {
    done: { type: 'boolean' },
    checksPassed: { type: 'boolean' },
    summary: { type: 'string' },
    evidence: { type: 'string' },
    failures: strings,
    ciOnly: strings,
    blockers: strings,
    deniedCommands: strings,
    ciSteps: strings,
    frozenTestProblems: strings,
  },
  required: ['done', 'checksPassed', 'summary', 'evidence'],
};
const TESTS = {
  type: 'object',
  properties: { done: { type: 'boolean' }, summary: { type: 'string' }, blockers: strings, deniedCommands: strings },
  required: ['done', 'summary'],
};
const GATE = {
  type: 'object',
  properties: { exitCode: { type: 'integer' }, output: { type: 'string' }, deniedCommands: strings },
  required: ['exitCode', 'output'],
};
const RULING = {
  type: 'object',
  properties: { rulings: strings, changed: strings, deniedCommands: strings },
  required: ['rulings', 'changed'],
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
    needsGuardian: { type: 'boolean' },
    filesChanged: strings,
  },
  required: ['findings', 'filesChanged'],
};
const SHIP = {
  type: 'object',
  properties: { prUrl: { type: 'string' }, merged: { type: 'boolean' }, ciFailures: strings, deniedCommands: strings },
  required: ['merged'],
};

const denied = (result) => (result && result.deniedCommands && result.deniedCommands.length ? result.deniedCommands : null);
const numbered = (list) => list.map((item, i) => `${i + 1}. ${item}`).join('\n');
const VERIFY_STEPS =
  'Run the verify skill before you return: mise exec -- pnpm check. When the diff touches negotiation or reporting, also pnpm test:tripwire against the pinned servers. When these commands exist, also run: pnpm tv:native:test if the diff touches Kotlin or a native module; pnpm tv:e2e on a free emulator if it touches the app; the task\'s wire test with pnpm tv:wire against the pinned Jellyscale if the task\'s verify names it (a playback task passes only when it passes); pnpm tv:visual if it touches screens, shared controls, or design tokens. Never run pkill or killall: stop only processes you started, with TaskStop or their own PID. One agent at a time on an emulator or device serial. If a test fails, rerun it alone and on origin/main before blaming or fixing the change, and say which in the evidence. Return checksPassed, the evidence (commands with their result lines), and each failure with file:line.';

async function runTask(task, opts) {
  const highRisk = opts.risk === 'high';
  let native = opts.native === true;
  const skipImpl = opts.from === 'review';
  const skipTests = opts.from === 'implement' || skipImpl || opts.preFlow === true;
  const skipCheck = opts.from === 'tests' || skipTests;
  const skipSpec = opts.from === 'check' || skipCheck;
  let specNotes = Array.isArray(opts.notes) ? opts.notes : [];

  let specModel, checkModel, testsModel, implAgent, implModel, reviewAgent, reviewModel;
  const route = () => {
    specModel = highRisk ? models.spec.high : models.spec.routine;
    checkModel = native ? models.check.native : highRisk ? models.check.high : models.check.routine;
    testsModel = native ? models.tests.native : models.tests.routine;
    implAgent = native ? 'native-engineer' : 'implementer';
    implModel = native ? models.implement.native : models.implement.routine;
    reviewAgent = native || highRisk ? 'guardian' : 'reviewer';
    reviewModel = native || highRisk ? models.review.guarded : models.review.routine;
  };
  route();
  log(`${task}: models ${JSON.stringify(models)}`);
  // Native work (Kotlin under modules/ or apps/tv/android, or the PlayerEngine port) goes to native-engineer on Opus with a guardian review (AGENTS.md).
  const goNative = (flag, by) => {
    if (flag && !native) {
      native = true;
      route();
      log(`${task}: the ${by} touches native code or the PlayerEngine port; routing to native-engineer and guardian`);
    }
  };

  const { main, worktree, branch, spec } = taskPaths(task, opts.root);
  const taskCli = `mise exec -- node ${worktree}/scripts/task.mjs`;
  const evidenceRule = 'The evidence must name the PR (PR #n) or a commit (commit <sha>) and stay within 600 characters; move longer notes to the PR body. Write it to a file outside the repo (mktemp) and pass it with --evidence-file.';
  const where = opts.root ? '' : ' Relative paths are relative to the main checkout, which is your starting directory.';
  const common = `Task ${task} in tasks/prd.json (read it with \`${taskCli} show ${task}\`; never read the whole file). Worktree: ${worktree} (branch ${branch}).${where} Spec: ${spec} in that worktree. Work only in that worktree. Answered questions in docs/specs/decisions-*.md and decisions the spec marks as confirmed by the human are settled human decisions. If a command is denied, report it in deniedCommands and do not work around it.`;
  const result = (outcome, detail) => {
    log(`${task}: ${outcome}`);
    return { task, outcome, detail };
  };

  const problemsOf = (out) => (out.blockers || []).concat(out.failures || []);
  const stepOf = (out) => decideStep(out, !!out && !!denied(out));
  // Implementation step with one retry and an escalation: used for implement, check fixes, and CI fixes.
  // ciOnly items (only a CI run can produce them, reported with every local check green) are merged across attempts and left on the final result.
  const work = async (prompt, label, phaseTitle) => {
    let carried = [];
    const attempt = async (text, model, name) => {
      const out = await agent(`${common}\n${text}\n${VERIFY_STEPS}`, { agentType: implAgent, model, schema: WORK, phase: phaseTitle, label: name });
      if (out) {
        carried = mergeUnique(carried, out.ciOnly);
        out.ciOnly = carried;
      }
      return out;
    };
    let out = await attempt(prompt, implModel, label);
    if (stepOf(out).action === 'retry') {
      log(`${task}: ${label} not green; one more try, then escalating to ${models.escalate}`);
      out = await attempt(`Finish this work: ${prompt}\nThe last attempt left these problems:\n${numbered(problemsOf(out))}`, implModel, `${label} (retry)`);
      if (stepOf(out).action === 'retry') {
        out = await attempt(`Two attempts failed. Finish this work: ${prompt}\nRemaining problems:\n${numbered(problemsOf(out))}`, models.escalate, `${label} (${models.escalate})`);
      }
    }
    return out;
  };

  // Gates: a small agent with no agent type relays one command's exit code and output; the pure decide functions judge it.
  const nodeCli = (script) => `mise exec -- node ${worktree}/scripts/${script}`;
  const redCommand = `mise exec -- node ${worktree}/scripts/check-red.mjs ${task} --repo ${worktree}`;
  const flowCommand = `${nodeCli('check-flow.mjs')} --repo ${worktree}${opts.preFlow ? '' : ` --task ${task}`} --json`;
  const gate = (command, label, phase) =>
    agent(`Run exactly this command, change nothing, and return its exit code as exitCode and everything it printed, unchanged and in full, as output (the JSON line on standard output must be in it; ERROR lines may follow): ${command}\nIf a command is denied, report it in deniedCommands and do not work around it.`, { model: models.gate, schema: GATE, phase, label });
  const runGate = async (command, label, phase, decide) => {
    let out = await gate(command, label, phase);
    if (denied(out)) return { action: 'denied', detail: denied(out) };
    let decision = decide(out, false);
    if (decision.unreadable) {
      log(`${task}: ${label} gave no readable result; running it once more`);
      out = await gate(command, `${label} (again)`, phase);
      if (denied(out)) return { action: 'denied', detail: denied(out) };
      decision = decide(out, true);
    }
    return decision;
  };
  let pinned;
  let gated = [];
  let rulingUsed = false;
  const approved = Array.isArray(opts.approvedFrozen) ? opts.approvedFrozen.slice() : [];
  const frozenRule = `Never change or delete a file listed in docs/specs/${task}.tests.json; add tests in new files. If a frozen test is wrong, change nothing and return it in frozenTestProblems.`;
  // Every work() call goes through guarded: a wrong frozen test gets one Product Owner ruling, then the frozen-test gate runs.
  // It returns {out} for the caller, or {stop} holding the task's result (blocked, frozen-tests, denied or failed).
  const guarded = async (prompt, label, phase) => {
    const run = (text, name) => work(`${text}\n${frozenRule}`, name, phase);
    let out = await run(prompt, label);
    if (stepOf(out).action === 'owner') {
      if (rulingUsed) return { stop: result('blocked', out.frozenTestProblems) };
      rulingUsed = true;
      const ruling = await agent(
        `${common}
The implementer reports frozen tests that look wrong:
${numbered(out.frozenTestProblems)}
You are the Product Owner. Rule on each. The frozen files are listed in docs/specs/${task}.tests.json. Change a test only when it contradicts the acceptance item or the spec; edit it (and the manifest when the file list changes) and commit with one trailer line per changed path: "Frozen-Test-Change: <path> -- <reason>". Otherwise leave it and say why. Never touch tasks/prd.json. Return rulings (one line per reported test) and changed (every path you changed).`,
        { agentType: 'product-owner', model: models.owner, schema: RULING, phase, label: `rule on frozen tests ${task}` },
      );
      if (!ruling) return { stop: result('failed', 'The Product Owner returned nothing.') };
      if (denied(ruling)) return { stop: result('denied', denied(ruling)) };
      for (const path of ruling.changed || []) if (!approved.includes(path)) approved.push(path);
      out = await run(`${prompt}\nThe Product Owner ruled on the frozen tests you reported:\n${numbered(ruling.rulings || [])}`, `${label} (after ruling)`);
      if (stepOf(out).action === 'owner') return { stop: result('blocked', out.frozenTestProblems) };
    }
    if (!out || denied(out)) return { out };
    const flow = await runGate(flowCommand, `frozen gate ${task}`, phase, (gateOut, final) => decideFrozen(gateOut, approved, pinned, final));
    if (flow.action === 'denied') return { stop: result('denied', flow.detail) };
    if (flow.action === 'stop') return { stop: result('frozen-tests', flow.detail) };
    if (flow.action !== 'pass') return { stop: result('blocked', flow.detail) };
    return { out };
  };

  // 1. Spec
  if (!skipSpec) {
    const specResult = await agent(
      `${common}
Create the worktree if it is missing: git -C ${main} fetch -q && git worktree add ${worktree} -b ${branch} origin/main (run from the main checkout).
If a task in this task's depends_on is not done on origin/main, return that as the only open question ("blocked by <ID>").
If ${spec} already exists with every section, keep it and report on it. Otherwise write it. Do not commit.
Resolve gaps yourself from the task, the code, the docs, and the settled decisions, and write the answers into the spec. Return as open questions only product or design choices the human must make that no settled decision covers; give each its options and a recommendation. Set touchesNative=true if the spec's files to touch include anything under modules/ or apps/tv/android/, or the PlayerEngine port (the engine interface in packages/core/src/domain/playback.ts).`,
      { agentType: 'refiner', model: specModel, schema: SPEC, phase: 'Spec', label: `spec ${task}` },
    );
    if (!specResult) return result('failed', 'The refiner returned nothing.');
    if (denied(specResult)) return result('denied', denied(specResult));
    if (specResult.openQuestions.length) return result('parked', specResult.openQuestions);
    goNative(specResult.touchesNative, 'spec');
  }

  // 2. Check
  if (!skipCheck) {
    const check = await agent(
      `${common}
Check the spec and append your "## Spec check" verdict to it. Set approved=true unless an issue is critical or high; list medium and low issues anyway, prefixed with their severity, and the implementer will resolve them. Return approved and the numbered issues. Set touchesNative=true if the spec's files to touch include anything under modules/ or apps/tv/android/, or the PlayerEngine port (the engine interface in packages/core/src/domain/playback.ts).`,
      { agentType: 'spec-checker', model: checkModel, schema: CHECK, phase: 'Check', label: `check ${task}` },
    );
    if (!check) return result('failed', 'The spec-checker returned nothing.');
    goNative(check.touchesNative, 'spec check');
    if (!check.approved) {
      const revised = await agent(
        `${common}
The spec check found critical or high issues. Revise the spec to fix them and remove the old "## Spec check" section.
${numbered(check.issues)}
Return as open questions only product or design choices the human must make that no settled decision covers.`,
        { agentType: 'refiner', model: specModel, schema: SPEC, phase: 'Check', label: `revise ${task}` },
      );
      if (!revised) return result('failed', 'The spec revision returned nothing.');
      if (revised.openQuestions.length) return result('parked', revised.openQuestions);
      specNotes = specNotes.concat(['The spec was revised after a check; re-read it before implementing.']);
    } else {
      specNotes = specNotes.concat(check.issues);
    }
  }

  // 2b. Tests: failing tests first, frozen in one commit; the red gate stops the run if any already passes
  const testsPrompt = `${common}
Write the failing tests for ${task}: turn each acceptance item of the spec's Acceptance table into behaviour-level tests, following its Test plan. Write no implementation and no stub. Search the existing tests for expectations the spec changes and update them in the same commit.
Write the manifest docs/specs/${task}.tests.json as .claude/agents/test-writer.md describes: files, and one entry per acceptance item numbered from 1, each a run (an argument list starting with node or pnpm that selects only that item's tests) or a gate that the spec names with "gate: <kind>" in the item's Acceptance row. Add no gate the spec does not name.
Run each run and confirm it fails for the intended reason.
Commit the tests, fixtures and manifest as one commit with the subject "test(${task}): freeze failing acceptance tests". If docs/specs/${task}.tests.json already exists on this branch (a rerun), amend the freeze commit with git commit --amend instead of adding a commit that touches the manifest or a test.${specNotes.length ? `\nSpec-check notes:\n${specNotes.join('\n')}` : ''}
Do not push. Return done=true once committed, and put anything that stops you in blockers.`;
  const testsRetry = (problems) => `${testsPrompt}\nThe red gate found these problems with the frozen tests:\n${problems}\nFix them and amend the freeze commit with git commit --amend; a second commit that touches the manifest or a test fails the frozen check.`;
  const writeTests = (text, label) => agent(text, { agentType: 'test-writer', model: testsModel, schema: TESTS, phase: 'Tests', label });
  if (!skipTests) {
    const written = await writeTests(testsPrompt, `tests ${task}`);
    if (!written) return result('failed', 'The test writer returned nothing.');
    if (denied(written)) return result('denied', denied(written));
    if (!written.done) return result('blocked', written.blockers || []);
    let red = await runGate(redCommand, `red gate ${task}`, 'Tests', decideRed);
    if (red.action === 'retry') {
      const again = await writeTests(testsRetry(red.detail), `tests ${task} (retry)`);
      if (!again) return result('failed', 'The test writer returned nothing on the retry.');
      if (denied(again)) return result('denied', denied(again));
      red = await runGate(redCommand, `red gate ${task} (after retry)`, 'Tests', decideRed);
    }
    if (red.action === 'denied') return result('denied', red.detail);
    if (red.action === 'stop') return result('tests-green', red.detail);
    if (red.action !== 'pass') return result('blocked', red.detail);
    pinned = red.blobs;
    gated = red.gates;
    if (gated.length) log(`${task}: gated items, not tests: ${gated.map((entry) => `${entry.item} (${entry.kind})`).join(', ')}`);
  }

  // 3. Implement (the implementer runs the checks itself)
  let evidence = opts.evidence || `See the evidence field of ${task} (\`${taskCli} show ${task}\`) on ${branch}.`;
  let ciSteps = Array.isArray(opts.ciSteps) ? opts.ciSteps : [];
  if (!skipImpl) {
  const implRun = await guarded(
    `Implement the approved spec.${specNotes.length ? `\nAlso resolve these spec-check notes, updating the spec where they change it:\n${specNotes.join('\n')}` : ''}
Commit the spec with the work, one milestone per commit. Set the task's status to in_progress with \`${taskCli} set ${task} --status in_progress --owner ${implAgent} --evidence-file <file>\`. ${evidenceRule} Do not push or open a PR. If an acceptance item can only be met with a pushed branch, an open PR, or CI runs (for example a throwaway commit that must fail CI, or baselines rendered on the CI host), do everything else, set done=true, and list each such step in ciSteps; the Ship phase does them. Never list a review (guardian, design, or any other agent review) as a ciStep: reviews happen in the Review phase, and the Ship phase cannot start agents. Return done=false with blockers if you cannot finish for any other reason. Use ciOnly only for a step that a local run cannot produce (for example accepting CI-rendered baselines or attaching CI screenshots), and only when every local check passed; a failing local check is never ciOnly.`,
    `implement ${task}`,
    'Implement',
  );
  if (implRun.stop) return implRun.stop;
  const impl = implRun.out;
  if (!impl) return result('failed', 'The implementer returned nothing.');
  if (denied(impl)) return result('denied', denied(impl));
  if (!impl.done || !impl.checksPassed) return result('blocked', (impl.blockers || []).concat(impl.failures || []));
  evidence = impl.evidence;
  ciSteps = ciSteps.concat(impl.ciSteps || []).concat(impl.ciOnly || []);
  }

  // 4. Review (one round)
  const review = await agent(
    `${common}
Review git diff origin/main...${branch} against the spec, the task acceptance, and the hard rules. If the diff touches apps/tv screens, shared controls, or design tokens, also do the design review: follow .claude/skills/change-review/references/design-checklist.md against DESIGN.md and look at the captures from pnpm tv:visual (T3-07) when it exists. Also judge whether each frozen test (listed in docs/specs/${task}.tests.json) really checks its acceptance item${gated.length ? `, and check each gated item against the spec's Acceptance table: ${gated.map((entry) => `item ${entry.item} (${entry.kind}: ${entry.why})`).join('; ')}` : ''}. This is the only review round. Change no files. Return every finding with its severity, file:line, and a concrete failure scenario. Return filesChanged: every path from git diff --name-only origin/main...${branch}. Set needsGuardian=true if the diff touches the gateway, negotiation, the player, redaction, tokens, a native method or event, Kotlin, the native HTTP client, or docs/security.md, or if the task's acceptance asks for a guardian review.`,
    { agentType: reviewAgent, model: reviewModel, schema: REVIEW, phase: 'Review', label: `review ${task}` },
  );
  if (!review) return result('failed', 'The reviewer returned nothing.');
  const riskyFiles = (review.filesChanged || []).filter((path) => HIGH_RISK_PATH.test(path));
  // A diff that reached Kotlin sends its follow-up fixes to native-engineer; the guardian below covers the review.
  if (!native && (review.filesChanged || []).some((path) => NATIVE_PATH.test(path))) {
    implAgent = 'native-engineer';
    implModel = models.implement.native;
    log(`${task}: the diff touches Kotlin or a native module; follow-ups go to native-engineer`);
  }
  if ((review.needsGuardian || riskyFiles.length) && reviewAgent !== 'guardian') {
    log(`${task}: the diff touches high-risk code; adding a guardian review`);
    const guard = await agent(
      `${common}
Adversarially review git diff origin/main...${branch} for token, URL, or session-ID leaks, redaction coverage, direct-play and negotiation changes, and native safety. Change no files. Return every finding with its severity, file:line, and a concrete failure scenario.`,
      { agentType: 'guardian', model: models.guardian, schema: REVIEW, phase: 'Review', label: `guardian ${task}` },
    );
    if (guard) review.findings = review.findings.concat(guard.findings);
  }
  const describe = (finding) => `[${finding.severity}] ${finding.where}: ${finding.summary}`;
  const blocking = review.findings.filter((finding) => finding.severity !== 'low').map(describe);
  const lows = review.findings.filter((finding) => finding.severity === 'low').map(describe);
  log(`${task}: review found ${blocking.length} to fix, ${lows.length} low`);
  const followUpRun = await guarded(
    `${blocking.length ? `Fix these review findings and commit, with a test for each behavior change:\n${blocking.join('\n')}` : 'No review findings need a fix.'}
${lows.length ? `Log these low findings as follow-ups in the active plan and commit; do not fix them:\n${lows.join('\n')}` : ''}
Then, if every acceptance item is met (the review above counts as the fresh-context design review; the Ship phase links screenshots) and the spec does not reserve sign-off for the human, set the task's status to done with \`${taskCli} set ${task} --status done --evidence-file <file>\` (passes follows status). ${evidenceRule} Because no PR exists yet, the evidence must contain \`commit <sha>\`. Then tick its line in the active plan, and commit. Do not push.${ciSteps.length ? `\nThese acceptance steps need CI and are done in the Ship phase, so treat them as pending (not as blockers) and leave status in_progress:\n${ciSteps.join('\n')}` : ''}
Use ciOnly only for a step that a local run cannot produce (for example accepting CI-rendered baselines or attaching CI screenshots), and only when every local check passed; a failing local check is never ciOnly.`,
    `follow-ups ${task}`,
    'Review',
  );
  if (followUpRun.stop) return followUpRun.stop;
  const followUp = followUpRun.out;
  if (!followUp) return result('failed', 'The follow-up agent returned nothing.');
  if (denied(followUp)) return result('denied', denied(followUp));
  // With CI steps pending, a not-done follow-up whose checks pass hands its blockers to Ship, which refuses to merge if it cannot clear them.
  if (!followUp.checksPassed || (!followUp.done && !ciSteps.length)) return result('blocked', (followUp.blockers || []).concat(followUp.failures || []));
  if (!followUp.done) ciSteps = ciSteps.concat(followUp.blockers || []);
  evidence = followUp.evidence || evidence;
  ciSteps = mergeUnique(ciSteps, (followUp.ciSteps || []).concat(followUp.ciOnly || []));
  // Every frozen run must now pass, including any that pnpm check does not cover.
  if (!opts.preFlow) {
    const green = await runGate(`${redCommand} --expect green`, `green gate ${task}`, 'Review', decideGreen);
    if (green.action === 'denied') return result('denied', green.detail);
    if (green.action !== 'pass') return result('blocked', green.detail);
  }

  // 5. Ship (CI fixes go through the same retry and Fable escalation)
  const shipPrompt = `${common}
Ship with the ship skill: rebase onto origin/main if it moved (force-with-lease is allowed on this branch), push, open the PR if none exists, enable auto-merge with rebase, and wait for CI with gh pr checks --watch. The PR body must explain user impact, testing (use the evidence below), conversion and security implications, untested device, Jellyfin and Jellyscale gates, and call out any change to invariants, docs/security.md, release signing, or CI. For a UI change, add a Screenshots section that links the visual artifact from the PR's CI run (gh api repos/{owner}/{repo}/actions/runs/<run>/artifacts) and names the images that changed, plus a Design review notes section from the review. Change no source files. If CI is red, return merged=false with each failing check and its cause. Fill the PR body's Frozen tests section from the changes list that \`${nodeCli('check-flow.mjs')} --repo ${worktree} --json\` prints (or write "none changed"). After a merge, run git -C ${main} pull --ff-only and remove the worktree and branch.
Evidence: ${evidence}
Review: ${blocking.length} fixed, ${lows.length} low logged in the plan.${ciSteps.length ? `
Before enabling auto-merge, do these CI-dependent acceptance steps on this PR branch. Temporary commits are allowed only when a step asks for one, and each must be reverted in a later commit. Record each run URL in the task's evidence. Then, if every acceptance item is met, set the task's status to done with \`${taskCli} set ${task} --status done --evidence-file <file>\` (passes follows status), commit, and push. ${evidenceRule} If any listed step cannot be completed (for example it needs a review or a human), do not enable auto-merge; return merged=false and put the reason in ciFailures. This is the one case where the Ship phase changes files:
${ciSteps.join('\n')}` : ''}`;
  const shipEffort = ciSteps.length ? 'medium' : 'low';
  let ship = await agent(shipPrompt, { model: models.ship, effort: shipEffort, schema: SHIP, phase: 'Ship', label: `ship ${task}` });
  if (!ship) return result('failed', 'The ship agent returned nothing.');
  if (denied(ship)) return result('denied', denied(ship));
  if (!ship.merged && ship.ciFailures && ship.ciFailures.length) {
    const fixedRun = await guarded(`CI failed on the PR. Fix the cause and commit. Do not push, amend, squash or rebase: the run checks the frozen tests first, and the Ship step pushes afterwards.\n${ship.ciFailures.join('\n')}`, `fix CI ${task}`, 'Ship');
    if (fixedRun.stop) return fixedRun.stop;
    const fixed = fixedRun.out;
    if (denied(fixed)) return result('denied', denied(fixed));
    if (fixed && (fixed.ciOnly || []).length) log(`${task}: the CI fix left CI-only steps for the human: ${fixed.ciOnly.join('; ')}`);
    ship = await agent(shipPrompt, { model: models.ship, effort: shipEffort, schema: SHIP, phase: 'Ship', label: `ship ${task} (retry)` });
  }
  if (!ship || !ship.merged) return result('ci-red', ship ? { prUrl: ship.prUrl, ciFailures: ship.ciFailures } : 'The ship retry returned nothing.');
  return { task, outcome: 'merged', prUrl: ship.prUrl, fixed: blocking, lowsLogged: lows };
}

const outcomes = [];
for (const task of items) {
  const out = await runTask(task, items.length === 1 ? input : { risk: input.risk, native: input.native, root: input.root });
  outcomes.push(out);
  if (STOP_OUTCOMES.includes(out.outcome)) {
    log(`Stopping: ${out.outcome} in ${task}`);
    break;
  }
}
return {
  merged: outcomes.filter((o) => o.outcome === 'merged'),
  parked: outcomes.filter((o) => o.outcome === 'parked'),
  needsAttention: outcomes.filter((o) => !['merged', 'parked'].includes(o.outcome)),
  notRun: items.slice(outcomes.length),
};
