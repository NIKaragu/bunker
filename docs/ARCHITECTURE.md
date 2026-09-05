# Архітектура

## Межі системи

`frontend/` — Next.js App Router і Zustand для UI/session cache. `backend/` — Express HTTP, Socket.IO, orchestration, scheduler і in-memory repositories. `packages/contracts/` — Zod schemas та `bunker-party-v1`; `packages/game-engine/` — pure state transitions без React/Express/Socket.IO/storage.

```text
Browser -> HTTP session/rooms ----+
Browser -> Socket.IO intents -----+--> Backend service -> pure game engine
           viewer snapshots <-----+        |              clock + seeded RNG
                                           +-> in-memory rooms/sessions/jobs
```

Backend — єдине джерело room/game/readiness/deadline/vote state. Frontend не прогнозує transition: він показує останній snapshot і server timestamp. Кожний command проходить runtime schema, authentication, role/phase authorization, `expectedVersion` та idempotency через `commandId`.

## Domain і проєкції

Engine отримує explicit command, immutable state та injected dependency. Deal, starter, expulsion schedule, tie/lot, Special effects і final deterministic для однакових inputs. Backend адаптує engine до room lifecycle і створює viewer-specific projection: controller отримує лише свої hands/legal actions, spectator — тільки public state. Error/log payloads не містять hidden cards або reconnect token.

## Storage і lifecycle

Sessions та rooms живуть у пам'яті одного process. Interfaces допускають майбутні Redis/PostgreSQL adapters, але MVP не має persistence чи cross-replica coordination. Disconnect ставить 60-second grace job; empty room — TTL cleanup. Room/game deletion скасовує jobs. Post-game populated room не прибирається лише через завершення гри.

Один Railway instance є архітектурним інваріантом MVP. Autoscaling або кілька replicas розділять state та Socket.IO clients і спричинять неконсистентність. Deploy/restart губить усі active rooms, sessions, games і tokens; UI має обробити `server:shutdown`/expired restore.

## HTTP, realtime та security boundary

HTTP створює/відновлює session, керує profile/room і валідовує pack. Socket.IO виконує state-changing intents і доставляє snapshots. Bearer/reconnect token є opaque secret. CORS приймає лише explicit origins; JSON/packs/avatars/rate/rooms/spectators мають limits. SIGTERM/SIGINT припиняє нові commands, надсилає shutdown event, закриває Socket.IO/HTTP та jobs.

## Розгортання

Vercel збирає `frontend/` з `NEXT_PUBLIC_BACKEND_URL`. Railway із repo root збирає backend і запускає `backend/dist/backend/src/server.js`; platform надає `PORT`, healthcheck — `/health/ready`. Обидва origins працюють через HTTPS/WSS. Деталі в `SECURITY_AND_OPERATIONS.md`.
