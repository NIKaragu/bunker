# Tools та skills

## Delivery workflow

`bunker-mvp-delivery` керує bounded phases, handoff evidence, contracts freeze, gates, review budget і resume. Проєктні ролі в `.codex/agents/`: Researcher, Planner, Tester, Backend/Frontend Developer, Reviewer, Finalizer. Вони використовують GPT-5.6 Sol medium і читають лише task-relevant paths.

Корисні команди:

```powershell
node scripts/dev-loop.mjs prepare --scope root --slice bunker-mvp --goal "Implement and verify the complete Bunker Party Web MVP defined in BUNKER_CODEX_MASTER_PROMPT.md" --max-review-iterations 2
node scripts/dev-loop.mjs status --scope root --slice bunker-mvp
node scripts/dev-loop.mjs check --scope root --slice bunker-mvp
```

`scripts/check-setup.mjs` та `scripts/tests/dev-loop.test.mjs` перевіряють сам workflow. Product commands визначені в root `package.json`.

## Runtime/toolchain

- pnpm workspace, Node 24.20.0, TypeScript strict;
- Next.js/React frontend, Zustand UI state;
- Express/Socket.IO backend;
- Zod contracts;
- Vitest + Testing Library + Playwright;
- ESLint/Prettier;
- custom `rules-audit.mjs` і `smoke.mjs`.

## Зовнішні integrations

Vercel і Railway є deployment targets, але credentials/integrations у поточному workspace не налаштовані. Жоден optional plugin не потрібен для local implementation, tests чи manual deployment config. Secrets не передаються агентам або в документацію.

## Context policy

Task packet, exact allowed paths, найближчий `AGENTS.md` і безпосередні dependencies читаються першими. Новий path додається лише через acceptance criterion, contract dependency або observed command evidence; причина фіксується в handoff. System folders, `.git`, dependency/build/cache trees та unrelated component не скануються.
