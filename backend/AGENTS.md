# Backend scope

Use the shared agent catalog at `../.codex/agents/` and the shared workflow at `../docs/DEV_LOOP.md`. Settings for this scope are in `loop.config.json`.

Backend will use Express, TypeScript and Socket.IO with an authoritative in-memory room state and pure domain engine in `../packages/game-engine/`. Read frontend use cases and `../packages/contracts/` before implementation. Own only files granted by the task; contract changes require a root contract phase.

Tester owns `tests/acceptance/`. Developers own implementation and module unit tests. Inject clock/randomness; check authorization, races, stale gameId, duplicate intents, hidden-card filtering and reconnect invariants when relevant. Delivery gates become runnable after backend bootstrap; setup checks do not certify a working server.
