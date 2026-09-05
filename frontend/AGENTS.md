# Frontend scope

Use the shared agent catalog at `../.codex/agents/` and the shared workflow at `../docs/DEV_LOOP.md`. Settings for this scope are in `loop.config.json`.

Frontend will use Next.js, TypeScript, client Socket.IO and mobile-first Ukrainian/English UI. Read backend behavior and `../packages/contracts/` before implementation; server state remains authoritative. Own only the frontend files granted by the task. Request a root contract phase for protocol changes.

Tester owns `tests/acceptance/`. Developers own implementation and module unit tests; do not weaken acceptance behavior. Verify role/phase-disabled actions, viewer-specific cards, 320px layout, reconnect feedback and multiplayer behavior when relevant. Delivery gates become runnable when the actual frontend package is bootstrapped; do not substitute the setup checks for UI verification.

<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before modifying Next.js code, find and read the relevant documentation in `node_modules/next/dist/docs/`. Your training knowledge may be outdated.

<!-- END:nextjs-agent-rules -->
