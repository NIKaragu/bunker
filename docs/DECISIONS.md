# Прийняті рішення

- 2026-09-05: реалізується повний MVP з `BUNKER_CODEX_MASTER_PROMPT.md` через bounded multi-agent delivery loop.
- Каталоги `frontend/` і `backend/` замінюють запропоновані `apps/web`/`apps/server`; shared contracts і pure engine лишаються у `packages/`.
- Єдиний активний rules profile — `bunker-party-v1`: редакція 3.3 плюс рівно чотири overrides `APR-*`. Інших house rules немає.
- Publisher PDF link зараз повертає authentication HTML/403. До отримання PDF-байтів checksum і page locators мають статус unavailable/blocked; HTML hash не записується як PDF hash.
- Runtime/toolchain pin: Node 24.20.0, pnpm 12.3.4; stable versions, committed lockfile.
- Backend server-authoritative; game engine pure і deterministic з injected clock/random. Zustand зберігає лише client/UI state.
- MVP storage in-memory, один Railway instance без autoscaling. Restart/deploy втрачає sessions, rooms і games; це прийняте обмеження.
- Reconnect grace — 60 с; після grace profile/token видаляються, але in-game characters не зникають і переходять під control іншого participant.
- Custom packs зберігаються локально в браузері, проходять Zod validation і snapshot-яться в game. Built-in data — оригінальний bilingual placeholder; copyrighted card datasets/assets не включаються.
- Frontend deployment target — Vercel із root `frontend/`; backend — Railway із repo root, healthcheck `/health/ready`, одна replica.
- Deployment credentials відсутні у workspace: конфіг і manual commands готові, live deployment/URL лишається зовнішнім blocker без вигаданого success.
- Loop не робить commit/push/deploy автоматично. Reviewer має максимум одну відмову для поточного delivery run.
