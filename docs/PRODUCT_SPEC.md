# Product spec: Bunker Party Web MVP

## Мета

Застосунок замінює роздачу, ведучого, таймери, підрахунок голосів і фінальні перевірки для реальної локальної/віддаленої компанії. Учасник входить без акаунта, створює або знаходить публічну кімнату, проходить повну партію та може почати rematch без повторного входу.

## Користувачі та основні потоки

Host створює профіль і кімнату, обирає 3–15 max participants, mode, final goal, packs, fill-to-six і чотири незалежні таймери. Participants приєднуються, за потреби забирають extra character, підтверджують ready; валідний склад auto-start. Людина, що прийшла після старту, стає spectator.

У грі кожний controller бачить лише свої руки, відкриває legal card, завершує виступ, голосує кожним контрольованим персонажем і застосовує Special Condition. Host може закінчити discussion/ballot. Сервер веде п'ять раундів, official expulsion schedule, tie/runoff/lot, overtime та фінал. Після result усі повертаються в `post-game`, повторно ready й запускають нову гру в тій самій room.

Disconnect дає 60 секунд на restore через opaque token. До дедлайну повертаються seat, role, characters і private state. Після grace профіль видаляється; у грі characters лишаються й control атомарно передається, а schedule не перераховується.

## Функціональні вимоги

- Профіль: normalized unique nickname, `uk`/`en`, deterministic avatar або локально стиснений PNG/JPEG/WebP.
- Кімнати: list/create/join/leave/host-close, lobby/post-game settings, readiness, host transfer, TTL empty-room cleanup.
- Розподіл: 3 людини — по два characters; 4–5 — optional atomic FCFS fill до шести; 6+ — по одному.
- Ігровий цикл: deal, reveal/speech/discussion/vote, п'ять base rounds, required overtime, bunker exploration, four nullable timers, exiled behavior, Special Conditions, base/Survival Story final.
- Packs: вибір кількох packs; local custom create/edit/duplicate/delete/import/export; schema validation; active game отримує snapshot.
- UI: mobile-first від 320 px, keyboard/focus/touch support, live status, окрема локаль кожного клієнта.
- Protocol: versioned Zod inputs, stable errors, acknowledgements, `expectedVersion`, `commandId`, viewer-specific snapshots.

## Надійність і приватність

Backend є єдиним джерелом state. Client надсилає intent. Інші hidden hands, reconnect tokens і необроблені payloads не потрапляють у projection/error/log. Clock, scheduler і RNG ін'єктуються; duplicate/stale/race intents не роблять двох transition. CORS є explicit allowlist, payload/rate/room/spectator limits конфігуруються.

## Поза MVP

Акаунти, database, приватні кімнати, invite/password, chat/voice/video, AI, matchmaking, ratings/history, push notifications, moderation console і кілька backend replicas. Контракти repository та protocol залишають extension point.

## Acceptance

17 acceptance criteria покриті executable manifest у `packages/game-engine/tests/acceptance/acceptance-manifest.ts`; rule-level відповідність — у `RULES_TRACEABILITY.md`. Done потребує format, lint, strict typecheck, unit/integration/component/multi-context E2E, production builds, rules/dependency audits і smoke. Live deploy можливий лише з credentials; інакше точні manual steps та blocker є коректним результатом.
