// Run: node --test .claude/workflows/task.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const src = readFileSync(new URL('./task.js', import.meta.url), 'utf8');
const block = src.split('// MODELS-BEGIN')[1].split('\n').slice(1).join('\n').split('// MODELS-END')[0];
const { MODELS, resolveModels } = new Function(`${block}; return { MODELS, resolveModels };`)();
const stepBlock = src.split('// STEP-BEGIN')[1].split('\n').slice(1).join('\n').split('// STEP-END')[0];
const { mergeUnique, decideStep } = new Function(`${stepBlock}; return { mergeUnique, decideStep };`)();
const gateBlock = src.split('// GATE-BEGIN')[1].split('\n').slice(1).join('\n').split('// GATE-END')[0];
const { STOP_OUTCOMES, readGate, decideRed, decideGreen, decideFrozen } = new Function(
  `${gateBlock}; return { STOP_OUTCOMES, readGate, decideRed, decideGreen, decideFrozen };`,
)();

test('no override returns the defaults', () => {
  assert.deepEqual(resolveModels(MODELS, undefined), MODELS);
});

test('defaults match AGENTS.md rules', () => {
  assert.equal(MODELS.spec.high, 'fable');
  assert.equal(MODELS.spec.routine, 'opus');
  assert.equal(MODELS.check.native, 'fable');
  assert.equal(MODELS.implement.routine, 'sonnet');
  assert.equal(MODELS.implement.native, 'opus');
  assert.equal(MODELS.guardian, 'opus');
  assert.equal(MODELS.escalate, 'fable');
  assert.deepEqual(MODELS, {
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
  });
});

test('every MODELS leaf is a valid model name', () => {
  const leaves = (node) => (typeof node === 'string' ? [node] : Object.values(node).flatMap(leaves));
  for (const leaf of leaves(MODELS)) assert.ok(['haiku', 'sonnet', 'opus', 'fable'].includes(leaf), leaf);
});

test('partial override is deep-merged and does not mutate defaults', () => {
  const out = resolveModels(MODELS, { spec: { high: 'opus' }, check: { high: 'opus' }, escalate: 'opus' });
  assert.equal(out.spec.high, 'opus');
  assert.equal(out.spec.routine, 'opus');
  assert.equal(out.check.native, 'fable');
  assert.equal(out.escalate, 'opus');
  assert.equal(MODELS.spec.high, 'fable');
});

test('unknown keys fail fast', () => {
  assert.throws(() => resolveModels(MODELS, { bogus: 'opus' }), /Unknown models key "bogus"/);
  assert.throws(() => resolveModels(MODELS, { spec: { huge: 'opus' } }), /Unknown models key "spec.huge"/);
});

test('values outside haiku, sonnet, opus, fable are rejected', () => {
  assert.throws(() => resolveModels(MODELS, { ship: 'gpt' }), /must be one of/);
  assert.throws(() => resolveModels(MODELS, { spec: { high: 5 } }), /must be one of/);
});

test('shape errors are rejected', () => {
  assert.throws(() => resolveModels(MODELS, 'opus'), /must be an object/);
  assert.throws(() => resolveModels(MODELS, { spec: 'opus' }), /must be an object/);
  assert.throws(() => resolveModels(MODELS, { ship: { a: 'opus' } }), /must be one of/);
});

test('failing checks with ciOnly are not a handoff', () => {
  const out = { done: false, checksPassed: false, failures: [], blockers: [], ciOnly: ['unit test X fails'] };
  assert.equal(decideStep(out, false).action, 'retry');
  assert.equal(decideStep({ ...out, done: true }, false).action, 'retry');
  assert.equal(decideStep({ ...out, done: false, checksPassed: true }, false).action, 'retry');
});

test('passing checks with only ciOnly is a handoff carrying the items', () => {
  const out = { done: true, checksPassed: true, failures: [], blockers: [], ciOnly: ['accept baselines'] };
  assert.deepEqual(decideStep(out, false), { action: 'done', ciOnly: ['accept baselines'] });
});

test('a mix of failures and ciOnly retries', () => {
  const out = { done: true, checksPassed: true, failures: ['a.test.ts:3'], blockers: [], ciOnly: ['accept baselines'] };
  assert.equal(decideStep(out, false).action, 'retry');
});

test('denied and empty results', () => {
  assert.equal(decideStep({ done: true, checksPassed: true }, true).action, 'denied');
  assert.equal(decideStep(null, false).action, 'none');
});

test('ciOnly merges across attempts without duplicates', () => {
  assert.deepEqual(mergeUnique(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']);
  assert.deepEqual(mergeUnique(['a'], undefined), ['a']);
  assert.deepEqual(mergeUnique(undefined, undefined), []);
});

const pathsBlock = src.split('// PATHS-BEGIN')[1].split('\n').slice(1).join('\n').split('// PATHS-END')[0];
const { REPO, taskPaths, HIGH_RISK_PATH, NATIVE_PATH } = new Function(`${pathsBlock}; return { REPO, taskPaths, HIGH_RISK_PATH, NATIVE_PATH };`)();

test('the worktree and branch come from the repository name and the task id', () => {
  assert.equal(REPO, 'octave');
  assert.deepEqual(taskPaths('T3-01'), { main: '.', worktree: '../octave-T3-01', branch: 'task/T3-01', spec: 'docs/specs/T3-01.md' });
  assert.deepEqual(taskPaths('T10-13', '/srv/code'), {
    main: '/srv/code/octave',
    worktree: '/srv/code/octave-T10-13',
    branch: 'task/T10-13',
    spec: 'docs/specs/T10-13.md',
  });
});

test('task ids outside the T<phase>-<nn> form are refused', () => {
  for (const bad of ['P13-08', 'T3-1', 't3-01', 'T3-01; rm -rf /', '', undefined]) {
    assert.throws(() => taskPaths(bad), /Unknown task id/);
  }
});

test('the high-risk paths name the core negotiation, gateway, player and redaction code, native code and the security document', () => {
  for (const path of [
    'packages/core/src/jellyfin/gateway.ts',
    'packages/core/src/jellyfin/source-acceptance.ts',
    'packages/core/src/player/coordinator.ts',
    'packages/core/src/redact.ts',
    'src/lib/jellyfin/gateway.ts',
    'src/lib/player/coordinator.ts',
    'src/lib/redact.ts',
    'src/domain/playback.ts',
    'modules/player/android/src/main/java/dev/octave/player/Player.kt',
    'modules/http/android/src/main/java/dev/octave/http/Client.kt',
    'apps/tv/android/app/src/main/AndroidManifest.xml',
    'docs/security.md',
    'tests/fixtures/hls-playlists.json',
    'packages/core/tests/fixtures/hls-playlists.json',
    'packages/core/tests/fixtures/hls-master-urls.json',
    'packages/core/tests/fixtures/host-classes.json',
  ]) {
    assert.ok(HIGH_RISK_PATH.test(path), path);
  }
  for (const path of ['apps/tv/src/screens/home.tsx', 'README.md', 'src/domain/catalog.ts', 'packages/core/src/domain/catalog.ts']) {
    assert.ok(!HIGH_RISK_PATH.test(path), path);
  }
});

test('Kotlin under modules/ and apps/tv/android routes to the native engineer', () => {
  assert.ok(NATIVE_PATH.test('modules/player/android/Player.kt'));
  assert.ok(NATIVE_PATH.test('apps/tv/android/app/build.gradle'));
  assert.ok(!NATIVE_PATH.test('apps/tv/src/app.tsx'));
});

test('the verify step runs the TV commands, not the desktop ones', () => {
  const verify = src.split('const VERIFY_STEPS =')[1].split('\n')[1];
  for (const command of ['pnpm check', 'pnpm test:tripwire', 'pnpm tv:native:test', 'pnpm tv:e2e', 'pnpm tv:wire', 'pnpm tv:visual']) {
    assert.ok(verify.includes(command), command);
  }
  for (const gone of ['test:e2e', 'test:visual', 'cargo']) assert.ok(!verify.includes(gone), gone);
});

// Prompt text lives inside runTask, outside the pure blocks, so slice the source by stable anchors.
const between = (from, to) => {
  const start = src.indexOf(from);
  const end = src.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `anchors ${from} .. ${to}`);
  return src.slice(start, end);
};
const commonPrompt = between('const common =', 'const result =');
const implementPrompt = between('Implement the approved spec.', '`implement ${task}`');
const followUpPrompt = between('Fix these review findings', '`follow-ups ${task}`');
const shipPromptText = between('const shipPrompt', 'const shipEffort');

test('task.js never tells agents to use jq', () => {
  assert.doesNotMatch(src, /\bjq\b/);
});

test('the common prompt reads one task through the CLI and never the whole file', () => {
  assert.match(commonPrompt, /show \$\{task\}/);
  assert.match(commonPrompt, /never read the whole file/);
  assert.match(src, /const taskCli = `mise exec -- node \$\{worktree\}\/scripts\/task\.mjs`/);
});

test('the implement, follow-up and Ship prompts set the task through the CLI with the evidence rule', () => {
  for (const [name, prompt] of [['implement', implementPrompt], ['follow-up', followUpPrompt], ['ship', shipPromptText]]) {
    assert.match(prompt, /\$\{taskCli\} set \$\{task\}/, name);
    assert.match(prompt, /\$\{evidenceRule\}/, name);
  }
  assert.match(implementPrompt, /--status in_progress --owner \$\{implAgent\}/);
  assert.match(followUpPrompt, /--status done/);
  assert.match(followUpPrompt, /commit <sha>/);
  assert.match(src, /const evidenceRule = .*PR #n.*commit <sha>.*600 characters/);
});

test('no prompt uses pnpm to set a task', () => {
  assert.doesNotMatch(src, /pnpm (-C \S+ )?task/);
});

// ---- T1-12: the test-first flow ----

// Comments hold words such as work( that the call-site tests must not count.
const code = src
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .map((line) => line.replace(/\s\/\/ .*$/, ''))
  .join('\n');
const metaText = src.slice(src.indexOf('export const meta ='), src.indexOf('// args:')).replace('export const meta', 'const meta');
const meta = new Function(`${metaText}; return meta;`)();
const gateJson = (body, exitCode = 0) => ({ exitCode, output: `noise\n${JSON.stringify(body)}`, deniedCommands: [] });

test('the models for the test writer, the owner ruling and the gate agent are fixed, and the owner cannot be overridden', () => {
  assert.deepEqual(MODELS.tests, { routine: 'sonnet', native: 'opus' });
  assert.equal(MODELS.owner, 'fable');
  assert.equal(MODELS.gate, 'haiku');
  assert.throws(() => resolveModels(MODELS, { owner: 'sonnet' }), /owner.*cannot be overridden/);
  assert.equal(resolveModels(MODELS, { gate: 'sonnet' }).gate, 'sonnet');
});

test('the phases run Spec, Check, Tests, Implement, Review, Ship', () => {
  assert.deepEqual(meta.phases.map((phase) => phase.title), ['Spec', 'Check', 'Tests', 'Implement', 'Review', 'Ship']);
});

test('the from comment and whenToUse name the tests phase and the new args', () => {
  assert.match(meta.whenToUse, /"tests"/);
  const comment = src.slice(src.indexOf('// args:'), src.indexOf('// MODELS-BEGIN'));
  assert.match(comment, /from: "check" \| "tests" \| "implement" \| "review"/);
  assert.match(comment, /preFlow/);
  assert.match(comment, /approvedFrozen/);
});

test('readGate takes the last JSON line even when ERROR lines follow it', () => {
  const body = { ok: false, missingManifest: true, problems: ['x'] };
  const gate = { exitCode: 1, output: `${JSON.stringify(body)}\nERROR frozen test: no manifest\n`, deniedCommands: [] };
  assert.deepEqual(readGate(gate), body);
  assert.equal(decideFrozen(gate, [], undefined, false).action, 'blocked');
  assert.equal(readGate({ exitCode: 1, output: 'ERROR only\nmore', deniedCommands: [] }), null);
});

test('the gate prompt asks for the whole output, so the JSON line is never dropped for a trailing ERROR line', () => {
  const prompt = between('const gate = (command, label, phase) =>', 'const runGate');
  assert.match(prompt, /everything it printed/);
  assert.doesNotMatch(prompt, /last line/);
});

test('the CI fix does not push, and the Product Owner pass cleans up on every exit but a merge', () => {
  const ciFix = between('const fixedRun = await guarded', "if (fixed && (fixed.ciOnly");
  assert.match(ciFix, /Do not push/);
  const pass = readFileSync(new URL('./product-owner.js', import.meta.url), 'utf8');
  assert.match(pass, /worktree remove --force/);
  for (const outcome of ['failed', 'denied', 'nothing-to-do', 'ci-red']) assert.match(pass, new RegExp(`leave\\(\\{ outcome: '${outcome}'`), outcome);
  assert.doesNotMatch(pass, /return \{ outcome: '(failed|denied|nothing-to-do|ci-red)'/);
});

test('STOP_OUTCOMES holds the three outcomes that end a whole batch', () => {
  assert.deepEqual(STOP_OUTCOMES, ['denied', 'tests-green', 'frozen-tests']);
  assert.match(code, /STOP_OUTCOMES\.includes\(out\.outcome\)/);
});

test('decideRed stops on a green item, retries on problems or unreadable output, and passes only on a clean exit 0', () => {
  const red = { task: 'T9-01', red: [1], green: [], gates: [], blobs: { 'a.test.ts': 'abc' }, problems: [] };
  assert.equal(decideRed(gateJson({ ...red, green: [2], red: [1] }, 1)).action, 'stop');
  assert.match(decideRed(gateJson({ ...red, green: [2] }, 1)).detail, /2/);
  assert.equal(decideRed(gateJson({ ...red, problems: ['ERROR manifest: x'] }, 2)).action, 'retry');
  assert.equal(decideRed({ exitCode: 0, output: 'not json' }).action, 'retry');
  assert.equal(decideRed({ exitCode: 0, output: 'not json' }).unreadable, true);
  assert.equal(decideRed(null).action, 'retry');
  const pass = decideRed(gateJson(red));
  assert.equal(pass.action, 'pass');
  assert.deepEqual(pass.blobs, { 'a.test.ts': 'abc' });
  assert.equal(decideRed(gateJson(red, 1)).action, 'retry');
});

test('decideRed hands back the gated items', () => {
  const out = decideRed(gateJson({ red: [], green: [], gates: [{ item: 2, kind: 'owner', why: 'w' }], blobs: {}, problems: [] }));
  assert.deepEqual(out.gates, [{ item: 2, kind: 'owner', why: 'w' }]);
});

test('decideGreen passes when every run passes and blocks on a red item or a problem', () => {
  assert.equal(decideGreen(gateJson({ red: [], green: [1], gates: [], problems: [] })).action, 'pass');
  assert.equal(decideGreen(gateJson({ red: [1], green: [], gates: [], problems: [] }, 1)).action, 'blocked');
  assert.equal(decideGreen(gateJson({ red: [], green: [], gates: [], problems: ['ERROR red: x'] }, 2)).action, 'blocked');
  assert.equal(decideGreen({ exitCode: 0, output: 'x' }).unreadable, true);
});

const flow = (extra = {}) => ({ ok: true, commits: 2, manifests: [], changes: [], frozen: [{ path: 'a.test.ts', blob: 'b1' }], taskListChanged: false, missingManifest: false, problems: [], ...extra });

test('decideFrozen passes a clean result and stops on a problem', () => {
  assert.equal(decideFrozen(gateJson(flow()), [], { 'a.test.ts': 'b1' }).action, 'pass');
  assert.equal(decideFrozen(gateJson(flow({ ok: false, problems: ['ERROR frozen test: a.test.ts differs'] }), 1), [], {}).action, 'stop');
});

test('decideFrozen stops on a trailered change the Product Owner step did not return, and passes one it did', () => {
  const changed = flow({ changes: [{ path: 'a.test.ts', commit: 'c', reason: 'r' }], frozen: [{ path: 'a.test.ts', blob: 'b2' }] });
  assert.equal(decideFrozen(gateJson(changed), [], { 'a.test.ts': 'b1' }).action, 'stop');
  assert.equal(decideFrozen(gateJson(changed), ['a.test.ts'], { 'a.test.ts': 'b1' }).action, 'pass');
});

test('decideFrozen stops when an amended freeze commit moved a frozen blob that was not approved', () => {
  const amended = flow({ frozen: [{ path: 'a.test.ts', blob: 'b2' }] });
  const out = decideFrozen(gateJson(amended), [], { 'a.test.ts': 'b1' });
  assert.equal(out.action, 'stop');
  assert.match(out.detail, /a\.test\.ts/);
  assert.equal(decideFrozen(gateJson(amended), ['a.test.ts'], { 'a.test.ts': 'b1' }).action, 'pass');
  assert.equal(decideFrozen(gateJson(flow({ frozen: [] })), [], { 'a.test.ts': 'b1' }).action, 'stop');
  assert.equal(decideFrozen(gateJson(amended), [], undefined).action, 'pass');
});

test('decideFrozen retries unreadable output once and then fails closed; a missing manifest only blocks the task', () => {
  const unreadable = decideFrozen({ exitCode: 0, output: 'oops' }, [], {});
  assert.equal(unreadable.action, 'retry');
  assert.equal(unreadable.unreadable, true);
  assert.equal(decideFrozen({ exitCode: 0, output: 'oops' }, [], {}, true).action, 'stop');
  assert.equal(decideFrozen(null, [], {}, true).action, 'stop');
  assert.equal(decideFrozen(gateJson(flow({ ok: false, missingManifest: true, problems: ['ERROR frozen test: no manifest'] }), 1), [], {}).action, 'blocked');
});

test('decideStep sends frozen-test problems to the owner after none and denied and before done and retry', () => {
  const green = { done: true, checksPassed: true, failures: [], blockers: [], frozenTestProblems: ['a.test.ts: wrong expectation'] };
  assert.equal(decideStep(green, false).action, 'owner');
  assert.equal(decideStep({ ...green, done: false, checksPassed: false }, false).action, 'owner');
  assert.equal(decideStep(green, true).action, 'denied');
  assert.equal(decideStep(null, false).action, 'none');
  assert.equal(decideStep({ ...green, frozenTestProblems: [] }, false).action, 'done');
});

test('guarded wraps every work call: three call sites, and work is called only inside guarded', () => {
  assert.equal((code.match(/\bguarded\(/g) || []).length, 3);
  const start = code.indexOf('const guarded =');
  const end = code.indexOf('if (!skipSpec)');
  assert.ok(start > 0 && end > start);
  const calls = [...code.matchAll(/\bwork\(/g)].map((match) => match.index);
  assert.ok(calls.length >= 1);
  for (const index of calls) assert.ok(index > start && index < end, `work( at ${index} is outside guarded`);
});

test('guarded hands blocked and frozen-tests back to runTask, and the CI fix goes through it', () => {
  const guardedText = between('const guarded =', '// 1. Spec');
  assert.match(guardedText, /result\('frozen-tests'/);
  assert.match(guardedText, /result\('blocked'/);
  const ciFix = between('const fixedRun = await guarded', "if (fixed && (fixed.ciOnly");
  assert.match(ciFix, /guarded\(/);
  assert.match(ciFix, /\.stop/);
});

const testsPrompt = between('const testsPrompt', 'const testsRetry');
const testsRetry = between('const testsRetry', '// 3. Implement');

test('the Tests step runs the test-writer between the spec check and the implementer', () => {
  const check = code.indexOf("agentType: 'spec-checker'");
  const writer = code.indexOf("agentType: 'test-writer'");
  const implement = code.indexOf('Implement the approved spec.');
  assert.ok(check > 0 && writer > check && implement > writer);
  assert.match(code, /agentType: 'test-writer', model: testsModel/);
});

test('the Tests prompt names the manifest, each acceptance item, the commit and no implementation', () => {
  assert.match(testsPrompt, /docs\/specs\/\$\{task\}\.tests\.json/);
  assert.match(testsPrompt, /each acceptance item/);
  assert.match(testsPrompt, /commit/);
  assert.match(testsPrompt, /no implementation/i);
  assert.match(testsPrompt, /specNotes/);
});

test('the Tests prompt and its retry amend the freeze commit when the manifest already exists', () => {
  assert.match(testsPrompt, /already exists on this branch[^]*amend/i);
  assert.match(testsPrompt, /git commit --amend/);
  assert.match(testsRetry, /amend/i);
});

test('the red gate stops with tests-green and reruns once after a retry', () => {
  assert.match(code, /result\('tests-green'/);
  assert.match(code, /check-red\.mjs \$\{task\} --repo \$\{worktree\}/);
  assert.match(code, /--expect green/);
});

test('the gate agent has no agent type and runs on the gate model', () => {
  const gateText = between('const gate =', 'const runGate');
  assert.doesNotMatch(gateText, /agentType/);
  assert.match(gateText, /models\.gate/);
  assert.match(gateText, /Run exactly this command/);
});

test('every guarded prompt forbids editing frozen files and sends wrong ones to frozenTestProblems', () => {
  const rule = between('const frozenRule', '// Every work() call');
  assert.match(rule, /Never change or delete a file listed in docs\/specs\/\$\{task\}\.tests\.json/);
  assert.match(rule, /frozenTestProblems/);
  assert.match(between('const guarded =', 'const out'), /\$\{frozenRule\}/);
});

test('the review prompt judges the frozen tests and the Ship prompt fills the Frozen tests section', () => {
  const reviewPrompt = between('Review git diff origin/main', '`review ${task}`');
  assert.match(reviewPrompt, /frozen test/i);
  assert.match(shipPromptText, /Frozen tests/);
  assert.match(shipPromptText, /check-flow\.mjs/);
  assert.match(read('.github/pull_request_template.md'), /## Frozen tests/);
});

test('the Product Owner ruling runs the product-owner agent on the fixed owner model', () => {
  assert.match(code, /agentType: 'product-owner', model: models\.owner/);
  const pass = readFileSync(new URL('./product-owner.js', import.meta.url), 'utf8');
  assert.match(pass, /agentType: 'product-owner', model: 'fable'/);
});

test('the agent files carry the models and the frozen-test rules', () => {
  assert.match(read('.claude/agents/product-owner.md'), /^model: fable$/m);
  assert.match(read('.claude/agents/test-writer.md'), /^model: sonnet$/m);
  assert.match(read('.claude/agents/test-writer.md'), /manifest/);
  for (const agent of ['implementer', 'native-engineer']) assert.match(read(`.claude/agents/${agent}.md`), /frozen test/i, agent);
  assert.match(read('.claude/agents/refiner.md'), /gate: <kind>/);
  assert.match(read('.claude/agents/spec-checker.md'), /gate/);
});

test('AGENTS.md, WORKFLOW.md and the rules each say the owner can veto', () => {
  assert.match(read('AGENTS.md'), /owner can veto/);
  assert.match(read('WORKFLOW.md'), /owner can veto|owner's veto|veto/);
  const rules = JSON.parse(read('tasks/prd.json')).rules;
  assert.ok(rules.some((rule) => /owner can veto/.test(rule)));
});

test('WORKFLOW.md lists the flow in the order it runs, matching the phases', () => {
  const doc = read('WORKFLOW.md');
  const section = doc.split('## The task flow, in the order it runs')[1].split('\n## ')[0];
  const steps = [...section.matchAll(/^\d+\. \*\*([^*]+)\*\*/gm)].map((match) => match[1].trim().replace(/\.$/, ''));
  assert.equal(steps[0], 'Product Owner pass');
  assert.deepEqual(steps.slice(1), meta.phases.map((phase) => phase.title));
});

// ---- the frozen-test check against a real git repository ----
const FLOW = join(root, 'scripts', 'check-flow.mjs');
const PRD = JSON.stringify(
  { product: 'p', updated: 'd', rules: ['r'], status_values: ['todo'], phases: [{ id: 'T9', tasks: [{ id: 'T9-01', title: 't', acceptance: ['one', 'two'], status: 'todo', owner: null, passes: false, evidence: '' }] }] },
  null,
  2,
) + '\n';
const MANIFEST = 'docs/specs/T9-01.tests.json';
const MANIFEST_BODY = JSON.stringify({ task: 'T9-01', files: ['src/a.test.ts'], items: [{ item: 1, run: ['node', '-e', 'process.exit(1)'] }, { item: 2, run: ['node', '-e', 'process.exit(1)'] }] });
const dirs = [];
process.on('exit', () => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'flow-'));
  dirs.push(dir);
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const put = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (message, files = {}) => {
    for (const [path, text] of Object.entries(files)) put(path, text);
    git('add', '-A');
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  commit('base', { 'tasks/prd.json': PRD, 'src/shared.txt': 'one\ntwo\nthree\nfour\nfive\n' });
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const check = (...extra) => {
    const out = spawnSync(process.execPath, [FLOW, ...extra], { cwd: dir, encoding: 'utf8' });
    return { status: out.status, stdout: out.stdout, stderr: out.stderr };
  };
  return { dir, git, put, commit, check };
}
const freeze = (r) => r.commit('test(T9-01): freeze', { [MANIFEST]: MANIFEST_BODY, 'src/a.test.ts': 'v1\n' });

test('check-flow passes an untouched frozen test next to an implementation commit', () => {
  const r = makeRepo();
  freeze(r);
  r.commit('feat: impl', { 'src/a.ts': 'x\n' });
  const out = r.check('--task', 'T9-01');
  assert.equal(out.status, 0, out.stderr);
});

test('check-flow fails an edited frozen test with an ERROR line naming the path', () => {
  const r = makeRepo();
  freeze(r);
  r.commit('feat: impl', { 'src/a.test.ts': 'v2\n' });
  const out = r.check();
  assert.equal(out.status, 1);
  assert.match(out.stderr, /ERROR frozen test: src\/a\.test\.ts differs/);
});

test('check-flow fails a deleted frozen test and passes an edit that a later commit reverts', () => {
  const r = makeRepo();
  freeze(r);
  rmSync(join(r.dir, 'src/a.test.ts'));
  r.commit('feat: delete');
  assert.equal(r.check().status, 1);
  r.commit('fix: restore', { 'src/a.test.ts': 'v1\n' });
  assert.equal(r.check().status, 0);
});

test('check-flow accepts a trailered change and lists it in the JSON', () => {
  const r = makeRepo();
  freeze(r);
  r.commit('test(T9-01): fix a wrong expectation\n\nFrozen-Test-Change: src/a.test.ts -- wrong expectation', { 'src/a.test.ts': 'v2\n' });
  const out = r.check('--json');
  assert.equal(out.status, 0, out.stderr);
  const json = JSON.parse(out.stdout.trim().split('\n').pop());
  assert.equal(json.ok, true);
  assert.equal(json.changes[0].path, 'src/a.test.ts');
  assert.equal(json.changes[0].reason, 'wrong expectation');
  assert.ok(json.frozen.some((entry) => entry.path === 'src/a.test.ts'));
});

test('check-flow fails when the freeze commit is amended after the red gate pinned its blobs, which decideFrozen then catches', () => {
  const r = makeRepo();
  freeze(r);
  const pinned = JSON.parse(r.check('--json').stdout.trim()).frozen;
  r.put('src/a.test.ts', 'weakened\n');
  r.git('add', '-A');
  r.git('commit', '-q', '--amend', '--no-edit');
  const after = r.check('--json');
  assert.equal(after.status, 0, 'an amended freeze commit is invisible to the git-only check');
  const json = JSON.parse(after.stdout.trim());
  const pins = Object.fromEntries(pinned.map((entry) => [entry.path, entry.blob]));
  assert.equal(decideFrozen({ exitCode: 0, output: after.stdout }, [], pins).action, 'stop');
});

test('check-flow fails a shallow clone and a missing base with the fetch message', () => {
  const r = makeRepo();
  const none = r.check('--base', 'origin/nothing');
  assert.equal(none.status, 1);
  assert.match(none.stderr, /ERROR flow: .*fetch/);
  const shallow = mkdtempSync(join(tmpdir(), 'flow-shallow-'));
  dirs.push(shallow);
  r.commit('second');
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${r.dir}`, shallow], { encoding: 'utf8' });
  const out = spawnSync(process.execPath, [FLOW, '--repo', shallow, '--base', 'origin/main'], { encoding: 'utf8' });
  assert.equal(out.status, 1);
  assert.match(out.stderr, /ERROR flow: .*(shallow|full history)/);
});

test('check-flow with --task and no manifest exits 1 with missingManifest, and zero commits ahead exits 0', () => {
  const r = makeRepo();
  assert.match(r.check().stdout, /0 commits ahead of origin\/main/);
  assert.equal(r.check().status, 0);
  r.commit('feat: impl', { 'src/a.ts': 'x\n' });
  const out = r.check('--task', 'T9-01', '--json');
  assert.equal(out.status, 1);
  assert.equal(JSON.parse(out.stdout.trim()).missingManifest, true);
  assert.equal(r.check().status, 0);
});

test('check-flow fails a task list change without a Product Owner pass and accepts a status-only one', () => {
  const r = makeRepo();
  r.commit('chore(tasks): status', { 'tasks/prd.json': PRD.replace('"status": "todo"', '"status": "done"') });
  assert.equal(r.check().status, 0);
  r.commit('feat: reword', { 'tasks/prd.json': PRD.replace('"title": "t"', '"title": "u"') });
  const out = r.check();
  assert.equal(out.status, 1);
  assert.match(out.stderr, /ERROR task list:/);
});

test('check-flow takes HEAD^2 as the tip when HEAD is a merge whose first parent is an ancestor of the base', () => {
  const r = makeRepo();
  r.git('checkout', '-q', '-b', 'pr');
  const withShared = JSON.stringify({ ...JSON.parse(MANIFEST_BODY), files: ['src/a.test.ts', 'src/shared.txt'] });
  r.commit('test(T9-01): freeze', { [MANIFEST]: withShared, 'src/a.test.ts': 'v1\n', 'src/shared.txt': 'ONE\ntwo\nthree\nfour\nfive\n' });
  r.git('checkout', '-q', 'main');
  r.commit('main edits the last line', { 'src/shared.txt': 'one\ntwo\nthree\nfour\nFIVE\n' });
  r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  r.git('checkout', '-q', '--detach');
  r.git('merge', '-q', '--no-ff', 'pr', '-m', 'merge ref');
  const mergeRef = r.git('rev-parse', 'HEAD');
  assert.equal(r.git('rev-list', '--parents', '-n1', 'HEAD').split(' ').length, 3);
  r.git('checkout', '-q', 'main');
  r.commit('main moves again', { 'src/other.txt': 'x\n' });
  r.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  r.git('checkout', '-q', '--detach', mergeRef);
  const out = r.check('--task', 'T9-01');
  assert.equal(out.status, 0, out.stderr);
});

test('check-flow reads HEAD itself when it is a merge whose first parent is not behind the base', () => {
  const r = makeRepo();
  r.git('checkout', '-q', '-b', 'side');
  r.commit('side');
  r.git('checkout', '-q', 'main');
  r.commit('feature work');
  r.git('merge', '-q', '--no-ff', 'side', '-m', 'merge');
  const out = r.check('--json');
  assert.equal(JSON.parse(out.stdout.trim()).commits, 2);
});
