# Джерела

Дата перевірки: 2026-09-05. Факти про правила та версії нижче походять із research handoff поточного delivery loop.

## Правила й UX

- [Офіційна сторінка видавця](https://economicusgame.com/bunker) — підтверджує «Бункер» і посилання на правила редакції 3.3.
- [Посилання видавця на PDF 3.3](https://1drv.ms/b/c/fa867013a4269d55/IQAFufpOboNBQoZkuDsmIkiPAXWopcXDCKTMtPac6WLyT-c?e=aLpe2j) — під час перевірки повернуло authentication HTML/403 замість PDF-байтів.
- [Цифрові правила](https://online.bunker-game.com/ru/rules) — допоміжна звірка структури та UX, не нормативне джерело і не заміна PDF 3.3.
- `BUNKER_CODEX_MASTER_PROMPT.md` — продуктовий контракт і джерело рівно чотирьох `approved-product-rule`.

PDF_STATUS: blocked-publisher-link

PDF_SHA256: unavailable

Checksum не обчислювався: hash HTML сторінки входу не є checksum PDF. Через відсутність валідних PDF-байтів точні сторінки офіційних правил не вигадані; traceability використовує перевірені секції/теми та явно позначає блокування. Після доступного завантаження треба зафіксувати SHA-256, дату, сторінки й повторно пройти rule audit.

## Технології та розгортання

- [Node.js releases](https://nodejs.org/en/about/previous-releases) — актуальні підтримувані гілки Node; workspace зафіксований на Node 24.20.0.
- [pnpm installation](https://pnpm.io/installation) — Corepack/інсталяція; workspace зафіксований на pnpm 12.3.4.
- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) — App Router та Node requirements; використано Next.js 16.3.4.
- [Socket.IO server installation](https://socket.io/docs/v4/server-installation/) — протокол realtime; використано 4.8.3.
- [Vitest guide](https://vitest.dev/guide/) — test runner; використано 5.0.0.
- [Vercel monorepos](https://vercel.com/docs/monorepos) — frontend root/build configuration.
- [Railway networking limits](https://docs.railway.com/networking/public-networking/specs-and-limits) — public port/health endpoint considerations.

Версії інших runtime залежностей перевірені в офіційних package registries і зафіксовані lockfile: React 19.2.8, Express 5.2.1, Zustand 5.0.15, Zod 4.5.4, Playwright 1.63.0, TypeScript 6.0.3. Beta/canary пакети не використовуються.

## Ліцензійна межа

Ми стисло описуємо механіку, але не копіюємо дослівні тексти карт, ілюстрації, логотипи чи датасети третіх сторін. Built-in catalog у коді є оригінальним двомовним placeholder-контентом. Користувач відповідає за права на імпортований custom pack. Fan pack має містити оригінальний контент, бути позначений як неофіційний і не використовувати чужий брендинг без дозволу.
