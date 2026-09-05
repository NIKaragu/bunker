# Безпека та operations

## Trust model

Browser є недовіреним. Backend перевіряє кожний HTTP/Socket.IO payload через Zod, session token, room membership, role, phase, `gameId`, `expectedVersion` і `commandId`. Server генерує state/deal/deadlines/results. Viewer projection не містить чужих hidden cards; token не broadcast-иться й не має потрапляти в logs/errors.

Nickname нормалізується й резервується на час reconnect grace. Upload avatar повторно перевіряється за MIME/signature/bytes, до 256 KB. Pack JSON обмежений 1 MB і schema allowlist. Не вставляйте card text як HTML.

## Конфігурація backend

| Variable                  |                 Default | Призначення                                        |
| ------------------------- | ----------------------: | -------------------------------------------------- |
| `PORT`                    |                  `4000` | Railway надає public listen port                   |
| `CORS_ORIGINS`            | `http://localhost:3000` | comma-separated explicit allowlist; `*` заборонено |
| `MAX_ROOMS`               |                   `100` | rooms на process                                   |
| `MAX_SPECTATORS_PER_ROOM` |                    `40` | spectators на room                                 |
| `MAX_PAYLOAD_BYTES`       |               `1048576` | Express JSON limit                                 |
| `MAX_COMMANDS_PER_MINUTE` |                   `180` | per-session intent rate                            |
| `SESSION_GRACE_MS`        |                 `60000` | reconnect grace                                    |
| `EMPTY_ROOM_TTL_MS`       |                 `60000` | cleanup empty rooms                                |
| `SESSION_TTL_MS`          |              `86400000` | anonymous session TTL                              |
| `TRUST_PROXY`             |                 `false` | `true` лише за trusted platform proxy              |

Frontend потребує `NEXT_PUBLIC_BACKEND_URL=https://<backend-domain>`. Це public origin, не secret. Secrets у repo/chat не додаються.

## Railway: один backend instance

1. Створити service з repository root; runtime Node 24.20.0.
2. Build: `pnpm install --frozen-lockfile && pnpm --filter @bunker/backend build`.
3. Start: `pnpm --filter @bunker/backend start`.
4. Додати env вище; `CORS_ORIGINS` = точний Vercel production origin і потрібні preview origins.
5. Healthcheck path `/health/ready`; liveness `/health/live`.
6. Встановити рівно одну replica, вимкнути autoscaling/multi-region replicas.
7. Після deploy виконати `$env:SMOKE_BASE_URL='https://<domain>'; pnpm smoke`.

SIGTERM/SIGINT переводить service в non-accepting state, надсилає `server:shutdown`, закриває Socket.IO/HTTP і cleanup jobs. Railway deploy/restart безповоротно видаляє всі active in-memory rooms/sessions/games; повідомляйте учасників перед плановим deploy.

## Vercel frontend

1. Root Directory: `frontend`.
2. Install/build бере committed `frontend/vercel.json`; monorepo install запускається з repo root.
3. Environment variable: `NEXT_PUBLIC_BACKEND_URL=https://<railway-domain>` для Production/Preview.
4. Після deploy додати точний Vercel origin у Railway `CORS_ORIGINS` і redeploy backend.
5. Перевірити onboarding, rooms, websocket connect, reconnect, mobile layout і відсутність console/network errors.

## Monitoring та incidents

Monitor 5xx/429, process restarts, memory, event-loop lag, Socket.IO connects, active rooms/sessions, invalid protocol/stale-state rate і health latency. Logs використовують request/correlation ID та machine code без token/card payload. При leak скасувати deploy, restart process (це інвалідує всі tokens), перевірити logs/artifacts і повідомити користувачів. При memory pressure заборонити нові rooms, завершити process graceful і не додавати replica як швидкий workaround.

## Release checklist

- `pnpm verify`, `pnpm test:e2e`, `pnpm audit:rules`, `pnpm audit:dependencies`, `pnpm smoke` green;
- немає P0/P1 і TODO/skip у acceptance;
- Vercel/Railway env, explicit CORS, healthcheck, single replica перевірені;
- deployment URL або credentials blocker записаний чесно;
- rollback version відома; active-room loss прийнятий;
- PDF status/checksum і content licensing не перебільшені.
