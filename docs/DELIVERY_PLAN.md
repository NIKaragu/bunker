# План постачання

Робота виконується через `bunker-mvp-delivery`: research → plan → tooling → contracts → acceptance tests → implementation → independent review → final gates/docs. Кожен writer має точні paths; contracts frozen перед паралельною реалізацією; root інтегрує та запускає gates.

## Вертикальні зрізи

1. Rules research, source record, product docs та agent workflow.
2. pnpm workspace, strict TypeScript, lint/format/test/build tooling і lockfile.
3. Versioned Zod contracts та deterministic game engine.
4. Anonymous sessions, rooms, in-memory repositories, TTL, post-game lifecycle.
5. Socket.IO intents, projections, timers, idempotency, claims і operational limits.
6. Onboarding/profile, room browser і lobby.
7. Game table, reveal/discussion/voting/tie/overtime та base final.
8. Packs, Special Conditions, combined decks та localization.
9. Local custom pack CRUD/import/export.
10. Survival Story threats, utility voting, consequences і Catastrophe.
11. Spectator, reconnect, control/host transfer і failure states.
12. Post-game summary/readiness/rematch.
13. Rule traceability, multi-context E2E, responsive/accessibility/browser checks.
14. Vercel/Railway config, production-like smoke та release docs.

## Release gate

Required: frozen protocol fingerprint; no unresolved P0/P1; format, lint, strict typecheck, domain/server/frontend tests, Playwright multi-context, both production builds, rules audit, production dependency audit and smoke. Deployment is separate external action: execute only with configured credentials and then record URLs/probes; otherwise retain manual commands and the credentials blocker.

## Rollback і follow-up

Frontend can roll back to previous Vercel deployment. Backend rollback/redeploy restarts the single process and therefore loses active in-memory rooms. Before enabling multiple replicas, add shared session/room repository, distributed scheduler/lock and Socket.IO adapter, then rerun the same race/privacy matrix.
