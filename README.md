# Bunker Party Web

Mobile-first web-MVP для партії в «Бункер»: анонімні сесії, публічні кімнати, server-authoritative роздача й голосування, 3–15 людей, spectator/reconnect, custom packs, базовий та Survival Story фінали, rematch у тій самій кімнаті. Єдиний rules profile — `bunker-party-v1` (редакція 3.3 плюс рівно чотири [затверджені зміни](docs/RULES_TRACEABILITY.md)).

## Передумови

- Node.js 24.20.0;
- pnpm 12.3.4 через Corepack;
- Git.

```powershell
corepack enable
pnpm install --frozen-lockfile
```

## Локальний запуск

Одна cross-platform команда запускає backend і frontend, передає їхній output у поточний terminal, налаштовує взаємні origins і завершує обидва процеси за `Ctrl+C`, `SIGINT` або `SIGTERM`:

```powershell
node scripts/dev.mjs
```

Default: frontend `http://localhost:3000`, backend `http://localhost:4000`. Для інших портів задайте `BUNKER_FRONTEND_PORT` і `BUNKER_BACKEND_PORT`; launcher сам передасть `CORS_ORIGINS` та `NEXT_PUBLIC_BACKEND_URL`:

```powershell
$env:BUNKER_FRONTEND_PORT=3100
$env:BUNKER_BACKEND_PORT=4100
node scripts/dev.mjs
```

Для окремого запуску використовуйте `backend/.env.example` і `frontend/.env.example`, потім `pnpm --filter @bunker/backend dev` та `pnpm --filter @bunker/frontend dev` у двох терміналах.

## Перевірка

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm audit:rules
pnpm audit:dependencies
pnpm smoke
```

`pnpm smoke` збирає backend, запускає production entrypoint на вільному локальному порту, перевіряє `/health/live` і `/health/ready`, потім завершує процес. Для вже розгорнутого API: `$env:SMOKE_BASE_URL='https://api.example.com'; pnpm smoke`.

## Структура

- `frontend/` — Next.js App Router, локалізація та client-only profile/pack storage;
- `backend/` — Express, Socket.IO й in-memory orchestration;
- `packages/contracts/` — Zod HTTP/realtime schemas `bunker-party-v1`;
- `packages/game-engine/` — pure deterministic rules, injected clock/random;
- `docs/` — product, rules, architecture, protocol, testing та operations;
- `scripts/` — delivery loop, audit і smoke.

## Розгортання

Frontend: створіть Vercel project із Root Directory `frontend`, встановіть `NEXT_PUBLIC_BACKEND_URL=https://<railway-domain>` і використайте committed `vercel.json`. Backend: Railway project з Root Directory repo root, build `pnpm install --frozen-lockfile && pnpm --filter @bunker/backend build`, start `pnpm --filter @bunker/backend start`, healthcheck `/health/ready`, одна replica. Повні змінні й manual checklist — у [SECURITY_AND_OPERATIONS.md](docs/SECURITY_AND_OPERATIONS.md).

Deployment credentials у workspace відсутні, тому live URL не заявляється. Screenshot ще не створений: `docs/screenshots/game-table.png` є запланованим release artifact, а не наявним файлом.

## Відомі обмеження

- Server state лише в пам'яті: deploy/restart видаляє active rooms, sessions і games.
- Railway має працювати в одній replica; horizontal scaling потребує shared repository/pub-sub.
- Офіційний PDF 3.3 зараз повертає authentication HTML/403, тому checksum і точні сторінки не зафіксовані. Це чесно позначено в [SOURCES.md](docs/SOURCES.md).
- Built-in картки — оригінальний placeholder-контент; copyrighted набори не включені.

[Product spec](docs/PRODUCT_SPEC.md) · [Правила](docs/GAME_RULES.md) · [Архітектура](docs/ARCHITECTURE.md) · [Realtime](docs/REALTIME_PROTOCOL.md) · [Тестування](docs/TEST_STRATEGY.md) · [Dev loop](docs/DEV_LOOP.md)
