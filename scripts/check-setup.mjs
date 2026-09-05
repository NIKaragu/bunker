import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig, packet } from './dev-loop.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roles = ['researcher', 'planner', 'tester', 'frontend-developer', 'backend-developer', 'reviewer', 'finalizer'];
const required = ['AGENTS.md', 'README.md', 'docs/DEV_LOOP.md', 'docs/DECISIONS.md', '.codex/config.toml', '.agents/skills/bunker-mvp-delivery/SKILL.md', 'scripts/dev-loop.cmd', 'scripts/dev-loop.ps1', 'scripts/dev-loop.sh'];
for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
const projectConfig = fs.readFileSync(path.join(root, '.codex/config.toml'), 'utf8');
assert.match(projectConfig, /^default_subagent_model\s*=\s*"gpt-5\.6-sol"\s*$/m, 'All project agents must default to gpt-5.6-sol');
assert.match(projectConfig, /^default_subagent_reasoning_effort\s*=\s*"medium"\s*$/m, 'All project agents must default to medium reasoning');
const focusedContextRule = 'FOCUSED_CONTEXT: Start with the task packet, its exact allowed paths, and only the nearest governing AGENTS.md plus directly required config or source-of-truth documents. Do not recursively list, search, or read the repository, and do not open both components by default. Expand inspection one named path at a time only when an acceptance criterion, direct dependency, shared contract, or observed command evidence requires it. Record every added path and its reason in the JSON handoff. Execute one atomic task; do not delegate, expand the assignment, commit, push, or deploy. Parent orchestrator owns integration and loop state.';
const legacyContextDirective = 'Read root AGENTS.md, docs/DEV_LOOP.md, docs/DECISIONS.md and both frontend/AGENTS.md and backend/AGENTS.md.';
for (const role of roles) {
  const text = fs.readFileSync(path.join(root, '.codex/agents', `${role}.toml`), 'utf8');
  assert.ok(text.includes(`name = "${role}"`) && text.includes('description = ') && text.includes('developer_instructions = """'), `Incomplete agent ${role}`);
  assert.ok(!/^model(?:_reasoning_effort)?\s*=/m.test(text), `Agent ${role} should inherit model settings`);
  assert.ok(text.includes(focusedContextRule), `Agent ${role} must retain the complete focused-context rule`);
  assert.ok(!text.includes(legacyContextDirective), `Agent ${role} must not preload both components`);
}
const rootInstructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
assert.ok(rootInstructions.includes('Do not recursively enumerate, search, or read the repository'), 'Root instructions must prohibit broad discovery');
assert.ok(rootInstructions.includes('Expand inspection one named path at a time'), 'Root instructions must require incremental scope expansion');
assert.ok(rootInstructions.includes('Record each added path and the reason'), 'Root instructions must require expansion evidence');
for (const scope of ['root', 'frontend', 'backend']) {
  const config = loadConfig(root, scope);
  assert.ok(roles.includes(config.agents.developer));
  assert.equal(path.resolve(root, config.cwd), path.join(root, scope === 'root' ? '' : scope));
  if (scope !== 'root') {
    assert.ok(fs.existsSync(path.join(root, scope, 'AGENTS.md')));
    assert.ok(!fs.existsSync(path.join(root, scope, '.codex/agents')), 'Agent definitions must remain project-wide');
  }
}
loadConfig(root, 'root', 'setup');
const skill = fs.readFileSync(path.join(root, '.agents/skills/bunker-mvp-delivery/SKILL.md'), 'utf8');
assert.match(skill, /^---\r?\nname: bunker-mvp-delivery\r?\ndescription: .+\r?\n---/);
assert.ok(skill.includes('Do not recursively enumerate, search, or read the repository'), 'Skill must prohibit broad discovery');
assert.ok(skill.includes('Open one additional named path only'), 'Skill must require incremental scope expansion');
assert.ok(skill.includes('Include each expanded path and its reason'), 'Skill must require expansion evidence');
for (const scope of ['frontend', 'backend']) {
  const instructions = packet({ taskId: `${scope}/check`, goal: 'check', phase: 'research', branch: 'feature/check', baseCommit: '0', scope, profile: 'setup', maxReviewIterations: 1, reviewIterations: 0, contractFingerprint: null, plan: { writePaths: [], testPaths: [] }, findings: [], blocked: null, gates: null }, { agents: { developer: `${scope}-developer` } }).instructions;
  assert.ok(!instructions.includes('both component AGENTS.md'), `${scope} packet must not preload both components`);
  assert.ok(!instructions.includes(scope === 'frontend' ? 'backend/AGENTS.md' : 'frontend/AGENTS.md'), `${scope} packet must not mandate the other component`);
  assert.ok(instructions.includes('Expand inspection one named path at a time'), `${scope} packet must require incremental expansion`);
}
for (const file of ['scripts/dev-loop.mjs', 'scripts/package-gate.mjs', 'scripts/tests/dev-loop.test.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
console.log('PASS: shared gpt-5.6-sol/medium agent defaults, agent catalog, three scope configurations, skill discovery and script syntax');
