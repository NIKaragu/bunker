# Стратегія тестування

Acceptance manifest зв'язує AC-01…AC-17 із executable scenarios. Tester володіє acceptance tests; developers додають module unit tests і не змінюють acceptance ownership. Determinism забезпечують fake clock/scheduler і seeded RNG.

## Рівні

- Domain/unit: capacity 3–15, allocation races, unique deal, five rounds, reveal legality, rotating starter, expulsion schedule, timers, ballots/ties/overtime, all Special effects, combined decks, both goals/finals і rematch.
- Server/integration: session/room lifecycle, nickname reservation, reconnect grace, spectator, host/control transfer, Zod/auth/version/idempotency, viewer privacy, limits/CORS, shutdown, pack snapshots і final projection.
- UI/component: profile storage, room/lobby/game/final/post-game states, custom packs, `uk`/`en`, keyboard/focus/live regions, 320 px controls and server-deadline countdowns.
- Playwright: isolated browser contexts for 3- and 4-player allocation, complete rounds/ties, exiled behavior, reconnect/spectator, both finals, rematch, mixed locales, custom pack and production-like websocket flow.

Canonical scenario IDs та assertion names зберігаються в `packages/game-engine/tests/acceptance/acceptance-manifest.ts`. `RULES_TRACEABILITY.md` посилається лише на ці ID. Expected-red приймається тільки як behavior assertion failure; import/compile/runner failure є blocker.

## Команди

```powershell
pnpm test
pnpm test:e2e
pnpm typecheck
pnpm build
pnpm audit:rules
pnpm smoke
```

Перед review запускається configured loop `check`; після будь-якої зміни evidence стає неактуальним. Production-like smoke збирає і запускає backend, перевіряє liveness/readiness та прибирає child process. POSIX локально вправляє SIGTERM handler; на Windows process termination semantics не доводять виконання handler, тому graceful sequence окремо покриває server acceptance scenario `SRV-010:shutdownEvent`/`SRV-010:newCommandsStop`.

## Ручний party smoke

Перевірити 320 px і desktop: три різні browser profiles, по дві приватні руки без витоку; late spectator; reconnect до/після 60 с; один короткий timer кожного типу; tie для малої та 6+ групи; Special action; base і Survival final; rematch із новим gameId; `uk` та `en`; reload/error/offline feedback; жодних console/network errors.
