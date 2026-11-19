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
