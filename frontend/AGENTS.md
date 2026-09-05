# Frontend scope

Use the shared agent catalog at `../.codex/agents/` and the shared workflow at `../docs/DEV_LOOP.md`. Settings for this scope are in `loop.config.json`.

Frontend will use Next.js, TypeScript, client Socket.IO and mobile-first Ukrainian/English UI. Read backend behavior and `../packages/contracts/` before implementation; server state remains authoritative. Own only the frontend files granted by the task. Request a root contract phase for protocol changes.

Tester owns `tests/acceptance/`. Developers own implementation and module unit tests; do not weaken acceptance behavior. Verify role/phase-disabled actions, viewer-specific cards, 320px layout, reconnect feedback and multiplayer behavior when relevant. Delivery gates become runnable when the actual frontend package is bootstrapped; do not substitute the setup checks for UI verification.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
