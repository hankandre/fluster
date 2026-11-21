// Run: node --test .claude/workflows/task.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./task.js', import.meta.url), 'utf8');
const block = src.split('// MODELS-BEGIN')[1].split('\n').slice(1).join('\n').split('// MODELS-END')[0];
const { MODELS, resolveModels } = new Function(`${block}; return { MODELS, resolveModels };`)();
const stepBlock = src.split('// STEP-BEGIN')[1].split('\n').slice(1).join('\n').split('// STEP-END')[0];
const { mergeUnique, decideStep } = new Function(`${stepBlock}; return { mergeUnique, decideStep };`)();

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
