# Правила гри `bunker-party-v1`

Це нормативний переказ для продукту українською. Profile базується на «Бункер» 3.3. PDF видавця тимчасово недоступний як файл, тому до отримання валідних байтів пріоритет мають explicit requirements master prompt; невідомі деталі не домислюються. Повний inventory і precedence — у `RULES_TRACEABILITY.md`.

## Рівно чотири approved product rules

1. `APR-TIMERS-FOUR-OPTIONAL`: selection, speech, discussion і voting — незалежні optional timers, усі default off. Selection expiry відкриває рівно одну випадкову legal hidden card; speech завершує turn; discussion відкриває ballot; voting закриває ballot, а відсутні голоси стають `notCast`.
2. `APR-SMALL-GROUP-FILL-SIX`: за 3 людей кожен керує двома незалежними characters; за 4–5 увімкнений host-ом fill-to-six дозволяє FCFS claims до рівно шести; за 6+ усі мають по одному. Claims змінюють readiness і не створюють сьомого character.
3. `APR-PARTICIPANT-TIE-OVERTIME`: tie policy залежить від кількості людей на старті. Для 3–4 tie не виганяє нікого; для 5 це дозволено в першому раунді. Після п'ятого base round гра робить по одному overtime expulsion attempt, доки active count не дорівнює capacity.
4. `APR-SAME-ROOM-REMATCH`: після фіналу room переходить у `post-game`, зберігає settings і людей, скидає ready. Rematch має нові gameId, seed і deal; старі commands стають stale.

## Підготовка та роздача

Гра підтримує 3–15 людей і створює immutable seat order/start cohort. Capacity — `floor(characterCount / 2)`. Кожен character має власну руку: звичайні характеристики та приховану Особливу умову. На партію готується одна Катастрофа і п'ять пар Бункер+Загроза. Роздача унікальна й відтворювана за injected seed.

Можна поєднати 6–9 distinct character decks. Обов'язкова Професія або Суперсила. Кількість reveal на раунди: 6 decks — `1/1/1/1/1`; 7 — `2/1/1/1/1`; 8 — `2/2/1/1/1`; 9 — `2/2/2/1/1`.

## Раунди та вигнання

Є п'ять base rounds. У R1 character відкриває Професію; у R2–R5 controller обирає legal ordinary hidden card. Special Condition не є ordinary reveal. На початку нового раунду starter переходить clockwise до наступного active character; exiled пропускається. У кожному base round відкривається одна пара Бункер+Загроза; в overtime нових пар немає.

Офіційна таблиця кількості вигнань за раундами 1–5:

| Characters на старті |  R1 |  R2 |  R3 |  R4 |  R5 |
| -------------------: | --: | --: | --: | --: | --: |
|                    4 |   0 |   0 |   0 |   1 |   1 |
|                  5–6 |   0 |   0 |   1 |   1 |   1 |
|                  7–8 |   0 |   1 |   1 |   1 |   1 |
|                 9–10 |   0 |   1 |   1 |   1 |   2 |
|                11–12 |   0 |   1 |   1 |   2 |   2 |
|                13–14 |   0 |   1 |   2 |   2 |   2 |
|                   15 |   0 |   2 |   2 |   2 |   2 |

Schedule фіксується стартовим character count і не змінюється після disconnect.

## Голосування та нічия

Active і exiled characters мають окремі ballots; spectator не голосує. Vote можна змінювати до lock. `notCast` не додається до tally. Вигнаний більше не має ordinary reveal turn, але його ordinary cards стають public, Special лишається hidden, а vote і legal Special action зберігаються.

Якщо один кандидат має максимум — його виганяють. Дозволені малогрупові ties описані APR вище. Для 6+ tied characters отримують 60 секунд defense незалежно від optional timers, потім іде runoff лише між ними; повторна tie завершується seeded lot.

## Особливі умови

Карта грається один раз, тільки її controller-ом, у дозволений timing і з legal target. MVP підтримує schema-allowlist: swap card, random reveal, vote protection, double vote, force reveal, exchange characters. Невідомий effect не можна імпортувати чи активувати. Duplicate command не повторює effect.

## Фінал

У base mode salvation виграють survivors у межах capacity. Revival додатково вимагає життєздатної female/male reproductive pair; якщо її немає, мета провалена.

Survival Story послідовно показує subject cards і збирає utility votes. Карту визнають корисною при щонайменше половині поданих голосів; три корисні карти долають threat. Інакше injected RNG визначає consequence: гине пов'язаний profession character або знищується group; baggage загиблих зберігається групою. Bunker group проходить одну threat, exiled group — дві, потім survivors об'єднуються й проходять Catastrophe. Після цього застосовується salvation/revival goal і публікується стабільний список winners/losers.
