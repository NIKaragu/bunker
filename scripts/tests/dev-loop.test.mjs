import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { main, snapshot, advanceState, roleFor, commandEnvironment } from '../dev-loop.mjs';

const hash = object => crypto.createHash('sha256').update(JSON.stringify(object)).digest('hex');
const config = {
  version: 1, scope: 'root', cwd: '.', ownedPaths: ['src/', 'tests/', 'docs/', 'packages/contracts/', 'pnpm-lock.yaml'],
  testPaths: ['tests/'], acceptancePaths: ['tests/acceptance/'], agents: { developer: 'backend-developer' },
  maxReviewIterations: 3, gateTimeoutMs: 10000,
  profiles: { setup: [{ id: 'behavior', command: ['node', '--test', 'tests/acceptance/version.test.mjs'] }] }
};
const goal = 'Reject commands from an old game';
const plan = { goal, acceptanceCriteria: ['Current game accepted; old game rejected'], writePaths: ['src/', 'tests/', 'docs/', 'packages/contracts/', 'pnpm-lock.yaml'], testPaths: ['tests/acceptance/'], gateIds: ['behavior'] };
const acceptance = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { accept } from '../../src/version.mjs';\ntest('old game command is rejected', () => assert.equal(accept('old', 'current'), false));\ntest('current game command is accepted', () => assert.equal(accept('current', 'current'), true));\n`;

function write(root, file, contents) { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), contents); }
function git(root, args) { const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); }
function fixture(gateConfig = config) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bunker-loop-test-'));
  // Retain isolated temporary fixtures for debugging; never delete user paths.
  git(root, ['init', '-b', 'main']);
  write(root, '.gitignore', '.bunker-loop/\n');
  write(root, 'loop.config.json', JSON.stringify(gateConfig));
  write(root, 'src/version.mjs', 'export const accept = () => true;\n');
  git(root, ['add', '.']);
  git(root, ['-c', 'user.name=Bunker Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'test: initialize isolated fixture']);
  const stateFile = path.join(root, '.bunker-loop/runs/root/demo/state.json');
  const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  function call(command, ...args) {
    const original = console.log;
    try { console.log = () => {}; return main([command, '--scope', 'root', '--slice', 'demo', ...args], root); }
    finally { console.log = original; }
  }
  const start = (...args) => call('prepare', '--profile', 'setup', '--goal', goal, ...args);
  function handoff(extra = {}) {
    const saved = state();
    const current = snapshot(root);
    const files = [...new Set([...Object.keys(saved.snapshot), ...Object.keys(current)])].filter(f => saved.snapshot[f] !== current[f]).sort();
    const data = { taskId: saved.taskId, phase: saved.phase, role: roleFor(saved, { ...config, gates: config.profiles.setup }), agentId: `synthetic-${saved.phase}`, status: 'passed', summary: 'Synthetic test fixture evidence', files, ...extra };
    const file = path.join(root, '.bunker-loop/handoff.json');
    fs.writeFileSync(file, JSON.stringify(data));
    call('advance', '--handoff', file);
  }
  function toTests() { start(); handoff(); handoff({ plan }); handoff(); handoff(); assert.equal(state().phase, 'tests'); }
  function toReview(fix = true) {
    toTests();
    write(root, 'tests/acceptance/version.test.mjs', acceptance);
    const red = spawnSync(process.execPath, ['--test', 'tests/acceptance/version.test.mjs'], { cwd: root, env: commandEnvironment(), encoding: 'utf8', windowsHide: true });
    assert.equal(red.status, 1);
    assert.match(red.stdout, /old game command is rejected/);
    assert.match(red.stdout, /ERR_ASSERTION/);
    handoff({ testEvidence: 'node --test tests/acceptance/version.test.mjs: old game command is rejected fails with ERR_ASSERTION; current game passes.' });
    if (fix) write(root, 'src/version.mjs', 'export const accept = (received, current) => received === current;\n');
    handoff();
    assert.equal(state().phase, 'review');
  }
  return { root, state, call, start, handoff, toTests, toReview };
}

test('help and dry-run do not change Git or create state', () => {
  const f = fixture();
  const before = snapshot(f.root);
  f.call('prepare', '--help');
  f.start('--dry-run');
  assert.deepEqual(snapshot(f.root), before);
  assert.equal(git(f.root, ['branch', '--show-current']), 'main');
  assert.equal(fs.existsSync(path.join(f.root, '.bunker-loop')), false);
});

test('dirty start preserves unrelated untracked work', () => {
  const f = fixture();
  write(f.root, 'personal.txt', 'keep me');
  assert.throws(() => f.start(), /clean/);
  assert.equal(fs.readFileSync(path.join(f.root, 'personal.txt'), 'utf8'), 'keep me');
});

test('complete flow: expected assertion failure, implementation, gates, independent review, final docs', () => {
  const f = fixture();
  f.toReview();
  assert.throws(() => f.handoff({ findings: [] }), /gates/);
  f.call('check');
  assert.equal(f.state().gates.results[0].exitCode, 0);
  assert.throws(() => f.handoff({ agentId: 'synthetic-implementation', findings: [] }), /independent/);
  f.handoff({ findings: [] });
  write(f.root, 'docs/result.md', 'Verified old-game rejection.\n');
  assert.throws(() => f.handoff(), /gates/);
  f.call('check');
  f.handoff();
  assert.equal(f.state().phase, 'done');
  assert.equal(git(f.root, ['rev-list', '--count', 'HEAD']), '1', 'Loop must not create commits');
  git(f.root, ['add', '.']);
  git(f.root, ['-c', 'user.name=Bunker Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'test: commit completed fixture']);
  f.call('status');
  assert.equal(f.state().phase, 'done', 'Completed evidence remains readable after an authorized commit');
});

test('failed behavior gate cannot finalize and records actual failure', () => {
  const f = fixture();
  f.toReview(false);
  assert.throws(() => f.call('check'), /Gate failed/);
  assert.equal(f.state().phase, 'review');
  assert.equal(f.state().gates.passed, false);
  assert.equal(f.state().gates.results[0].exitCode, 1);
  assert.throws(() => f.handoff({ findings: [] }), /gates/);
});

test('review findings route to owner and stop at configured budget', () => {
  const f = fixture({ ...config, maxReviewIterations: 1 });
  f.toReview(false);
  f.handoff({ status: 'changes_requested', findings: [{ id: 'R1', severity: 'P1', owner: 'developer', file: 'src/version.mjs', evidence: 'Old game still accepted' }] });
  assert.match(f.state().blocked, /limit/);
  assert.equal(f.state().findings.length, 1);
  assert.throws(() => f.call('reopen', '--owner', 'developer', '--reason', 'try again'), /exhausted/);
  assert.throws(() => f.call('prepare', '--resume', '--max-review-iterations', '3'), /budget/);
});

test('partial implementation resumes from current phase; acceptance edits are blocked', () => {
  const f = fixture();
  f.toTests();
  write(f.root, 'tests/acceptance/version.test.mjs', acceptance);
  f.handoff({ testEvidence: 'Existing regression fixture; implementation follows.' });
  write(f.root, 'src/version.mjs', 'export const accept = (a, b) => a === b;\n');
  f.call('prepare', '--resume');
  assert.equal(f.state().phase, 'implementation');
  assert.notEqual(f.state().snapshot['src/version.mjs'], snapshot(f.root)['src/version.mjs']);
  fs.unlinkSync(path.join(f.root, 'tests/acceptance/version.test.mjs'));
  write(f.root, 'tests/renamed.mjs', acceptance);
  assert.throws(() => f.handoff(), /Ownership violation/);
});

test('untracked source after green review is rejected until an explicit reopen', () => {
  const f = fixture(); f.toReview(); f.call('check'); f.handoff({ findings: [] });
  write(f.root, 'src/new.mjs', 'export const added = true;\n');
  assert.throws(() => f.call('prepare', '--resume'), /Ownership/);
  assert.throws(() => f.handoff(), /Ownership/);
  f.call('reopen', '--owner', 'developer', '--reason', 'Add behavior');
  assert.equal(f.state().phase, 'implementation');
  assert.equal(f.state().gates, null);
  assert.equal(f.state().review, null);
});

test('blocked partial contract phase reopens without dropping edits; author cannot self-review', () => {
  const f = fixture(); f.start(); f.handoff(); f.handoff({ plan }); f.handoff();
  write(f.root, 'packages/contracts/version.mjs', 'export const version = 1;\n');
  f.handoff({ status: 'blocked', summary: 'Need a documented decision' });
  f.call('reopen', '--owner', 'current', '--reason', 'Decision supplied');
  f.handoff({ agentId: 'contract-author' });
  assert.ok(f.state().authors.includes('contract-author'));
  const current = snapshot(f.root);
  const saved = { ...f.state(), phase: 'review', snapshot: current, gates: { passed: true, fingerprint: hash(current) } };
  assert.throws(() => advanceState(saved, saved.config, { taskId: saved.taskId, phase: 'review', role: 'reviewer', agentId: 'contract-author', status: 'passed', summary: 'self review', files: [], findings: [] }, current), /independent/);
});

test('root tooling accepts explicitly assigned lockfile and freezes gate configuration', () => {
  const f = fixture(); f.start(); f.handoff(); f.handoff({ plan });
  assert.equal(f.state().phase, 'tooling');
  write(f.root, 'pnpm-lock.yaml', 'lockfileVersion: 9\n');
  f.handoff({ agentId: 'tooling-author' });
  assert.ok(f.state().authors.includes('tooling-author'));
  assert.deepEqual(f.state().config.gates, config.profiles.setup);
});

test('scope isolation and unsafe plans cannot bypass ownership or mandatory gates', () => {
  const f = fixture(); f.start(); f.handoff();
  assert.throws(() => f.handoff({ plan: { ...plan, writePaths: ['../outside'] } }), /Invalid plan/);
  assert.throws(() => f.handoff({ plan: { ...plan, writePaths: ['frontend/'] } }), /escapes scope/);
  assert.throws(() => f.handoff({ plan: { ...plan, gateIds: [] } }), /every configured gate/);
  assert.throws(() => f.handoff({ taskId: 'backend/demo', plan }), /mismatch/);
});

test('reopen cannot skip contracts and acceptance phases', () => {
  const f = fixture(); f.start(); f.handoff(); f.handoff({ plan });
  assert.throws(() => f.call('reopen', '--owner', 'developer', '--reason', 'skip ahead'), /skip forward/);
  assert.throws(() => f.call('reopen', '--owner', 'tester', '--reason', 'skip contracts'), /skip forward/);
  assert.equal(f.state().phase, 'tooling');
});

test('root accepts a frontend implementation and records every contributor for independent review', () => {
  const f = fixture(); f.toTests(); f.handoff({ testEvidence: 'No additional assertions needed for this handoff routing test.' });
  write(f.root, 'src/version.mjs', 'export const accept = (a, b) => a === b;\n');
  f.handoff({ agentId: 'front-author', role: 'frontend-developer', contributions: [{ agentId: 'front-author', role: 'frontend-developer', files: ['src/version.mjs'] }] });
  assert.ok(f.state().authors.includes('front-author'));
  assert.equal(f.state().phase, 'review');
});

test('gate timeout and missing executables are never reported as success', () => {
  for (const command of [['node', '-e', 'setInterval(() => {}, 1000)'], ['bunker-nonexistent-executable']]) {
    const f = fixture({ ...config, gateTimeoutMs: 100, profiles: { setup: [{ id: 'behavior', command }] } });
    f.toReview();
    assert.throws(() => f.call('check'), /Gate failed/);
    assert.equal(f.state().gates.passed, false);
    assert.notEqual(f.state().gates.results[0].exitCode, 0);
  }
});

test('a gate that mutates source cannot produce valid evidence', () => {
  const f = fixture({ ...config, profiles: { setup: [{ id: 'behavior', command: ['node', '-e', "require('fs').writeFileSync('src/version.mjs','changed')"] }] } });
  f.toReview();
  assert.throws(() => f.call('check'), /changed tracked\/untracked source/);
  assert.equal(f.state().gates.passed, false);
});

test('wrong branch and another active slice are rejected', () => {
  const f = fixture(); f.start();
  git(f.root, ['switch', 'main']);
  assert.throws(() => f.call('prepare', '--resume'), /Branch\/HEAD/);
  assert.throws(() => main(['prepare', '--scope', 'root', '--slice', 'second', '--profile', 'setup', '--goal', goal], f.root), /unfinished/);
});

test('state writer lock and terminal orchestrator lock reject concurrent commands', () => {
  const f = fixture(); f.start();
  write(f.root, '.bunker-loop/writer.lock', '{"pid":123}');
  assert.throws(() => f.call('status'), /already running/);
  fs.unlinkSync(path.join(f.root, '.bunker-loop/writer.lock'));
  write(f.root, '.bunker-loop/orchestrator.lock', '{"pid":123}');
  assert.throws(() => f.call('run', '--resume'), /orchestrator is already running/);
});

test('missing frontend product gates fail explicitly, not with placeholder success', () => {
  const r = spawnSync(process.execPath, ['scripts/package-gate.mjs', 'frontend', 'build'], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /BLOCKED/);
});
