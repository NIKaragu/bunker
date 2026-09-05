# Bunker delivery

Current authorization: initialize and verify the development workflow. Product implementation is a later task. Treat `BUNKER_CODEX_MASTER_PROMPT.md` as product requirements, not permission to start every task it contains.

Read `docs/DEV_LOOP.md` and `.agents/skills/bunker-mvp-delivery/SKILL.md` for development slices. Product decisions are Ukrainian in `docs/DECISIONS.md`; code identifiers and commits are English. The current directory layout deliberately uses `frontend/` and `backend/` instead of `apps/web` and `apps/server`.

## Commands

- `node scripts/check-setup.mjs`
- `node --test scripts/tests/dev-loop.test.mjs`
- `node scripts/dev-loop.mjs --help`
- In an existing Codex session: use `prepare`, then native subagents. Do not launch a nested Codex orchestrator.
- From a terminal: use `run` to launch one interactive Codex orchestrator.

## Agent ownership

One project-wide catalog lives in `.codex/agents/`. All roles understand frontend, backend, and shared contracts. Read nested `AGENTS.md` before touching a component. Scope selects ownership and gates, not an independent agent team.

The root orchestrator owns task dispatch, state transitions, contract integration and final gate execution. Delegate one bounded task per agent invocation with task ID, role, base revision, exact allowed paths, acceptance criteria and evidence requirements. Use fresh context for independent tasks; workers do not delegate. Reuse a worker only for the same atomic task's correction. The worker limit includes all scopes, with at most three active workers beside the root in this environment.

Every agent conserves context: start with the task packet, exact allowed paths, and the nearest governing `AGENTS.md` plus directly required configuration or source-of-truth documents. Do not recursively enumerate, search, or read the repository, and do not inspect both frontend and backend by default. Expand inspection one named path at a time only when an acceptance criterion, direct dependency, shared contract, or observed command evidence requires it. Record each added path and the reason in the handoff. Cross-component awareness means following proven dependencies, not preloading both components.

Researcher and Reviewer do not edit source. Planner returns a plan. Tester owns acceptance tests. Developers may add module unit tests but never edit/delete/rename Tester-owned acceptance tests. Finalizer changes documentation only. Root owns lockfile, workspace tooling, agent configs and shared contracts; contract changes are a separate serial phase.

Parallel writing requires separate feature branches/worktrees, nonoverlapping paths and a frozen contract fingerprint. Otherwise use one writer. Readers may run in parallel. Only root integrates worktrees and verifies the integrated tree. Do not commit inside worker tasks.

## Evidence and Git

Use the loop's JSON handoffs and command receipts under ignored `.bunker-loop/`. A passing statement is not a passing gate. Run real commands, record exit codes, and invalidate evidence after content changes. Missing product scripts are blockers, never successful skips. Expected-red acceptance evidence must name the behavior test and assertion; runner/import/compile failures are not expected red.

No unrelated changes, destructive Git cleanup, force push, automatic approval bypass or unrequested deployment. No commit while relevant checks fail; no integration while required gates fail. The loop does not commit/push/deploy automatically. Preserve interrupted work and unresolved review findings.
