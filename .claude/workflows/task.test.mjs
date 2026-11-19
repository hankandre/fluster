// Run: node --test .claude/workflows/task.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./task.js', import.meta.url), 'utf8');
const block = src.split('// MODELS-BEGIN')[1].split('\n').slice(1).join('\n').split('// MODELS-END')[0];
const { MODELS, resolveModels } = new Function(`${block}; return { MODELS, resolveModels };`)();

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
