# Перевірка сетапу

Дата: 2026-09-05. Перевірено інфраструктуру розробки; ігровий застосунок ще не реалізований.

## Автоматичні перевірки

| Перевірка | Фактичний результат |
| --- | --- |
| `node scripts/check-setup.mjs` | exit 0: shared catalog, три scope configs, discoverable skill, синтаксис scripts |
| `node --test scripts/tests/dev-loop.test.mjs` | exit 0: 17 passed, 0 failed, 0 skipped |
| Skill Creator `quick_validate.py .agents/skills/bunker-mvp-delivery` | exit 0: Skill is valid |
| Python 3.11 `tomllib` для `.codex/**/*.toml` | 8 файлів успішно розібрані |
| `codex debug prompt-input` | exit 0; repo skill і root instructions присутні в model-visible input |
| `scripts/dev-loop.cmd --help` | exit 0 |
| Git Bash `scripts/dev-loop.sh --help` | exit 0 |

Поточний setup checker також вимагає exact project defaults `gpt-5.6-sol` і `medium` та забороняє model overrides у семи role TOML. Офіційна документація підтверджує цей model ID, `medium` effort і поля `[agents].default_subagent_model` / `default_subagent_reasoning_effort`.

Тести перевіряють: dry-run без побічних ефектів; збереження сторонніх файлів; повний цикл із реальним expected-red assertion; failed gates; timeout і відсутню команду; заборону змін acceptance tests; stale evidence; resume часткової реалізації та контракту; заборону пропускати фази; незалежність review від авторів; attribution contributors; серійні tooling changes; ізоляцію scope; блокування конкурентних запусків; відсутні product gates; читання завершеного стану після commit.

## Демо зі справжніми native subagents

Ізольований Git fixture: `.bunker-loop/live-demo/`, task `root/smoke`. Він перевіряє тільки синтетичну функцію порівняння game IDs і не додає game code у продукт.

1. Root підготував fixture, обмежений план, tooling/contract checkpoints. Початкова функція навмисно повертала `true` для будь-яких IDs.
2. `/root/demo_tester` створив два acceptance tests, не змінюючи source. Реальний запуск: exit 1, matching-ID test passed, differing-ID test failed з `ERR_ASSERTION`.
3. Root запустив gate: exit 1, луп залишився у review і не завершився.
4. `/root/demo_reviewer` незалежно підтвердив дефект `SMOKE-001`, P1, owner developer. Луп повернувся в implementation; review counter став 1.
5. Root виконав `node .bunker-loop/live-driver.mjs prepare --resume`: exit 0; фаза, finding і counter збережені.
6. `/root/demo_developer` змінив тільки `src/version.mjs`. Обидва незмінені acceptance tests пройшли, exit 0.
7. Root повторив gate; `/root/demo_reviewer` звірив source/test hashes і logs та повернув passing review без findings. Counter став 2.
8. `/root/demo_finalizer` записав тільки український звіт `docs/result.md`. Root знову запустив gate після документаційної зміни: exit 0.
9. Final handoff прийнято: `phase: done`, `blocked: null`, `findings: []`, gates passed.

Стан, короткі handoffs, driver і логи залишені в ignored `.bunker-loop/` для локального перегляду. Вони не входять до product history. Детерміністичні unit/integration fixtures використовують явно синтетичні agent IDs; наведені вище чотири виконавці були справжніми native subagents.

## Незалежний review інфраструктури

`/root/loop_test_design` та `/root/final_loop_review` виявили і допомогли перевірити виправлення: session lock, state reload під lock, відновлення заблокованого контракту, облік contract/tooling authors, заборона forward reopen, root frontend handoff, contributions і спільна класифікація tooling paths. Повторний `/root/final_loop_review` повернув `passed`, без remaining findings. Після додаткового виправлення читання completed status після commit всі 17 тестів повторно пройшли.

## Практичні межі

- Native interactive workflow перевірено наскрізно. Окрему вкладену TUI-сесію через `run` у цьому чаті не запускали; сам launcher, його CLI flags, dry-run та блокування другого запуску перевірені окремо.
- У поточному native spawn API немає параметра вибору TOML role або окремого sandbox. Role instructions передавалися явно; це не OS-level sandbox для read-only ролей. TOML catalog готовий для runtime, який підтримує custom-agent loading.
- Прямий `.ps1` запуск блокується локальною PowerShell ExecutionPolicy. Windows `.cmd` і прямий Node entrypoint працюють; системну ExecutionPolicy не змінювали.
- Delivery lint/typecheck/test/build, multiplayer E2E та rule audit потребують майбутнього bootstrap продукту. Вони не оголошуються зеленими за результатами setup tests.
- Автоматичні merge, commit, push і deploy не входять у runner. Worktrees та інтеграцією керує root; паралельні writers не тестувалися на реальних frontend/backend застосунках, бо їх ще немає.
