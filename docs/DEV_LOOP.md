# Луп розробки Bunker

Один головний Codex керує чергою, контекстом і інтеграцією. Спільні агенти знають обидві частини, але кожне доручення має одну мету, одного власника й конкретні дозволені файли. Конфігурація агента — у `.codex/agents/`; конфігурація перевірок — у root, `frontend/` або `backend/loop.config.json`.

## Запуск

Потрібні Node 20+, Git і початковий commit. Codex CLI потрібен тільки для команди `run`. Виконуйте команди з кореня репозиторію; обидві shell-оболонки також знаходять Node entrypoint відносно себе.

З відкритої сесії Codex достатньо доручення: «Запусти bunker-mvp-delivery для backend, slice reconnect, мета …». Оркестратор використовує:

```powershell
node scripts/dev-loop.mjs prepare --scope backend --slice reconnect --goal "Implement bounded reconnect behavior"
```

З окремого термінала:

```powershell
.\scripts\dev-loop.cmd run --scope frontend --slice lobby --goal "Implement the agreed lobby slice"
```

Bash: `./scripts/dev-loop.sh run --scope frontend --slice lobby --goal 'Implement the agreed lobby slice'`.

`dev-loop.cmd` працює у Windows без зміни PowerShell ExecutionPolicy. Додатковий `dev-loop.ps1` доступний там, де локальні PowerShell scripts дозволені. Обидва повертають exit code Node. У `.cmd` не передавайте shell operators як частину аргументів; для довільного тексту мети використовуйте прямий `node scripts/dev-loop.mjs` із належним quoting.

Для інфраструктури використовуйте `--scope root --profile setup`. За замовчуванням `delivery`; поки продукт не реалізовано, його gates чесно повідомляють про відсутні scripts.

`--help` нічого не змінює. `--dry-run` перевіряє передумови й друкує план без створення branch/state і запуску Codex. На новому запуску потрібний чистий Git state; existing user changes залишаються недоторканими. Створюється `feature/<scope>-<slice>`.

## Фази та ownership

| Фаза | Роль | Результат |
| --- | --- | --- |
| research | researcher | Джерела/факти або обґрунтоване повторне використання evidence |
| plan | planner | Одна мета, acceptance criteria, exact writePaths/testPaths, gateIds |
| tooling (тільки root) | backend-developer за дорученням root | Серійні зміни workspace config, інструкцій або lockfile; або підтвердження незмінності |
| contracts | backend-developer за дорученням root | Серійна зміна shared contracts або підтвердження незмінності |
| tests | tester | Behavior tests і доказ їх запуску; production source не змінюється |
| implementation | frontend-developer або backend-developer | Реалізація лише у наданих paths |
| review | незалежний reviewer | Findings або passing verdict після gates |
| finalize | finalizer | Тільки документація, актуальні gates і завершення |

Шляхи в plan відносні до Git root. Exact file — `frontend/src/lobby.tsx`; дозволений каталог — `frontend/src/` із кінцевим `/`. `writePaths` містить і source, і test paths. `testPaths` — файли/каталоги цього slice, які належать Tester; module unit tests Developer може писати поза ними. Усі `tests/acceptance/` додатково захищені конфігурацією scope. Зміни, видалення та перейменування перевіряються за фактичним вмістом Git-visible файлів, включно з untracked.

Ролі research, plan і review не пишуть файли. Вони повертають структурований результат, який root зберігає під `.bunker-loop/`. Planner не створює product docs прямо у своїй фазі; потрібна документація потрапляє у writePaths для відповідного виконавця або Finalizer.

Root scope дозволяє одну міжкомпонентну задачу. Frontend scope змінює тільки frontend; backend — backend і packages/game-engine. Shared contracts змінюються тільки у root/contracts. Зміна контракту виявлена пізніше — повернення до plan/contracts, а не прихована правка під час implementation.

## Handoff

Worker повертає JSON; root зберігає його в ignored `.bunker-loop/handoffs/` та передає `advance`. Скрипт порівнює `files` з реальним diff поточної фази, перевіряє ownership і роль. `agentId` — реальний ID native subagent; у чисто детерміністичних тестах використовуються явно синтетичні IDs.

```json
{
  "taskId": "frontend/lobby",
  "phase": "implementation",
  "role": "frontend-developer",
  "agentId": "actual-native-agent-id",
  "status": "passed",
  "summary": "Implemented the accepted lobby behavior.",
  "files": ["frontend/src/lobby.tsx"]
}
```

Додаткові поля:

- plan: `plan: { goal, acceptanceCriteria: ["..."], writePaths: ["..."], testPaths: ["..."], gateIds: ["..."] }`. Goal повинен точно відповідати вхідній меті. Gate IDs — усі з вибраного профілю scope.
- tests: `testEvidence` з командою, назвою тесту, assertion і результатом. Якщо tests-first непридатний, пояснити чому; це не скасовує наступні gates.
- research reuse: `status: "skipped"`, пояснення у summary та непорожній масив `evidence` із джерелами й датою/версією.
- review: `findings: []` для passing або `status: "changes_requested"` і findings виду `{ id, severity: "P1", owner: "developer", file, evidence }`. Доступні severity P0/P1/P2 і owner developer/tester/planner.
- будь-який справжній blocker: `status: "blocked"` та конкретна причина у summary.

У root implementation приймаються обидві Developer roles. Після паралельної роботи root додає `contributions: [{ agentId, role, files }]`: усі змінені файли мають бути розподілені рівно один раз. Усі ці agent IDs, а також автори tooling/contracts, виключаються з незалежного review. Для одного виконавця contributions необов'язкові.

```powershell
node scripts/dev-loop.mjs advance --scope frontend --slice lobby --handoff .bunker-loop/handoffs/lobby-implementation.json
node scripts/dev-loop.mjs check --scope frontend --slice lobby
node scripts/dev-loop.mjs status --scope frontend --slice lobby
```

`check` сам запускає всі потрібні commands без shell interpolation, з timeout і логами. Перша невдала команда зупиняє перевірки з nonzero exit. Поточна фаза зберігається. Timeout, signal, неповний запуск, переповнений output або зміна source під час gate не стають PASS. Gate receipts прив'язані до content fingerprint; старі результати не дозволяють прийняти passing review чи завершення.

Після review із findings луп повертається до відповідного власника; найраніша залежність має перевагу: planner → tester → developer. Повторний review має перевірити всі попередні findings. Ліміт review задає `--max-review-iterations` (1–10, стандартно 3), він зберігається при resume. Вичерпання бюджету блокує run із збереженими findings.

## Відновлення

```powershell
node scripts/dev-loop.mjs prepare --scope frontend --slice lobby --resume
```

Повертається поточна незавершена фаза після останнього успішного handoff. Часткові зміни допустимі тільки в ownership цієї фази. Зміни content роблять gate evidence неактуальним. Несподівані зміни, інша branch/HEAD, інший goal/profile або спроба скинути review budget зупиняють команду.

Якщо після review потрібна нова правка, root явно відкриває потрібну фазу:

```powershell
node scripts/dev-loop.mjs reopen --scope frontend --slice lobby --owner developer --reason "Review follow-up requires a source correction"
```

Це скидає gates/review і зберігає бюджет. `reopen --owner planner` потрібний для нового плану/контракту; `--owner tester` — для виправлення тесту. `--owner current` знімає усунений blocker і зберігає поточну фазу та часткові зміни, зокрема contracts/tooling. Перестрибнути вперед через обов'язкові фази не можна. Завершений run або вичерпаний review budget повторно не відкривається; наступна узгоджена задача має новий slug.

Стан пишеться через temporary file і rename. Одна команда або gate process утримує `.bunker-loop/writer.lock`; запущений через `run` оркестратор додатково утримує `orchestrator.lock` на весь час сесії. Після аварійного завершення перевірте PID у lock і переконайтеся, що процес уже не працює; лише тоді видаліть саме цей lock. Часткові файли задачі не видаляйте. Для нового run в іншому scope при незавершеній задачі використовуйте окремий worktree.

## Паралельність

Read-only research/review можна паралелити. Для одночасних writers root спочатку приймає contracts phase, фіксує її fingerprint і дає непересічні paths. Кожен writer працює в окремому Git worktree/branch; глобальні контракти й lockfile не змінюються паралельно. Root переносить результати в integration worktree послідовно, перевіряє ownership і запускає gates на об'єднаному коді.

Скрипт не виконує автоматичні merge/cherry-pick і не створює агентів замість native runtime. Підготовка worktrees, перевірка contract fingerprint перед dispatch та інтеграція — обов'язки root із цього skill. Для невеликої задачі достатньо послідовних writers. У цій сесії доступні три активні виконавці; shared catalog містить сім спеціалізацій, а не сім постійних процесів.

## Межі гарантій

Це локальний луп для кооперативних агентів. Handoffs і state редаговані власником workspace; вони не є захистом від навмисного підроблення. Script перевіряє реальні files/gates, а root звіряє особу агента, research і expected-red evidence. TOML `read-only` застосовується лише runtime, який підтримує завантаження цієї конфігурації; якщо native spawn цього поля не надає, root передає інструкції явно і не називає їх OS-level sandbox.

Права поточної сесії визначає Codex. Луп їх не підвищує і не передає flags обходу approvals. Якщо sandbox блокує потрібний запуск, користувач може обрати режим дозволів у клієнті. Стан лупу дозволяє продовжити роботу після цього.

## Перевірені джерела

Станом на 2026-09-05: локальний `codex-cli 0.153.0`, `codex --help`, `codex exec --help`; Node v20.19.1 та Git 2.44.0.windows.1.

- [Custom agents і успадкування налаштувань](https://learn.chatgpt.com/docs/agent-configuration/subagents).
- [AGENTS.md і вкладені інструкції](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- [Параметри конфігурації](https://learn.chatgpt.com/docs/config-file/config-reference).

Фактичні результати перевірки цього bootstrap наведено у `docs/SETUP_VALIDATION.md` після виконання.
