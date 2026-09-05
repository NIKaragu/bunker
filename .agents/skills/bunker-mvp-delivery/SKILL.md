---
name: bunker-mvp-delivery
description: Run a bounded Bunker development slice with native subagents, shared frontend/backend contracts, independent acceptance tests, review and resumable evidence. Use for implementation or fixes in this repository.
---

Read root `AGENTS.md`, `docs/DEV_LOOP.md`, the selected scope's `AGENTS.md` and `loop.config.json`. Product facts come from the master prompt and verified Ukrainian product documents as they are created. Do not treat missing rule research as completed.

Inputs: scope (`root`, `frontend`, `backend`), slice slug, goal, profile (`setup` for workflow infrastructure, `delivery` for product work), review limit. Use the supplied goal; do not expand it to the entire MVP.

In this session run `node scripts/dev-loop.mjs prepare --scope <scope> --slice <slug> --goal "<goal>" [--profile setup]`. Resume with the same scope/slice and `--resume`. Use `run` only from an external terminal; it starts one Codex orchestrator.

Follow the printed task packet. Use native spawn/delegation for atomic work; if a runtime cannot select a named custom agent, explicitly read and supply that role's `.codex/agents/<role>.toml` instructions and report the permission limitation. Do not simulate seven agents by running seven shell prompts. Do not recursively launch this skill inside workers.

Complete research (or justified evidence reuse), plan, serial root tooling if applicable, contracts, tests, implementation, review and finalize through `advance --handoff <file>`. Each handoff names the actual agent, role, task ID, phase, findings and changed files. See the exact format in `docs/DEV_LOOP.md`. Workers return data; root validates and records it. Root freezes contracts before writers start. For multiple implementation workers attach contributions with each actual agent ID, role and nonoverlapping changed files.

Use separate worktrees for parallel writers; run state belongs to the integration worktree. Dispatch only after a contract checkpoint; integrate one result at a time and validate its paths against the task. For simple slices use sequential writers. All agent roles have project-wide context; scope-specific file permissions remain narrow.

Tester creates behavior acceptance tests before implementation where practical. Expected-red evidence names a test, assertion and observed failure; a missing runner is a blocker. Developers never change Tester-owned tests. Reviewer is independent from implementation agents and routes findings to developer, tester or planner.

Run `check` for actual configured gates before accepting a passing review and before finalization. On findings, use the returned phase; do not reset the review budget. On a real blocker preserve state and report it. Finalizer edits docs only; rerun gates after its edits. If interrupted, validate the actual worktree on resume rather than trusting an old success marker.

Done means matching revision, passing required gates, accepted independent review, no unresolved findings, documentation handoff and a concise report. Product completion additionally needs the master prompt's complete quality matrix. Setup completion does not imply product completion.
