#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const PHASES = ['research', 'plan', 'tooling', 'contracts', 'tests', 'implementation', 'review', 'finalize', 'done'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const match = (file, prefix) => prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix;
const matches = (file, prefixes) => prefixes.some(prefix => match(file, prefix));
const doc = file => file.endsWith('.md') && (file.startsWith('docs/') || file.endsWith('/README.md') || file === 'README.md');
const tooling = file => file.startsWith('.codex/') || file.startsWith('.agents/') || file.endsWith('AGENTS.md') || file.endsWith('loop.config.json') || ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json', '.gitignore', '.gitattributes'].includes(file);
const digest = snapshot => hash(JSON.stringify(snapshot));
const changed = (before, after) => [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]).sort();
const functional = snapshot => Object.fromEntries(Object.entries(snapshot).filter(([file]) => !doc(file)));
export function commandEnvironment() {
  const environment = { ...process.env };
  // A nested node --test must have its own runner and truthful process exit status.
  delete environment.NODE_TEST_CONTEXT;
  return environment;
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  assert(result.status === 0, result.stderr?.trim() || result.error?.message || `git ${args[0]} failed`);
  return result.stdout.trim();
}

export function snapshot(root) {
  const names = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
  const result = {};
  for (const file of [...new Set(names)].sort()) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) continue;
    assert(!fs.lstatSync(absolute).isSymbolicLink(), `Symlink requires manual handling: ${file}`);
    result[file] = hash(fs.readFileSync(absolute));
  }
  return result;
}

function atomicWrite(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx' });
  fs.renameSync(temporary, file);
}

function safePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !value.includes(':') && !value.startsWith('/') && !value.split('/').some(part => part === '..' || part === '.') && !value.startsWith('.git/');
}

export function loadConfig(root, scope, profile = 'delivery') {
  assert(['root', 'frontend', 'backend'].includes(scope), 'Scope must be root, frontend or backend');
  const file = path.join(root, scope === 'root' ? '' : scope, 'loop.config.json');
  const config = json(file);
  assert(config.version === 1 && config.scope === scope, 'Unsupported or mismatched loop configuration');
  assert(Array.isArray(config.ownedPaths) && config.ownedPaths.every(safePath), 'Invalid scope ownership');
  assert(Array.isArray(config.testPaths) && config.testPaths.every(safePath), 'Invalid test ownership');
  assert(Array.isArray(config.acceptancePaths) && config.acceptancePaths.every(safePath), 'Invalid acceptance ownership');
  const gates = config.profiles[profile];
  assert(Array.isArray(gates) && gates.length > 0, `No ${profile} gates configured for ${scope}`);
  assert(new Set(gates.map(g => g.id)).size === gates.length, 'Duplicate gate IDs');
  for (const gate of gates) assert(typeof gate.id === 'string' && Array.isArray(gate.command) && gate.command.length > 0 && gate.command.every(arg => typeof arg === 'string' && arg.length), 'Invalid gate command');
  return { ...config, gates, profile };
}

export function roleFor(state, config) {
  return { research: 'researcher', plan: 'planner', tooling: 'backend-developer', contracts: 'backend-developer', tests: 'tester', implementation: config.agents.developer, review: 'reviewer', finalize: 'finalizer' }[state.phase];
}

function allowed(file, state, config, phase = state.phase) {
  if (['research', 'plan', 'review', 'done'].includes(phase)) return false;
  if (!matches(file, state.plan?.writePaths ?? [])) return false;
  if (phase === 'tooling') return state.scope === 'root' && tooling(file);
  if (phase === 'contracts') return state.scope === 'root' && file.startsWith('packages/contracts/');
  if (phase === 'tests') return matches(file, state.plan.testPaths);
  if (phase === 'finalize') return doc(file);
  if (phase === 'implementation') return !matches(file, state.plan.testPaths) && !matches(file, config.acceptancePaths) && !file.startsWith('packages/contracts/') && !tooling(file);
  return false;
}

function validateChanges(state, config, current, phase = state.phase) {
  const files = changed(state.snapshot, current);
  const violations = files.filter(file => !allowed(file, state, config, phase));
  assert(!violations.length, `Ownership violation in ${phase}: ${violations.join(', ')}. Preserve changes; request a separate authorized task or reopen the correct phase.`);
  return files;
}

function validatePlan(plan, config, goal) {
  assert(plan && plan.goal === goal, 'Plan goal must match the requested goal');
  assert(Array.isArray(plan.acceptanceCriteria) && plan.acceptanceCriteria.length > 0 && plan.acceptanceCriteria.every(c => typeof c === 'string' && c.trim()), 'Plan requires acceptance criteria');
  for (const key of ['writePaths', 'testPaths']) {
    assert(Array.isArray(plan[key]) && plan[key].every(safePath), `Invalid plan.${key}`);
    assert(plan[key].every(p => matches(p, config.ownedPaths)), `Plan ${key} escapes scope`);
  }
  assert(plan.testPaths.every(p => matches(p, config.testPaths) && matches(p, plan.writePaths)), 'Test paths must be inside scope test ownership and task writePaths');
  assert(Array.isArray(plan.gateIds) && JSON.stringify([...plan.gateIds].sort()) === JSON.stringify(config.gates.map(g => g.id).sort()), 'Plan must retain every configured gate');
}

function requireGates(state, current) {
  assert(state.gates?.fingerprint === digest(current) && state.gates.passed === true, 'Required gates are missing, failed or stale; run check');
}

export function advanceState(state, config, handoff, current) {
  assert(!state.blocked && state.phase !== 'done', 'Run is blocked or already done');
  assert(handoff.taskId === state.taskId && handoff.phase === state.phase, 'Handoff task/phase mismatch');
  const implementationRoles = state.scope === 'root' ? ['frontend-developer', 'backend-developer'] : [config.agents.developer];
  assert(state.phase === 'implementation' ? implementationRoles.includes(handoff.role) : handoff.role === roleFor(state, config), 'Handoff role mismatch');
  assert(typeof handoff.agentId === 'string' && handoff.agentId.trim().length > 0, 'Handoff requires actual agentId');
  assert(typeof handoff.summary === 'string' && handoff.summary.trim().length > 0, 'Handoff requires summary');
  assert(['passed', 'blocked', 'changes_requested', 'skipped'].includes(handoff.status), 'Invalid handoff status');
  const files = validateChanges(state, config, current);
  assert(Array.isArray(handoff.files) && JSON.stringify([...handoff.files].sort()) === JSON.stringify(files), `Handoff files must match actual changes: ${JSON.stringify(files)}`);
  const next = structuredClone(state);
  next.history.push({ ...handoff, fingerprint: digest(current), timestamp: new Date().toISOString() });
  if (handoff.status === 'blocked') {
    next.blocked = handoff.summary;
    return next;
  }
  if (handoff.status === 'skipped') assert(state.phase === 'research' && Array.isArray(handoff.evidence) && handoff.evidence.length > 0, 'Only research may reuse evidence with an explicit reason and source references');
  if (state.phase === 'plan') { validatePlan(handoff.plan, config, state.goal); next.plan = handoff.plan; }
  if (state.phase === 'contracts') next.contractFingerprint = digest(Object.fromEntries(Object.entries(current).filter(([f]) => f.startsWith('packages/contracts/'))));
  if (['tooling', 'contracts'].includes(state.phase) && files.length) next.authors = [...new Set([...next.authors, handoff.agentId])];
  if (state.phase === 'tests') {
    assert(typeof handoff.testEvidence === 'string' && handoff.testEvidence.trim().length > 0, 'Tester must explain executed behavior assertions or why tests-first is not applicable');
    next.testers = [...new Set([...next.testers, handoff.agentId])];
  }
  if (state.phase === 'implementation') {
    assert(!state.testers.includes(handoff.agentId), 'Acceptance author cannot implement this slice');
    next.authors = [...new Set([...next.authors, handoff.agentId])];
    if (handoff.contributions) {
      assert(Array.isArray(handoff.contributions) && handoff.contributions.length > 0, 'Invalid implementation contributions');
      const contributedFiles = [];
      for (const contributor of handoff.contributions) {
        assert(typeof contributor.agentId === 'string' && contributor.agentId.trim() && implementationRoles.includes(contributor.role) && Array.isArray(contributor.files), 'Invalid implementation contributor');
        assert(!state.testers.includes(contributor.agentId), 'Acceptance author cannot implement this slice');
        contributedFiles.push(...contributor.files);
        next.authors = [...new Set([...next.authors, contributor.agentId])];
      }
      assert(JSON.stringify(contributedFiles.sort()) === JSON.stringify(files), 'Contributions must partition the actual changed files without overlap');
    }
  }
  if (state.phase === 'review') {
    assert(!state.authors.includes(handoff.agentId) && !state.testers.includes(handoff.agentId), 'Review must be independent of implementation and acceptance authors');
    assert(Array.isArray(handoff.findings), 'Reviewer must provide findings array');
    next.reviewIterations++;
    if (handoff.status === 'changes_requested') {
      assert(handoff.findings.length > 0, 'Changes requested requires findings');
      for (const finding of handoff.findings) assert(finding.id && ['P0', 'P1', 'P2'].includes(finding.severity) && ['developer', 'tester', 'planner'].includes(finding.owner) && finding.file && finding.evidence, 'Finding requires id, severity, owner, file and evidence');
      next.findings = handoff.findings;
      next.gates = null;
      next.review = null;
      if (next.reviewIterations >= state.maxReviewIterations) next.blocked = 'Review iteration limit reached';
      else next.phase = handoff.findings.some(f => f.owner === 'planner') ? 'plan' : handoff.findings.some(f => f.owner === 'tester') ? 'tests' : 'implementation';
      next.snapshot = current;
      return next;
    }
    assert(handoff.status === 'passed' && handoff.findings.length === 0, 'Passing review requires zero unresolved findings');
    requireGates(state, current);
    next.findings = [];
    next.review = { agentId: handoff.agentId, fingerprint: digest(functional(current)) };
  } else assert(handoff.status !== 'changes_requested', 'Only review may request changes');
  if (state.phase === 'finalize') {
    requireGates(state, current);
    assert(state.review?.fingerprint === digest(functional(current)), 'Review is stale; reopen implementation');
  }
  next.snapshot = current;
  next.phase = PHASES[PHASES.indexOf(state.phase) + 1];
  if (next.phase === 'tooling' && state.scope !== 'root') next.phase = 'contracts';
  return next;
}

export function packet(state, config) {
  return {
    taskId: state.taskId, goal: state.goal, phase: state.phase, role: roleFor(state, config),
    implementationRoles: state.scope === 'root' ? ['frontend-developer', 'backend-developer'] : [config.agents.developer],
    branch: state.branch, baseCommit: state.baseCommit, scope: state.scope, profile: state.profile,
    maxReviewIterations: state.maxReviewIterations, reviewIterations: state.reviewIterations,
    contractFingerprint: state.contractFingerprint, plan: state.plan, findings: state.findings, blocked: state.blocked,
    gates: state.gates ? { passed: state.gates.passed, results: state.gates.results } : null,
    instructions: 'Use native Codex subagents and .agents/skills/bunker-mvp-delivery/SKILL.md. Start with this task packet, its exact plan paths, the selected shared role instructions, and only the nearest governing AGENTS.md. Do not recursively inspect the repository or preload both components. Expand inspection one named path at a time only when an acceptance criterion, direct dependency, shared contract, or observed command evidence requires it; record every added path and reason in the handoff. One atomic task per worker. Root records advance/check; workers do not mutate loop state or start another orchestrator.'
  };
}

function parse(argv) {
  const result = { command: 'run', scope: 'root' };
  if (argv[0] && !argv[0].startsWith('--')) result.command = argv.shift();
  const flags = new Set(['help', 'dry-run', 'resume']);
  const values = new Set(['scope', 'slice', 'goal', 'profile', 'max-review-iterations', 'handoff', 'owner', 'reason']);
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    assert(argv[i].startsWith('--') && (flags.has(key) || values.has(key)), `Unknown argument: ${argv[i]}`);
    if (flags.has(key)) result[key] = true;
    else { assert(argv[i + 1] && !argv[i + 1].startsWith('--'), `Missing --${key} value`); result[key] = argv[++i]; }
  }
  return result;
}

export const HELP = `Bunker native multi-agent loop (Node >=20, Git, Codex CLI for run)
Usage: node scripts/dev-loop.mjs [run|prepare|status|advance|check|reopen] [options]
  --scope root|frontend|backend   Shared agents, scope-specific ownership/gates
  --slice <slug>                 Lowercase letters, digits and hyphens
  --goal <text>                  Required for a new run
  --profile setup|delivery      delivery by default; setup only on root
  --max-review-iterations <n>    1..10, default from scope config
  --dry-run                     Validate and print; no writes or Codex launch
  --resume                      Continue an existing slice, preserving its budget
  --handoff <json-file>          advance only; see docs/DEV_LOOP.md
  --owner developer|tester|planner|current --reason <text>   reopen only
  --help                        Print this help without side effects
prepare uses the current Codex session's native agents. run launches ONE interactive
Codex orchestrator from a terminal. check executes real gates, stops on failure and
records output under .bunker-loop. No automatic commit, push or deploy.
`;

export function main(argv = process.argv.slice(2), root = ROOT) {
  const options = parse([...argv]);
  if (options.help) { console.log(HELP); return; }
  assert(['run', 'prepare', 'status', 'advance', 'check', 'reopen'].includes(options.command), 'Unknown command');
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.slice ?? ''), 'Provide a safe --slice slug');
  const runDir = path.join(root, '.bunker-loop', 'runs', options.scope, options.slice);
  const stateFile = path.join(runDir, 'state.json');
  let state = fs.existsSync(stateFile) ? json(stateFile) : null;
  const profile = options.profile ?? state?.profile ?? 'delivery';
  const liveConfig = loadConfig(root, options.scope, profile);
  let config = state?.config ?? liveConfig;
  assert(!state || state.profile === profile, 'Cannot change profile on resume');
  const initial = ['run', 'prepare'].includes(options.command);
  assert(!state || !initial || options.resume, 'Run already exists; use --resume');
  assert(state || !options.resume, 'No saved run to resume');
  assert(state || initial, 'Prepare the slice first');
  const branch = git(root, ['branch', '--show-current']);
  assert(branch, 'Detached HEAD is unsupported');
  const baseCommit = git(root, ['rev-parse', 'HEAD']);
  if (!state) {
    assert(options.goal?.trim(), 'A new slice requires --goal');
    assert(!git(root, ['status', '--porcelain']), 'Worktree must be clean for a new slice. Preserve and commit or separately handle existing changes.');
  }
  if (state) {
    assert(state.taskId === `${options.scope}/${options.slice}` && state.scope === options.scope, 'Saved task/scope mismatch');
    assert((state.phase === 'done' && options.command === 'status') || (branch === state.branch && baseCommit === state.baseCommit), 'Branch/HEAD changed since checkpoint; integrate or commit only after completion');
    assert(!options.goal || options.goal === state.goal, 'Cannot change goal on resume');
    assert(!options['max-review-iterations'] || Number(options['max-review-iterations']) === state.maxReviewIterations, 'Cannot reset the review budget');
  }
  const max = state?.maxReviewIterations ?? Number(options['max-review-iterations'] ?? config.maxReviewIterations);
  assert(Number.isInteger(max) && max >= 1 && max <= 10, 'Review limit must be an integer from 1 to 10');
  if (options['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, command: options.command, scope: options.scope, slice: options.slice, branch: state?.branch ?? `feature/${options.scope}-${options.slice}`, phase: state?.phase ?? 'research', maxReviewIterations: max, gates: config.gates, launch: options.command === 'run' ? ['codex', '-C', path.resolve(root, config.cwd), '<native orchestration task packet>'] : null }, null, 2));
    return;
  }
  // Serialize every state mutation and gate process in this integration worktree.
  const lockFile = path.join(root, '.bunker-loop', 'writer.lock');
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  let lock;
  try { lock = fs.openSync(lockFile, 'wx'); }
  catch { throw new Error(`Loop command already running, or stale lock: ${lockFile}. Check the recorded PID before removing a stale lock.`); }
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, taskId: `${options.scope}/${options.slice}` }));
  let launch = false;
  try {
    // Reload under the lock: never overwrite a newer checkpoint with a stale read.
    state = fs.existsSync(stateFile) ? json(stateFile) : null;
    config = state?.config ?? liveConfig;
    const lockedBranch = git(root, ['branch', '--show-current']);
    const lockedHead = git(root, ['rev-parse', 'HEAD']);
    assert(lockedBranch === branch && lockedHead === baseCommit, 'Git state changed while acquiring the lock; retry');
    if (state) {
      assert(!initial || options.resume, 'Run already exists; use --resume');
      assert((state.phase === 'done' && options.command === 'status') || (state.branch === lockedBranch && state.baseCommit === lockedHead), 'Saved branch/HEAD mismatch');
      assert(state.scope === options.scope && state.profile === profile, 'Saved scope/profile mismatch');
    } else assert(!git(root, ['status', '--porcelain']), 'Worktree changed while acquiring the lock');
    // A different unfinished slice must use its own worktree.
    const runs = path.join(root, '.bunker-loop', 'runs');
    if (!state && fs.existsSync(runs)) {
      for (const scopeDir of fs.readdirSync(runs)) for (const slug of fs.readdirSync(path.join(runs, scopeDir))) {
        const otherFile = path.join(runs, scopeDir, slug, 'state.json');
        if (fs.existsSync(otherFile)) assert(json(otherFile).phase === 'done', 'Another slice is unfinished in this worktree; resume it or use an isolated worktree');
      }
    }
    if (!state) {
      const targetBranch = `feature/${options.scope}-${options.slice}`;
      if (branch !== targetBranch) {
        const exists = spawnSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], { cwd: root, windowsHide: true });
        assert(exists.status === 1, 'Target branch already exists without this checkpoint; inspect it before starting');
        git(root, ['switch', '-c', targetBranch]);
      }
      state = { version: 1, config, taskId: `${options.scope}/${options.slice}`, scope: options.scope, profile, goal: options.goal, branch: targetBranch, baseCommit, phase: 'research', maxReviewIterations: max, reviewIterations: 0, snapshot: snapshot(root), plan: null, gates: null, review: null, contractFingerprint: null, authors: [], testers: [], findings: [], history: [], blocked: null };
      atomicWrite(stateFile, state);
    }
    const current = snapshot(root);
    if (options.command === 'reopen') {
      assert(['developer', 'tester', 'planner', 'current'].includes(options.owner) && options.reason?.trim(), 'Reopen requires --owner and --reason');
      assert(state.phase !== 'done' && state.reviewIterations < state.maxReviewIterations, 'Completed run or exhausted review budget cannot be reopened');
      const phase = options.owner === 'current' ? state.phase : { developer: 'implementation', tester: 'tests', planner: 'plan' }[options.owner];
      assert(PHASES.indexOf(phase) <= PHASES.indexOf(state.phase), 'Reopen cannot skip forward over required phases');
      assert(state.plan || ['research', 'plan'].includes(phase), 'No accepted plan; resume research/planning');
      validateChanges(state, config, current, phase);
      state.phase = phase;
      state.blocked = null;
      state.gates = null;
      state.review = null;
      state.history.push({ event: 'reopen', phase, reason: options.reason });
      atomicWrite(stateFile, state);
    } else if (options.command === 'advance') {
      assert(options.handoff, 'advance requires --handoff');
      state = advanceState(state, config, json(path.resolve(options.handoff)), current);
      atomicWrite(stateFile, state);
    } else if (options.command === 'check') {
      assert(!state.blocked && ['review', 'finalize'].includes(state.phase), 'Run gates after implementation or during finalization');
      validateChanges(state, config, current);
      state.gates = { fingerprint: digest(current), passed: false, results: [] };
      atomicWrite(stateFile, state);
      for (const gate of config.gates) {
        const command = gate.command[0] === 'node' ? process.execPath : gate.command[0];
        const result = spawnSync(command, gate.command.slice(1), { cwd: root, env: commandEnvironment(), encoding: 'utf8', shell: false, windowsHide: true, timeout: config.gateTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
        const log = path.join(runDir, `gate-${state.history.length}-${gate.id}.log`);
        fs.writeFileSync(log, `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\n${result.error.message}` : ''}`);
        const receipt = { id: gate.id, command: gate.command, exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, log: path.relative(root, log).replaceAll('\\', '/'), timestamp: new Date().toISOString() };
        state.gates.results.push(receipt);
        atomicWrite(stateFile, state);
        console.log(`${gate.id}: ${result.status === 0 && !result.error && !result.signal ? 'PASS' : 'FAIL'} (${receipt.log})`);
        assert(result.status === 0 && !result.error && !result.signal, `Gate failed: ${gate.id}; phase preserved`);
        assert(digest(snapshot(root)) === digest(current), 'Gate changed tracked/untracked source; evidence invalidated');
      }
      state.gates.passed = true;
      atomicWrite(stateFile, state);
    } else if (initial) {
      validateChanges(state, config, current);
      if (state.gates?.fingerprint !== digest(current)) state.gates = null;
      atomicWrite(stateFile, state);
      launch = options.command === 'run' && state.phase !== 'done' && !state.blocked;
    }
    console.log(JSON.stringify(packet(state, config), null, 2));
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockFile);
  }
  if (launch) {
    const sessionLock = path.join(root, '.bunker-loop', 'orchestrator.lock');
    let sessionFd;
    try { sessionFd = fs.openSync(sessionLock, 'wx'); }
    catch { throw new Error('An orchestrator is already running in this worktree; inspect .bunker-loop/orchestrator.lock'); }
    fs.writeFileSync(sessionFd, JSON.stringify({ pid: process.pid, taskId: state.taskId }));
    try {
    const help = spawnSync('codex', ['--help'], { encoding: 'utf8', windowsHide: true });
    assert(help.status === 0 && help.stdout.includes('--cd'), 'Codex CLI with --cd support is required');
    const prompt = `Use $bunker-mvp-delivery for this saved task. Continue all phases with native subagents, actual gates and the existing review budget. Commands live at ${path.join(root, 'scripts/dev-loop.mjs')}. Task packet:\n${JSON.stringify(packet(state, config))}`;
    const child = spawnSync('codex', ['-C', path.resolve(root, config.cwd), prompt], { cwd: root, stdio: 'inherit', shell: false, windowsHide: true });
    assert(child.status === 0 && !child.error, child.error?.message ?? `Codex exited ${child.status ?? child.signal}; resume the saved task`);
    const finalState = json(stateFile);
    assert(finalState.phase === 'done' && !finalState.blocked, `Codex stopped at ${finalState.phase}; work saved, task not complete`);
    } finally {
      fs.closeSync(sessionFd);
      fs.unlinkSync(sessionLock);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(`Bunker loop: ${error.message}`); process.exitCode = 1; }
}
