# Bunker

Підготовлена інфраструктура розробки гри: один Codex-оркестратор, спільні атомарні агенти й окремі луп-налаштування frontend/backend. Застосунок гри ще не реалізований.

```text
.codex/agents/          спільні Researcher, Planner, Tester, Developers, Reviewer, Finalizer
.agents/skills/        discoverable skill для запуску флоу
frontend/              frontend ownership та loop.config.json
backend/               backend ownership та loop.config.json
packages/contracts/    спільний протокол під контролем root
packages/game-engine/  майбутній pure game engine
scripts/               Node runtime, PowerShell/Bash entrypoints, перевірки
docs/                  workflow, рішення та результати перевірок
```

Для перевірки сетапу потрібні Node 20+ і Git; зовнішніх залежностей немає:

```powershell
node scripts/check-setup.mjs
node --test scripts/tests/dev-loop.test.mjs
node scripts/dev-loop.mjs --help
```

Для роботи в цьому чаті: «Запусти луп для backend/frontend, задача …». Агенти користуються одним каталогом і знають обидві частини проєкту.

Для запуску з термінала з установленим Codex CLI:

```powershell
.\scripts\dev-loop.cmd run --scope backend --slice reconnect --goal "Implement the agreed reconnect slice"
```

Перед реальним запуском можна додати `--dry-run`. Для продовження: `prepare --scope backend --slice reconnect --resume` у поточному Codex або `run` із тими самими параметрами в терміналі.

Windows entrypoint `.cmd` не потребує зміни PowerShell ExecutionPolicy. Також доступні `dev-loop.ps1` для середовищ, де дозволені локальні скрипти, і `dev-loop.sh` для Bash.

[Повний протокол, handoff, resume та паралельність](docs/DEV_LOOP.md) · [Прийняті рішення](docs/DECISIONS.md) · [Перевірка сетапу](docs/SETUP_VALIDATION.md).

Product dev/build/deploy commands з'являться під час bootstrap застосунків. Їх відсутність зараз блокує `delivery` gates; `setup` gates перевіряють тільки луп. Скрипт не виконує commit/push/deploy автоматично.
