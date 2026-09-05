import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './dev-loop.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roles = ['researcher', 'planner', 'tester', 'frontend-developer', 'backend-developer', 'reviewer', 'finalizer'];
const required = ['AGENTS.md', 'README.md', 'docs/DEV_LOOP.md', 'docs/DECISIONS.md', '.codex/config.toml', '.agents/skills/bunker-mvp-delivery/SKILL.md', 'scripts/dev-loop.cmd', 'scripts/dev-loop.ps1', 'scripts/dev-loop.sh'];
for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `Missing ${file}`);
for (const role of roles) {
  const text = fs.readFileSync(path.join(root, '.codex/agents', `${role}.toml`), 'utf8');
  assert.ok(text.includes(`name = "${role}"`) && text.includes('description = ') && text.includes('developer_instructions = """'), `Incomplete agent ${role}`);
  assert.ok(!/^model(?:_reasoning_effort)?\s*=/m.test(text), `Agent ${role} should inherit model settings`);
}
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
for (const file of ['scripts/dev-loop.mjs', 'scripts/package-gate.mjs', 'scripts/tests/dev-loop.test.mjs']) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
console.log('PASS: shared agent catalog, three scope configurations, skill discovery and script syntax');
