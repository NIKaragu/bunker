# Master prompt для Codex: Bunker Party Web MVP

## Роль і кінцевий результат

Ти — головний Codex-агент та оркестратор мультиагентної розробки. Побудуй з нуля стабільний, придатний для реальної вечірки web-MVP гри «Бункер». Основою є настільна гра «Бункер», редакція 3.3, але продукт має кілька явно затверджених нижче правил нашої компанії: налаштовувані таймери, добір додаткових персонажів для малої компанії, інша політика нічиїх з overtime та rematch у тій самій кімнаті. Застосунок замінює роздачу, ведучого, таймери, підрахунок голосів і фінальні перевірки. Не обмежуйся аналізом, планом або scaffold: створи документацію, реалізуй застосунок, напиши й запусти тести, перевір локальний production build і підготуй/виконай деплой настільки, наскільки дозволяють доступні облікові дані.

Ключовий пріоритет — надійна гра компанії завтра. Архітектура повинна дозволяти подальший розвиток, але не додавай інфраструктуру «на майбутнє», якщо для неї достатньо чіткого інтерфейсу або extension point.

Працюй автономно в межах цього завдання. Не перепитуй про рішення, уже зафіксовані нижче. Якщо виявиш справжній блокер, який істотно змінює продукт, безпеку чи вартість, коротко поясни його та постав одне конкретне запитання. В інших випадках прийми найпростішу обґрунтовану опцію, запиши її в `docs/DECISIONS.md` і продовжуй.

## Порядок пріоритетів

У разі суперечності застосовуй вимоги в такому порядку:

1. Явно затверджені правила нашої гри в цьому prompt.
2. Канонічні правила настільної гри «Бункер», редакція 3.3, з офіційного PDF видавця — для всього, що не перевизначено правилами нашої гри.
3. Безпека, приватність, цілісність прихованих карт і server-authoritative game state.
4. Стабільність P0-сценарію гри 3–15 людей з телефонів.
5. `docs/PRODUCT_SPEC.md`, `docs/GAME_RULES.md`, `docs/RULES_TRACEABILITY.md` і прийняті ADR/decisions.
6. Візуальний polish і майбутні extension points.

Default і єдиний активний profile MVP — `bunker-party-v1`, який наслідує 3.3 і перевизначає лише правила, явно перелічені в розділі «Затверджені правила нашої гри». Заборонені будь-які інші мовчазні спрощення або house rules. Кожне відхилення від 3.3 позначай як `approved-product-rule` у `docs/RULES_TRACEABILITY.md`; якщо вимога не є явним відхиленням, PDF 3.3 має перевагу. Майбутні альтернативні profiles мають бути відокремлені та вимкнені в MVP.

## Спочатку дослідження, потім реалізація

Перед кодом виконай короткий evidence-based research:

- візьми PDF правил «Бункер» 3.3 з офіційної сторінки видавця як канонічне джерело та зафіксуй checksum/date accessed;
- перевір кількість місць у бункері, склад колод, основні типи карт, логіку базових п'яти раундів, таблицю вигнань, офіційну нічию, Особливі умови та обидва варіанти фіналу;
- перевір одну або дві онлайн-реалізації, які підтримують кілька наборів карт;
- перевір актуальні офіційні документації вибраних версій Next.js, Express, Socket.IO, Vercel і Railway;
- використовуй первинні/офіційні джерела там, де вони існують;
- відділяй підтверджений факт від власного висновку;
- не копіюй великі масиви текстів карт, графіку, аудіо, брендинг або вихідний код сторонніх ігор;
- запиши використані джерела, дату доступу, ліцензійний статус і те, що саме було використано, у `docs/SOURCES.md`.

Відомі стартові джерела, які треба перевірити повторно під час виконання:

- офіційна сторінка видавця з посиланням на PDF правил 3.3: <https://economicusgame.com/bunker>;
- правила офіційної цифрової версії: <https://online.bunker-game.com/ru/rules>;
- онлайн-варіант і правила, з якого походить референс паків: <https://bunker-online.com/ru/rules>.

Цифрова версія є корисним UX-референсом, але не може скасувати правила 3.3 або затверджені правила нашої гри; зокрема її поточна відсутність Особливих умов не є дозволом вилучити їх із цього MVP. Не вважай публічну доступність тексту дозволом на його копіювання. Правила та факти можна стисло відтворити, але контент карт має бути оригінальним, наданим користувачем або явно ліцензованим для такого використання. Для fan packs не використовуй чужі логотипи, ілюстрації чи дослівні тексти. Якщо назва належить відомій франшизі, познач пак як неофіційний fan pack і тримай його контент оригінальним.

## Зафіксований scope MVP

### У scope

- anonymous session без реєстрації та бази даних;
- публічні кімнати зі списком і кількістю гравців;
- створення, приєднання, вихід і закриття кімнати;
- профіль: nickname, мова, DiceBear-аватар, локальне завантаження власного аватара;
- українська й англійська локалізація UI та стандартних карт окремо для кожного клієнта;
- 3–15 людей у кімнаті; за 3 людей кожен керує двома персонажами, за 4–5 кімната може first-come-first-served добрати додаткових персонажів до шести, за 6+ кожен керує одним;
- lobby, readiness, host controls і автоматичний старт;
- повний цикл: роздача, п'ять базових раундів, потрібні overtime-раунди, дослідження бункера, відкриття характеристик, окремо налаштовувані таймери вибору карти/виступу/обговорення/голосування, офіційна таблиця вигнань, custom tie policy, Особливі умови та фінал;
- post-game lobby і необмежені rematches у тій самій кімнаті після повторної готовності всіх participants;
- приєднання до lobby як гравець, а після старту партії — лише як spectator;
- reconnect протягом 60 секунд через opaque session token;
- кілька паків в одній грі;
- створення, редагування, дублювання, видалення, валідація, імпорт та експорт custom packs;
- mobile-first UI, придатний для 15 людей;
- локальні й production builds;
- Vercel для frontend та Railway для одного backend instance;
- automated tests і ручний smoke checklist.

### Поза scope, але з extension points

- реєстрація, постійні акаунти та глобальна унікальність nickname;
- PostgreSQL/Redis або інша постійна серверна БД;
- кілька backend replicas;
- приватні кімнати, паролі та invite links;
- текстовий, голосовий і відеочат;
- AI-гравці;
- matchmaking, рейтинг, історія ігор, achievements;
- push notifications;
- модераційна панель.

Архітектура повинна дозволяти додати ці речі без переписування core game engine. Не реалізовуй їх зараз.

## Технологічні обмеження

Створи pnpm monorepo. Використай Turborepo лише якщо він реально спрощує запуск, кешування та CI; не додавай зайвий orchestration layer без користі.

Базова структура:

```text
apps/
  web/                 # Next.js, TypeScript, mobile-first UI
  server/              # Express, TypeScript, Socket.IO
packages/
  contracts/           # shared schemas, event payloads, error codes
  game-engine/         # pure deterministic domain logic/state machine
  config/              # shared validated configuration where useful
  test-utils/          # shared fixtures/builders only when duplication appears
docs/
scripts/
.codex/
  agents/
.agents/
  skills/
```

Вимоги до стеку:

- Next.js + TypeScript;
- Express + TypeScript;
- Socket.IO client/server для realtime;
- Zustand тільки для client/UI state; серверний game state не дублювати як незалежну істину;
- runtime validation усіх HTTP/Socket.IO inputs і custom pack JSON за допомогою Zod або еквівалентної schema-first бібліотеки;
- Vitest для unit/integration tests;
- React Testing Library для важливих UI-компонентів;
- Playwright з кількома browser contexts для критичних multiplayer E2E;
- ESLint, Prettier та strict TypeScript;
- ніякого production `any` без вузького задокументованого обґрунтування.

Перед встановленням зафіксуй актуальні сумісні stable versions з офіційних джерел. Не використовуй beta/canary. Commit lockfile.

### SSR/SSG і routing

Використовуй SSR/SSG лише там, де це корисно:

- landing/rules/help можуть бути статичними;
- lobby та game screen є realtime client flows і не повинні штучно ускладнюватися заради SSR;
- маршрути мають бути простими: старт/кімнати, профіль і custom packs, `/room/[roomId]`;
- пряме відкриття або refresh room URL повинно відновити сесію, якщо token ще валідний.

## Архітектурні принципи

### Server authoritative

Сервер є єдиним джерелом істини для:

- кімнат, місць і ролей;
- статусу readiness;
- складу та порядку кандидатів;
- роздачі карт;
- прихованих і відкритих карт;
- фаз гри й переходів state machine;
- окремих optional deadlines для вибору карти, виступу, обговорення та голосування;
- голосів та результатів;
- Особливих умов, загроз і фінальних перевірок;
- host transfer;
- reconnect grace period і TTL cleanup.

Клієнт надсилає intent, а не готовий новий state. Сервер валідовує actor, room, current phase, version і payload, атомарно застосовує команду й повертає typed acknowledgement.

Ніколи не надсилай клієнту приховані карти інших гравців — ані в snapshot, ані в logs, ані в error payload. Побудуй viewer-specific projection/sanitization і окремо протестуй витік секретної інформації.

### Pure game engine

`packages/game-engine` не залежить від Express, Socket.IO, React або storage. Він містить:

- domain types;
- commands/events або еквівалентну явну модель переходів;
- state machine;
- ruleset configuration;
- base/overtime round schedule, character-claim rules, turn order, expulsion table, participant-count-dependent tie resolution, Special Conditions, threats і victory calculations;
- injected clock і seeded/injected random source;
- deterministic tests.

Не розкидай правила між socket handlers і React components.

### Storage abstraction

Реалізуй `RoomRepository`, `SessionRepository` і потрібні clock/scheduler interfaces з in-memory adapters. У MVP:

- один backend process/instance;
- ніяких server filesystem JSON-файлів;
- весь server state губиться після restart/deploy — це прийнято;
- автоматичне TTL-очищення неактивних sessions і порожніх кімнат;
- завершена гра не запускає TTL видалення непорожньої кімнати: вона переходить у `post-game` і може почати rematch;
- cleanup timers не повинні протікати після видалення кімнати;
- інтерфейси мають дозволити майбутній Redis adapter без зміни game engine.

Задокументуй limitation одного instance. Не вмикай autoscaling/multiple replicas на Railway для цього MVP.

### Realtime protocol

Створи versioned protocol і задокументуй його в `docs/REALTIME_PROTOCOL.md`:

- client commands;
- server events;
- acknowledgement envelope;
- stable machine-readable error codes;
- authorization rules для кожної команди;
- state/version або sequence number для захисту від stale/replayed intents;
- reconnect/resync flow;
- compatibility/version mismatch behavior.

Не покладайся на client timers. Кожен із чотирьох optional timers має окремий server timestamp і може бути `null`. Expiry вибору карти відкриває рівно одну випадкову legal hidden card через injected RNG; expiry виступу завершує поточний turn; expiry обговорення відкриває ballot; expiry голосування закриває ballot, а неподані бюлетені позначає `notCast` і не додає до tally. Усі transitions, random reveal, character claims і ефекти Особливих умов мають бути server-authoritative та idempotent при duplicate/race intents.

## Ідентичність, профіль і lifecycle

- Реєстрації немає.
- При першому вході сервер видає `sessionId` і криптографічно непрогнозований `sessionToken`.
- Token зберігається локально та ніколи не broadcast-иться іншим клієнтам.
- Nickname унікальний серед активних і disconnected-within-grace sessions. Порівняння case-insensitive після нормалізації та trim.
- Nickname, locale й avatar preference зберігаються в `localStorage`.
- Власний avatar стискається в браузері до безпечного WebP/PNG з обмеженням dimensions і bytes. Локальна копія зберігається в `localStorage` лише якщо не перевищує quota; помилки quota обробляються.
- Для показу іншим активна room/session може містити лише тимчасову стиснену копію avatar, яка видаляється разом із session. Сервер повторно перевіряє MIME/signature/size і не довіряє client metadata.
- Default avatar генерується детерміновано з nickname через DiceBear локальною бібліотекою або іншим auditable identicon generator, без обов'язкового зовнішнього runtime request.
- Socket disconnect запускає 60-second grace period. `beforeunload` не є джерелом істини.
- Reconnect з валідним token до завершення grace повертає ту саму роль, hand і seat.
- Після grace nickname звільняється, token стає невалідним, а персональні дані видаляються.

Поведінка після grace:

- у lobby або `post-game` participant повністю видаляється, його extra claim звільняється, а readiness решти скидається;
- під час гри session/profile/token видаляються, але її один або два ігрові персонажі не зникають, не стають автоматично вигнаними й не змінюють офіційну таблицю;
- персонажі отримують анонімний tombstone замість nickname/avatar і передаються під керування host або наступного connected participant за seat order; новий controller бачить їхні приховані карти та виконує їхні окремі ходи, голоси й Особливі умови;
- передача control є лише механізмом безперервності цифрової сесії: вона не об'єднує персонажів, не додає й не забирає голоси та не змінює результат гри;
- якщо це був host, технічна host role переходить наступному connected participant за seat order; spectator може отримати лише технічні host controls, якщо жодного participant не лишилося, але не право голосу чи доступ до прихованих карт;
- якщо disconnected controller був у фазі виступу, після grace керування персонажем переходить заміні, а фаза продовжується без автоматичного reveal або forfeiture;
- якщо connected sessions не залишилося, room cleanup відбувається за загальним TTL.

## Кімнати й lobby

- Усі кімнати MVP публічні й показуються у live list.
- Room model уже має `visibility: "public" | "private"`, але UI та private access control поки не реалізовуй.
- Користувач може бути тільки в одній кімнаті.
- Creator стає host.
- Host може змінювати назву, `maxPlayers` від 3 до 15, selected packs, goal (`salvation` або `revival`), final mode (`base` або `survival-story`), прапорець `fillToSixCharacters` і чотири timers до першої гри та між rematches.
- `cardSelectionSeconds`, `speechSeconds`, `discussionSeconds` і `votingSeconds` налаштовуються незалежно. Default кожного — `null` (`off`). UI дозволяє off і validated seconds у централізованому безпечному діапазоні; зміна одного timer-а не змінює інші.
- UI рекомендує `salvation` до 7 персонажів і `revival` для 8+, як rulebook, але показує це саме як рекомендацію.
- Валідуй довжину/символи room name і nickname.
- Participants мають ready toggle. Будь-яка зміна game-affecting setting, roster або extra-character claims скидає readiness усіх із чітким UI feedback.
- Гра або rematch стартує автоматично, коли є щонайменше 3 participants, усі connected participants ready, немає sessions у disconnect grace, а character roster валідний. Host не має окремої кнопки, яка обходить readiness.
- `maxPlayers` — ліміт людей-participants, а не персонажів. Spectators не займають participant slots.
- За 3 participants кожен автоматично отримує рівно одного додаткового персонажа: 2 на controller, 6 загалом.
- За 4–5 participants і `fillToSixCharacters = false` кожен має рівно одного персонажа.
- За 4–5 participants і `fillToSixCharacters = true` lobby не стартує, доки participants добровільно не заберуть extra-character slots до загальних 6 персонажів. Кожен controller може мати максимум одного додаткового персонажа; для 4 людей доступні 2 slots, для 5 — 1.
- Extra-character claim — кнопка/intention `claim-extra-character`, а не погодження між гравцями. Хто першим отримав server acknowledgement, той володіє slot. Сервер серіалізує claims у межах room та атомарно перевіряє актуальну кількість participants, flag, quota, controller limit й idempotency key; перші допустимі requests заповнюють quota, решта отримують `EXTRA_CHARACTER_UNAVAILABLE`. Simultaneous requests не можуть створити сьомого персонажа або дати одному controller-у два extras.
- У MVP немає in-app обговорення або vote щодо extra slot: UI лише показує загальну quota/власний claim, а результат визначає порядок прийнятих сервером intents. Заклади transport-neutral extension point для майбутнього text/voice chat, не пов'язуючи chat availability із claim algorithm.
- До старту або rematch controller може виконати `release-extra-character`; після підтвердження slot знову доступний. Після завершення disconnect grace claim видаленого lobby participant звільняється. Claim/release і зміна roster скидають readiness.
- Forced extras для 3 participants і добровільні claims для 4–5 існують лише в lobby allocation, до роздачі карт. При переході roster `3 -> 4/5` forced allocation очищується й, якщо flag увімкнений, відкривається claim quota; при `4/5 -> 3` усі claims очищуються й кожному автоматично призначається extra. Зміна flag також атомарно очищує несумісні claims.
- За 6+ participants діють стандартні правила: рівно один персонаж на controller. Якщо до старту кількість людей зросла з 4–5 до 6+, сервер атомарно прибирає всі extra claims, повідомляє клієнтів і скидає readiness; якщо впала до 4–5, знову застосовує актуальний `fillToSixCharacters`.
- `characterCount` і bunker capacity фіксуються на старті кожної окремої гри; tie policy натомість використовує `humanParticipantCountAtGameStart`.
- Після старту нова session може приєднатися лише як spectator. Вона не отримує персонажа й не може активуватися в наступному раунді.
- Host може закрити кімнату з confirmation. Усі отримують фінальну подію та повертаються до room list.
- Коли остання session залишає кімнату і її grace period завершився, кімната видаляється.
- Після природного завершення сервер зберігає фінальний snapshot як `lastGameSummary`, переводить room у `post-game`, скидає readiness усіх participants і лишає sessions у кімнаті. Room видаляється тільки після явного закриття host-ом або коли всі sessions вийшли й завершилися їхні grace periods.
- Явно моделюй room lifecycle `lobby -> in-game -> post-game -> in-game`; `closed` і empty-room deletion є terminal cleanup paths. Room browser показує поточний status без витоку прихованих game data.
- У `post-game` participants можуть переглянути останній результат, змінити дозволені lobby settings/паки, звільнити або забрати extra-character slot і знову позначити готовність. Spectators не блокують rematch readiness і можуть перейти в participant, якщо є місце.
- Коли всі connected participants знову ready, roster валідний і extra-character quota виконана, сервер автоматично створює новий `gameId`, повністю скидає попередній game state/ролі вигнаних, робить новий shuffle/deal і починає rematch. `roomId`, host, room settings і room-scoped pack snapshot зберігаються; попередні commands із старим `gameId` відхиляються як stale.

Для захисту одного процесу додай configurable, задокументовані operational limits: кількість rooms, spectators per room, payload size, custom pack size, command rate. Це не продуктові обмеження й не повинно заважати грі 3–15 друзів.

## Правила гри: 3.3 + затверджені правила нашої гри

### Rules contract

`bunker-party-v1` є єдиним активним rules profile MVP. `docs/GAME_RULES.md` має викласти правила українською, а `docs/RULES_TRACEABILITY.md` — зв'язати кожне правило з джерелом, domain transition і тестами. Для канонічних правил джерелом є конкретна сторінка/секція офіційного PDF; для явних змін нижче — `approved-product-rule` з посиланням на цей prompt. Якщо переказ правила 3.3 і PDF розходяться, PDF має перевагу, крім прямо позначених custom overrides.

Застосунок має відтворювати повну механіку 3.3, крім затверджених overrides: optional timers, character fill-to-six, tie/overtime і rematch lifecycle. Інші platform features — reconnect, spectator, i18n, аватари й host transfer — не можуть самовільно змінювати кількість персонажів/голосів, доступну інформацію або ігровий результат.

### Затверджені правила нашої гри

Ці правила мають перевагу над PDF 3.3 і не вважаються дефектами відповідності:

- усі чотири phase timers налаштовуються окремо й за замовчуванням вимкнені;
- за 3 людей завжди 6 персонажів; за 4–5 optional extra characters добровільно й атомарно добираються до 6; за 6+ — один персонаж на людину;
- tie policy залежить від кількості людей, а дозволена нічия не виганяє нікого й породжує overtime до потрібної місткості;
- після фіналу room не видаляється: ті самі люди можуть зіграти rematch після повторної готовності.

### Підготовка та ролі

- До бункера потрапляє половина персонажів; `bunkerCapacity = floor(characterCount / 2)`.
- За 3 людей кожен participant керує двома незалежними персонажами, разом 6; використовується колонка для 6 персонажів і 3 місця в бункері.
- За 4–5 людей character count дорівнює кількості людей, якщо `fillToSixCharacters` вимкнено, або рівно 6 після завершення добровільних extra claims, якщо його ввімкнено.
- За 6–15 людей кожен participant керує одним незалежним персонажем.
- Кожен персонаж отримує по одній карті з шести character decks: `Profession`, `Biology`, `Health`, `Hobby`, `Baggage`, `Fact`, а також одну `SpecialCondition`.
- Із шести звичайних характеристик за п'ять раундів відкриваються п'ять; одна залишається прихованою до фіналу.
- Відкрий одну випадкову `Catastrophe` як спільний контекст.
- Сформуй п'ять закритих пар `Bunker` + `Threat`; у кожному раунді його перший active character обирає та відкриває будь-яку ще закриту пару.
- Для класичного набору 3.3 reference composition: 50 Profession, 32 Biology, 32 Health, 32 Hobby, 32 Baggage, 50 Fact, 32 Special Condition, 20 Catastrophes на 10 двосторонніх картах, 21 Threat і 30 Bunker; загалом 321 карта. Dataset validation має розрізняти фізичні двосторонні карти й цифрові catastrophe faces.
- Перший active character у першому раунді — персонаж controller-а, який роздавав/створив гру. На початку кожного наступного раунду старт переходить за годинниковою стрілкою до наступного невигнаного персонажа після стартера попереднього раунду.

### Базові та overtime-раунди

Перші п'ять базових раундів мають server-authoritative фази `explore-bunker -> reveal-turns -> scheduled-expulsions -> round-end`. Після п'ятого раунду engine переходить у `final`, якщо кількість невигнаних персонажів не перевищує актуальну місткість бункера; якщо перевищує — запускає `overtime`.

- На початку раунду перший active character обирає й відкриває рівно одну будь-яку з п'яти ще закритих пар `Bunker` + `Threat`.
- У першому раунді кожен невигнаний персонаж зобов'язаний відкрити `Profession`.
- У раундах 2–5 кожен невигнаний персонаж сам обирає одну зі своїх ще прихованих звичайних характеристик.
- Перед reveal діє `cardSelectionSeconds`, якщо він увімкнений. Після expiry сервер рівно один раз випадково відкриває legal hidden ordinary card; у round 1 єдиною legal card є `Profession`. Якщо timer вимкнений, deadline немає.
- Після reveal починається виступ. `speechSeconds`, якщо ввімкнений, автоматично завершує виступ; якщо вимкнений, controller натискає «Завершити хід». Інші гравці можуть коментувати, не перебиваючи активного.
- Вигнаний персонаж більше не отримує reveal-turn і не відкриває нових характеристик, але його controller залишається учасником обговорень/голосувань і може застосовувати Особливу умову.
- Коли всі невигнані персонажі завершили reveal-turns, виконай стільки окремих expulsion attempts, скільки вказано для цього раунду й стартової кількості персонажів. Дозволена нічия рахується завершеним attempt, але нікого не виганяє.

Overtime rules:

- Кожен overtime-раунд має один reveal/speech circle і один expulsion attempt.
- Нові `Bunker`/`Threat` pairs в overtime не відкриваються: п'ять пар і extended final залишаються сумісними з 3.3.
- Якщо у невигнаного персонажа ще є hidden ordinary card, він відкриває одну за звичайними selection/speech rules. Якщо hidden cards уже немає, controller все одно отримує speech turn без selection phase.
- Якщо attempt завершується дозволеною нічиєю, створюється наступний overtime-раунд. Інакше вигнаний персонаж обробляється звичайно.
- Overtime триває без жорсткого ліміту, доки `activeCharacterCount > bunkerCapacity`; після досягнення capacity запускається final. Якщо legal Special Condition створила рідкісний стан `activeCharacterCount < bunkerCapacity`, final запускається з усіма remaining characters; не додавай вигаданих персонажів. Якщо effect змінив capacity, використовуй її актуальне значення.

### Офіційна таблиця вигнань

Таблиця визначається `characterCount` на старті кожної гри: 3 людини завжди використовують колонку 6; 4–5 із completed fill-to-six також використовують колонку 6; інакше використовуй фактичну кількість персонажів. Таблиця задає expulsion attempts у п'яти базових раундах, але дозволена custom-нічия може вимагати overtime.

| Персонажів | Раунд 1 | Раунд 2 | Раунд 3 | Раунд 4 | Раунд 5 | Вигнаних загалом | Місць у бункері |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 0 | 0 | 0 | 1 | 1 | 2 | 2 |
| 5 | 0 | 0 | 1 | 1 | 1 | 3 | 2 |
| 6 | 0 | 0 | 1 | 1 | 1 | 3 | 3 |
| 7 | 0 | 1 | 1 | 1 | 1 | 4 | 3 |
| 8 | 0 | 1 | 1 | 1 | 1 | 4 | 4 |
| 9 | 0 | 1 | 1 | 1 | 2 | 5 | 4 |
| 10 | 0 | 1 | 1 | 1 | 2 | 5 | 5 |
| 11 | 0 | 1 | 1 | 2 | 2 | 6 | 5 |
| 12 | 0 | 1 | 1 | 2 | 2 | 6 | 6 |
| 13 | 0 | 1 | 2 | 2 | 2 | 7 | 6 |
| 14 | 0 | 1 | 2 | 2 | 2 | 7 | 7 |
| 15 | 0 | 2 | 2 | 2 | 2 | 8 | 7 |

Не завершуй партію раніше п'ятого базового раунду. Після round 5 перевір capacity та за потреби запускай overtime. Disconnect, reconnect, spectator або host transfer не перераховують таблицю, character count чи tie-policy cohort.

### Обговорення, голосування, нічия та вигнання

- Перед кожним expulsion attempt усі controllers, включно з controllers уже вигнаних персонажів, обговорюють кандидатів. Якщо `discussionSeconds` увімкнений, expiry відкриває ballot; якщо вимкнений, discussion безстрокове й host запускає ballot окремою підтвердженою командою.
- Голосують одночасно всі персонажі, включно з уже вигнаними; у варіанті на 3 людей controller подає окремий голос за кожного зі своїх двох персонажів. Ціллю може бути лише невигнаний персонаж.
- Окремої опції `abstain` немає. Ballot прихований від інших до reveal, його можна змінити до lock; live tally не показується.
- Якщо `votingSeconds` вимкнений, ballot завершується після lock усіх eligible бюлетенів. Якщо ввімкнений, він також завершується за deadline; неподані бюлетені стають `notCast`, не отримують випадкового target і не додаються до tally. Якщо жодного vote не подано, усі eligible targets вважаються tied для наступного tie-policy transition.
- Після завершення ballot голоси розкриваються у визначеному seat order; controller кожного персонажа, який подав vote, коротко пояснює рішення. Один унікальний лідер стає вигнаним.

Tie policy використовує незмінний `humanParticipantCountAtGameStart`, а не character count:

- Для 3–4 людей будь-яка нічия за найбільшою кількістю голосів дозволена: expulsion attempt завершується без вигнання. Після п'ятого базового раунду нестача вигнань компенсується overtime-раундами; нічия в overtime знову створює наступний overtime.
- Для рівно 5 людей нічия без вигнання дозволена лише в ігровому round 1. Її не можна «перенести» на перше фактичне голосування: за стандартною таблицею в round 1 немає vote, тому всі звичайні голосування rounds 2+ мусять визначити вигнаного. Якщо Особлива умова законно створює vote у round 1, для нього нічия може завершитися без вигнання.
- Для 6+ людей і для всіх обов'язкових голосувань у грі на 5 людей діє standard 3.3 tie resolution: tied leaders проводять спільний 60-секундний захист-батл, усі eligible voters переголосовують лише між ними, а повторна нічия завершується server-side жеребом між їхніми `Profession` через injected RNG.
- 60 секунд захист-батлу є окремим canonical tie deadline; за наявності загального `discussionSeconds` він не підміняється ним. Якщо product owner пізніше захоче налаштовувати і цей timer, це окреме spec change.
- Якщо таблиця вимагає два attempts в одному базовому раунді, повністю проведи другий цикл discussion -> ballot -> reveal -> tie policy серед оновленого складу; дозволена нічия не скасовує наступний запланований attempt.
- Вигнаний персонаж негайно відкриває всі свої звичайні character cards, але не `SpecialCondition`. Він не перетворюється на spectator: не отримує наступних reveal-turns, проте залишається в грі, бере участь у подальших обговореннях і голосуваннях та може зіграти Особливу умову.
- Spectator — окрема web-role без персонажа: бачить лише дозволену публічну інформацію, не голосує, не виступає від імені персонажа й не бачить прихованих карт.

### Особливі умови

- `SpecialCondition` є обов'язковою частиною `bunker-party-v1`, а не future extension.
- Її можна застосувати в будь-який дозволений текстом карти момент, зокрема після вигнання; вона відкривається лише під час застосування або у передбачений самою картою момент.
- Реалізуй typed, data-driven effect model, timing windows, legal-target validation, idempotency та audit log. Socket handler або UI не мають містити hardcoded gameplay exceptions.
- Якщо ефект змінює карти, голоси, місця чи стан персонажа, він атомарно проходить через game engine до визначення результату відповідної фази.
- Кожна підтримана карта повинна мати тест допустимого застосування, забороненого timing/target і повторного intent. Непідтриману карту не можна мовчки включити до selectable built-in pack.

### Фінал, режим і мета

- Після п'ятого базового раунду та всіх необхідних overtime-раундів усі невигнані персонажі, кількість яких зазвичай дорівнює capacity й ніколи її не перевищує, потрапляють у бункер і відкривають/коментують усі ordinary characteristics, що ще лишилися прихованими; після overtime їх може не залишитися. `SpecialCondition` відкривається лише якщо її текст цього вимагає або controller вирішив застосувати її за правилами.
- До старту host вибирає final mode: `base` або `survival-story`. У `base` партія завершується коротким підсумком після визначення складу бункера.
- Goal обирає host до старту: `salvation` або `revival`; rulebook рекомендує `salvation` до 7 персонажів включно, а `revival` для 8+. У `revival` серед фінальної групи має бути різностатева пара, здатна продовжити рід; сумніви через вік або інші характеристики вирішуються дискусією, голосуванням або кидком монети.

У `survival-story` реалізуй повний офіційний extended final:

1. Перемішай п'ять Threat, відкритих у раундах, і випадково обери одну для групи бункера. Вона може використовувати всі свої character cards і доступні Bunker cards.
2. Якщо щонайменше три карти персонажів або доступні Bunker cards визнані корисними проти цієї Threat, група долає її без наслідків.
3. Якщо трьох немає, змішай по одній `Profession` кожного члена групи з картою Threat і випадково відкрий одну: Profession означає загибель відповідного персонажа, усі його карти скидаються, крім `Baggage`, що лишається групі; Threat означає загибель усієї групи.
4. У спірних випадках корисність конкретної карти визначає швидке одночасне thumbs vote всіх controllers, включно з controllers персонажів у бункері, вигнаних і вже загиблих; щонайменше половина голосів `useful` робить карту корисною.
5. Група вигнаних окремо відкриває дві випадкові додаткові Threat із решти колоди й для кожної послідовно повторює кроки 2–3 без Bunker cards.
6. Після Threat усі персонажі, що вижили в обох групах, разом протистоять Catastrophe, повторюючи ту саму перевірку трьох корисних карт і процедуру наслідків із Catastrophe card. Для `salvation` перемагають усі, хто пережив фінал, включно з вигнаними; для `revival` усі survivors перемагають лише якщо в їхній спільній групі є придатна пара.

Усі випадкові вибори виконуються лише сервером через injected RNG і мають відтворюватися в domain tests.

### Приєднання після старту

Новий користувач після старту може приєднатися тільки як `spectator`. Додавання нового персонажа між раундами, доздача hand або зміна `characterCount`, capacity чи expulsion schedule заборонені в `bunker-party-v1`. Після переходу room у `post-game` такий користувач може зайняти participant slot до наступного rematch.

## Паки карт

### Built-in catalog

Базовий content pack завжди вибраний і не може бути вимкнений:

- General / Загальний (`bunker-party-v1` rules profile і шість канонічних character categories 3.3).

Додаткові паки з референсу:

- Extended / Розширений;
- Fantasy / Фентезі;
- Kids / Дитячий;
- Harry Potter — unofficial fan pack;
- Fallout — unofficial fan pack;
- Ancient World / Стародавній світ;
- 18+;
- The Lord of the Rings — unofficial fan pack;
- S.T.A.L.K.E.R. — unofficial fan pack;
- Jurassic World — unofficial fan pack;
- Pirates of the Caribbean — unofficial fan pack.

Тематичні паки зі screenshot змінюють лише card pools/content, а не правила. Усі selected pack entries одного типу об'єднуються в спільний pool; вибір рівномірний між картами, без дублювання однієї card ID у межах роздачі. Збережи `sourcePackId` для provenance/debugging. Не називай сторонній онлайн-каталог офіційним.

Офіційні самостійні видання `Bunker 3.3`, `Bunker-B` і `Generation Alpha` моделюй окремо від тематичних add-ons. Їх поєднання має відтворювати правило сумісності видань із rulebook:

- повний combined mode використовує дев'ять character decks; персонаж отримує дев'ять характеристик, а в перших трьох раундах відкриває по дві, причому в першому раунді серед відкритих обов'язково є `Profession` і `Superpower`;
- дозволено вибрати 6, 7 або 8 із дев'яти колод, але серед них мусить бути `Profession` або `Superpower`; за 7 колод у першому раунді відкривають дві характеристики, за 8 — у перших двох, а за 9 — у перших трьох;
- партія має п'ять базових раундів і ту саму expulsion table; custom overtime після дозволених нічиїх не додає нових Bunker/Threat pairs;
- якщо точна назва/порядок однієї з дев'яти колод у перевіреному PDF відрізняється від припущення, `GAME_RULES` і code schema мають буквально повторити PDF до реалізації content import.

MVP P0 мусить повністю підтримувати `bunker-party-v1` з шістьма колодами. Combined-editions mode входить у scope лише якщо присутні законно доступні datasets усіх обраних видань; UI не показує режим, який не можна коректно роздати. Архітектура й rules config однаково підтримують 6–9 character decks, п'ять базових раундів та optional overtime.

General повинен бути самодостатнім для гри 15 персонажів без повтору required character cards та містити достатні `SpecialCondition`, `Catastrophe`, `Bunker` і `Threat` pools для повної партії. Add-on packs завжди працюють разом із General, тому можуть бути меншими, але повинні пройти централізовану content validation. Не показуй selectable pack, якщо його dataset порожній або невалідний.

Для першого playable build:

- General має повний оригінальний bilingual набір;
- кожен показаний add-on має валідний мінімальний оригінальний bilingual набір, достатній, щоб тема реально з'являлася у змішаному pool;
- exact validation counts і правила двосторонніх Catastrophe зберігай як named constants і поясни в `docs/GAME_RULES.md`;
- 18+ має явний warning/confirmation при виборі;
- fan packs не містять copied card text, logos або сторонніх зображень.

### Custom packs

- Створюються й редагуються тільки в браузері.
- Зберігаються в versioned `localStorage` schema.
- Підтримують create/edit/duplicate/delete та import/export JSON.
- При room creation повний selected custom pack передається серверу, повторно валідується та живе лише разом із room.
- JSON містить `schemaVersion`, `rulesProfileId`, stable pack/card IDs, metadata, card type, localized fields, typed Special Condition effect/timing за потреби, optional details і provenance.
- Кожна custom card повинна мати хоча б одну локаль `uk` або `en`; відсутня локаль використовує чіткий fallback на наявну.
- Картки можна редагувати до старту гри; зміни не мутують уже створену room snapshot.
- Custom pack за замовчуванням є add-on і використовується лише разом із сумісним validated base pack.
- Add-on pack повинен містити щонайменше по одній карті кожного required type свого `rulesProfileId`; standalone pack — достатньо унікальних карт кожного type для обраного `characterCount`, одну Catastrophe, п'ять Bunker, щонайменше сім Threat для повного `survival-story` і по Special Condition на персонажа без заборонених повторів. Exact minima визначаються pure validator-ом із rules profile, а не UI-константами.
- Редактор показує coverage по кожній canonical category, сумісність із classic/combined profile та точні помилки нестачі. Custom pack не може додати неузгоджену category або effect, якого не підтримує `bunker-party-v1`.
- Обмеж field lengths, card count, total JSON bytes і image/HTML absence.
- Не використовуй `dangerouslySetInnerHTML`; текст карт рендериться як plain text.
- Import error показує точний шлях і причину, не падає весь застосунок і не перезаписує стару валідну версію.

## UI/UX

### Загальний напрям

- Mobile first, потім tablet/desktop.
- Постапокаліптичний bunker/control-panel vibe: темне тло, приглушений метал, amber/red status accents, але без втрати читабельності.
- Не перевантажуй екран декоративними рамками, grain і glow.
- Кольори, spacing, radii, typography, shadows, motion і major component sizes винеси в CSS variables/design tokens.
- Touch targets не менше 44×44 px.
- Підтримай safe-area insets, reduced motion, keyboard navigation, focus states і достатній contrast.
- Не роби literal circle з 15 дрібних карток на телефоні. На mobile використовуй компактний ordered strip/grid/list з current-player focus; на desktop можна використати spatial table layout.
- При натисканні на будь-яку доступну карту відкривається читабельний detail sheet/modal.

### Обов'язкові екрани/стани

- Login/onboarding з nickname, locale й preview default avatar.
- Room browser з live player counts, empty/loading/error/reconnecting states.
- Profile editor.
- Custom pack list/editor/import/export.
- Create room panel із чотирма independent timer controls (`off` by default), `fillToSixCharacters`, goal/final mode і pack selection.
- Lobby з settings, selected packs, seats, host, ready/disconnected status, character count, remaining extra slots і `claim/release extra character` controls.
- Game screen з catastrophe/bunker context, turn order, own hand, revealed cards інших, timer, current phase і primary action.
- Для будь-якого controller із extra character — явний перемикач між двома власними незалежними персонажами та окремі стани turn/vote для кожного.
- Voting UI з прихованим ballot, lock/reveal, defense runoff і server-random tie result.
- Окремі режими `exiled` і `spectator`: exiled продовжує обговорення/голосування й Особливі умови, spectator лише дивиться.
- Final screen для `base` та повний guided `survival-story`: utility thumbs votes, Threat resolution, Catastrophe і перевірка `salvation`/`revival`.
- Post-game/rematch screen з останнім результатом, readiness, актуальним roster/extra-character quota і переходом у нову гру без виходу з room.
- Connection lost/reconnecting/reconnected/session expired states.

Rules icon доступний завжди після входу. Він відкриває локальну translucent modal/sheet зі стислими, але достатніми правилами `bunker-party-v1`: база 3.3, чотири optional timers, fill-to-six, participant-based tie policy, overtime, права вигнаних, Особливі умови, фінал і rematch. Відкриття/закриття rules — суто локальний UI state: жодної socket-команди, pause або впливу на game state/timer.

## Безпека та надійність

- Treat every client payload as untrusted.
- Validate й normalize nickname, room name, IDs, locale, avatar bytes і pack JSON.
- Rate-limit session creation, room commands і oversized/repeated socket payloads.
- Configure exact CORS origins через environment variables; ніякого permissive `*` з credentials.
- Session tokens не логувати.
- Structured logs містять room/session correlation IDs, event names і safe error codes, але не hidden card content.
- Gracefully handle SIGTERM/SIGINT на Railway; прийнято, що active rooms при restart губляться.
- Додай `/health/live` і `/health/ready`.
- Client має зрозуміло показувати backend unavailable/version mismatch.
- Ніяких secrets у repo; створи `.env.example` і environment documentation.
- Dependency audit не повинен автоматично робити unsafe major upgrades.

## Обов'язкова документація та конфігурація Codex

До основної імплементації створи й підтримуй актуальними:

```text
README.md
AGENTS.md
docs/PRODUCT_SPEC.md
docs/GAME_RULES.md
docs/RULES_TRACEABILITY.md
docs/ARCHITECTURE.md
docs/REALTIME_PROTOCOL.md
docs/DELIVERY_PLAN.md
docs/TEST_STRATEGY.md
docs/SECURITY_AND_OPERATIONS.md
docs/DECISIONS.md
docs/SOURCES.md
docs/TOOLS_AND_SKILLS.md
.env.example
.codex/config.toml
.codex/agents/researcher.toml
.codex/agents/planner.toml
.codex/agents/tester.toml
.codex/agents/frontend-developer.toml
.codex/agents/backend-developer.toml
.codex/agents/reviewer.toml
.codex/agents/finalizer.toml
.agents/skills/bunker-mvp-delivery/SKILL.md
scripts/dev-loop.sh
```

Не створюй декоративний `SKILLS.md`: repo skill має бути реально discoverable у `.agents/skills/.../SKILL.md` з YAML frontmatter `name` і `description`.

`README.md` має містити короткий опис, screenshots placeholder лише якщо screenshot ще не створений, prerequisites, install, dev, test, build, env, deployment і known limitations.

`docs/RULES_TRACEABILITY.md` є quality gate, а не довідковим додатком. Для кожного rule ID він містить: source type (`official-3.3` або `approved-product-rule`), сторінку/секцію PDF чи точний розділ цього prompt, стислий нормативний переказ, precedence, product behavior, implementation module/state transition, позитивні й негативні test IDs та статус. Усі чотири approved overrides повинні бути видимими; `bunker-party-v1` не може мати undocumented deviations.

Тримай root `AGENTS.md` стислим: команди, source-of-truth documents, file ownership, quality gates, git/testing prohibitions і правила delegation. Не копіюй у нього весь Product Spec; використовуй посилання на `docs/`, щоб не переповнювати автоматично завантажуваний контекст.

Документація для власника продукту — українською. Code identifiers, protocol names і commit messages — англійською. `AGENTS.md`, custom-agent instructions і repo skill можуть бути англійською для однозначності, але мають посилатися на українські source-of-truth docs.

Codex читає `AGENTS.md` на старті run. Після створення файлу в поточному run явно перечитай і дотримуйся його; наступні runs підхоплять автоматично.

## Multi-agent workflow

### Основний принцип

Головний агент залишається оркестратором і власником product decisions. Делегуй лише конкретні bounded tasks. Research/review/test analysis можна паралелити. Одночасний запис у спільні contracts, game engine або ті самі файли заборонений.

Якщо використовуєш паралельних writing agents:

- дай їм взаємовиключні file ownership boundaries;
- використовуй окремі git worktrees/feature branches;
- не дозволяй двом агентам змінювати lockfile або shared contracts одночасно;
- головний агент інтегрує та повторно запускає всі gates.

### Агенти

Створи project-scoped custom agents у `.codex/agents/*.toml`. Не hardcode модель, якщо це не потрібно: за замовчуванням успадковуй parent model/effort. Кожен файл має `name`, `description`, `developer_instructions`; для read-only roles встанови read-only sandbox, якщо runtime підтримує це поле.

1. **Researcher / Збірник інформації**
   - Read-only.
   - Завантажує правила 3.3 лише через офіційну сторінку видавця, фіксує version/checksum/date і витягує атомарні rule IDs зі сторінками/секціями для `RULES_TRACEABILITY`.
   - Окремо перевіряє підготовку, таблицю вигнань, малу компанію, дев'ять combined decks, Особливі умови, офіційну нічию та extended final; онлайн-реалізації позначає лише як UX references і документує їхні відхилення.
   - Не «виправляє» approved product rules під PDF: передає Planner-у окремі списки canonical rules і явних overrides.
   - Перевіряє product references, framework/deployment docs і licenses та повертає сирі, але структуровані факти з links, version/date і confidence.
   - Не планує backlog, не пише app code і не копіює card datasets.

2. **Planner**
   - Працює після Researcher.
   - Відділяє P0/P1/future, знаходить суперечності, формує acceptance criteria, dependency graph, vertical slices і risk register.
   - Не вигадує фактів; посилається на research і цей prompt.
   - Не може вигадати неузгоджений house rule заради простішої реалізації; кожен gameplay acceptance criterion повинен мати canonical або approved-product rule ID.
   - План має бути придатним для Tester і Developers.

3. **Tester**
   - Володіє test files/fixtures, але не production implementation.
   - Пише behavior-focused tests перед реалізацією slice.
   - Максимізує negative/race/authorization/reconnect scenarios.
   - Віддає перевагу явним expects замість helper functions, які приховують важливу поведінку.
   - Helpers дозволені лише для setup/transport/fixtures, не для приховування перевірок.
   - Не робить tests залежними від private implementation details.
   - Якщо spec змінився, Tester змінює tests окремим обґрунтованим commit.
   - Перевіряє coverage `RULES_TRACEABILITY`: позитивний шлях, заборонений phase/actor/target і race/idempotency для кожного state-changing rule, включно з simultaneous extra-character claims і stale commands між rematches.

4. **Frontend Developer**
   - Володіє `apps/web` і frontend-specific tests після того, як Tester сформував expected behavior.
   - Не змінює shared contracts або server behavior без handoff оркестратору.
   - Не змінює Tester-owned acceptance tests самостійно.

5. **Backend Developer**
   - Володіє `apps/server` та `packages/game-engine` у погодженому slice.
   - Shared contracts змінює лише в окремій contract phase до паралельної роботи frontend/backend.
   - Не послаблює validation або hidden-data filtering лише для проходження tests.
   - Не змінює Tester-owned acceptance tests самостійно.

6. **Reviewer**
   - Read-only щодо app code.
   - Перевіряє rule-by-rule відповідність profile `bunker-party-v1`: PDF 3.3 плюс рівно чотири approved overrides у `RULES_TRACEABILITY`; також state-machine invariants, races, auth, hidden card leaks, test gaps, mobile UX, accessibility, deployability і scope creep.
   - Спочатку findings із severity, reproduction/evidence і file references; не пише загальні компліменти.
   - Якщо проблема в production code — повертає Developer; якщо test суперечить spec або пропускає scenario — Tester; якщо spec неоднозначна — Planner/оркестратор.

7. **Finalizer**
   - Запускається лише після green review і всіх quality gates.
   - Оновлює документацію, known limitations, deployment notes і release checklist.
   - Перевіряє git diff, відсутність secrets/generated junk і атомарність commits.
   - Не приховує failing tests і не робить функціональних змін без повторного review loop.

### Правило тестів

Developer не має права змінювати acceptance tests, щоб «зробити їх зеленими». Якщо test помилковий або суперечить source-of-truth spec, Developer зупиняє лише цей slice і повертає конкретне обґрунтування Tester/Planner. Tester може змінити test окремо; після цього Developer продовжує. Unit tests, що належать безпосередньо implementation module, можуть бути доповнені Developer, але не можуть послаблювати acceptance behavior.

### Dev loop

Створи executable `scripts/dev-loop.sh`, який є безпечним orchestration entrypoint, а не нескінченним автономним циклом. Перед написанням перевір реальний `codex --help` у середовищі й не вигадуй CLI flags.

Скрипт повинен:

- мати `--help`, `--dry-run`, feature/slice identifier і максимальну кількість review iterations;
- перевіряти clean/expected git state та не торкатися unrelated user changes;
- створювати/використовувати feature branch `feature/<slug>`; для паралельних writers — окремі worktrees;
- викликати ролі в порядку `research -> plan -> tests -> implementation -> review -> fix loop -> finalize`;
- дозволяти parallel researcher tasks і parallel read-only reviews;
- не запускати frontend/backend writers паралельно, доки shared contract не зафіксований;
- зберігати короткі machine-readable handoff summaries у ignored working directory, а не засмічувати product docs raw transcripts;
- fail fast при non-zero commands;
- не використовувати `--yolo`, destructive git commands або автоматичне схвалення небезпечних дій;
- зупинятися після configured review limit і показувати unresolved findings;
- ніколи не commit/push/deploy при red tests;
- бути resumable з останньої успішної фази;
- друкувати стислий підсумок виконаних gates.

Не намагайся замінити native Codex subagent orchestration shell-імітацією, якщо runtime вже надає spawn/delegation. Скрипт має бути відтворюваним локальним entrypoint; `AGENTS.md` і repo skill мають описувати той самий workflow для interactive runs.

### Git policy

- Одна major feature/vertical slice — окрема `feature/<slug>` branch.
- Commit — одна coherent зміна, яку можна review/revert окремо.
- Приклади slices: bootstrap/contracts, sessions/rooms, game-engine, realtime, web-lobby, web-game, packs/i18n, reconnect, deployment.
- Не змішуй formatting всієї codebase з feature commit.
- Не amend/rebase/push force без явної потреби й дозволу.
- Не коміть secrets, `.env`, Playwright artifacts, raw research dumps або build outputs.
- Перед commit: relevant tests; перед integration: full gates.
- Finalizer не squash-ить історію автоматично.

## Skills, plugins і повторне використання

На початку перевір доступні installed skills/plugins. Використовуй релевантні skills для frontend design, testing, deployment, documentation або browser verification, якщо вони реально доступні й відповідають task.

- Skills задають workflow, але не є заміною npm libraries.
- Для standard concerns використовуй зрілі підтримувані libraries замість самописних router, schema validator, websocket protocol або test runner.
- Не встановлюй skill/plugin лише заради формальної галочки.
- Curated/official skill можна встановити через доступний skill installer, якщо він істотно скорочує роботу.
- Перед стороннім неофіційним skill/plugin перевір source/permissions і не надавай зайвий доступ.
- Запиши використані skills, plugins, packages та причину вибору в `docs/TOOLS_AND_SKILLS.md`.
- Не дозволяй skill змінити product requirements цього prompt.

Repo skill `.agents/skills/bunker-mvp-delivery/SKILL.md` має бути вузьким і практичним: trigger description, inputs, source-of-truth docs, порядок slice workflow, quality gates, handoff format, заборони та definition of done. Не дублюй у ньому весь Product Spec.

## Delivery plan і vertical slices

Planner може деталізувати, але не пропускати такий dependency order:

1. Official 3.3 rule extraction, approved product overrides, `GAME_RULES`, `RULES_TRACEABILITY`, decisions, agent/skill configuration.
2. Monorepo bootstrap, tooling, shared config.
3. Versioned contracts і pure game-engine: character/controller model, fill-to-six claims, five base rounds/overtime, expulsion table, participant-based tie state machine, Special Conditions і finals.
4. Sessions, reusable public rooms, post-game/rematch state, in-memory repositories, TTL/reconnect.
5. Socket.IO protocol, filtered snapshots, four optional timers, atomic claims, stale `gameId` rejection і idempotent effects.
6. Next.js onboarding, profile, room browser і lobby.
7. Game table, one/two-character controllers, reveal/speech, discussion, custom tie/overtime, ballot/runoff/lot, exiled participation і base final UI.
8. Built-in packs, Special Conditions, mixed/combined packs і localization.
9. Custom pack editor/import/export/validation.
10. Survival Story, Threat/Catastrophe resolution, utility voting і Salvation/Revival.
11. Spectator-only late join, reconnect control transfer, host transfer і failure recovery.
12. Post-game room reuse, readiness reset, roster changes and rematch.
13. E2E, rules traceability audit, responsive/accessibility/browser QA.
14. Vercel/Railway configuration, smoke test, final docs.

Кожен slice має:

- goal/non-goals;
- exact files/ownership;
- acceptance criteria;
- negative scenarios;
- tests first where practical;
- implementation;
- reviewer result;
- atomic commit(s).

## Мінімальна test matrix

Обов'язково перевір:

### Domain/unit

- character/capacity/schedule mapping: 3 people -> 6 characters; 4/5 flag off -> 4/5; 4/5 completed fill-to-six -> 6; 6–15 -> one each;
- максимум один extra на controller; 4 people require 2 distinct claims, 5 require 1; 6+ rejects/clears extras; incomplete quota blocks start;
- atomic claim/release invariants under simultaneous requests, duplicate idempotency keys, disconnect expiry і participant-count transition;
- roster transitions 3->4/5, 4/5->3 і 4/5->6+ очищують/перераховують allocations без сьомого персонажа та завжди скидають readiness;
- п'ять базових раундів, по одній Bunker+Threat pair на base round і незмінний schedule після disconnect;
- clockwise turn order і перехід round starter до наступного невигнаного персонажа;
- у base round 1 forced Profession; далі одна legal hidden ordinary card; overtime відкриває hidden card лише якщо вона є та не відкриває нову Bunker/Threat pair;
- усі чотири timer settings default `null`, незалежно вмикаються/вимикаються й проходять boundary validation;
- selection expiry проти manual reveal race відкриває рівно одну legal card; speech/discussion expiry переводить рівно одну фазу; disabled timer не створює deadline/job;
- voting expiry лишає missing ballots `notCast`; zero submitted votes утворює tie між усіма eligible targets;
- усі персонажі, включно з вигнаними, мають ballot; spectator не має; target — лише невигнаний; `abstain` відсутній;
- unique leader expulsion і негайне відкриття всіх його ordinary cards, але не Special Condition;
- 3–4 people: two-way/multi-way tie завершує attempt без expulsion у base й overtime;
- 5 people: no-expulsion tie доступна лише при `roundNumber === 1`, не переноситься до першого scheduled vote; rounds 2+ завжди використовують standard resolution;
- 6+ people та mandatory 5-person vote: 60-second defense -> runoff лише tied candidates -> server-random expulsion при повторній нічиїй;
- один і два повні expulsion cycles згідно з таблицею;
- після round 5 active count вище capacity створює по одному overtime round/attempt до точної capacity; повторні дозволені ties не завершують гру;
- вигнаний не отримує reveal-turn, але голосує й може застосувати Special Condition;
- legal/illegal timing, target, atomic effect та duplicate command для кожного Special Condition effect type;
- `base` final, `survival-story` threat selection, threshold of three useful cards, Profession/Threat random consequence, Baggage retention, expelled-group two threats і Catastrophe check;
- thumbs vote рахує щонайменше половину як useful; обидва goals, рекомендований preset `salvation` до 7 і `revival` для 8+, а також Revival pair condition;
- combined 6/7/8/9-deck reveal counts і required Profession/Superpower constraint;
- host transfer;
- transition у `post-game`, readiness reset і rematch з новим `gameId`, fresh deal/seed та відхиленням old-game commands;
- idempotent duplicate commands і stale version rejection.

### Server/integration

- nickname normalization/uniqueness reservation during grace;
- one-session-one-room invariant;
- unauthorized role/phase commands;
- reconnect before й after 60 seconds;
- concurrent extra-character claims ніколи не перевищують quota; losers отримують stable `EXTRA_CHARACTER_UNAVAILABLE`, а snapshots збігаються;
- current controller disconnect before/after reveal і atomic transfer його одного/двох персонажів після grace;
- permanent disconnect видаляє profile/token, але не персонажа, голос чи expulsion schedule;
- ballot/runoff/lot і Special Condition intents не зависають та не виконуються двічі;
- завершення гри не видаляє непорожню room; explicit host close та empty-after-grace cleanup працюють окремо;
- post-game participant join/leave, claim/release, setting changes and ready reset; spectators не блокують rematch;
- rematch cancels old timers, не переносить exiled/dead/cards/votes і відхиляє stale `gameId`/sequence;
- empty room cleanup and timer/job cleanup;
- invalid/oversized avatar/pack/socket payloads;
- viewer-specific snapshot never leaks another hand;
- custom pack is snapshotted and cannot mutate active room;
- CORS/config/health endpoints.

### UI/component

- rules modal is local-only;
- locale switch per client;
- чотири timer controls показують `off` by default і незалежні values; active countdowns derived from server deadlines;
- disabled actions for wrong phase/role;
- distinct controls for active, exiled and spectator roles;
- two-character controller can switch hands without leaking either hand to others;
- remaining extra slots, claim success/loss race feedback і readiness blocker зрозумілі на mobile;
- expulsion table, allowed-tie/overtime state, runoff, Special Condition і both final modes зрозумілі на 320px;
- post-game summary і ready-for-rematch не вимагають повторного входу в room;
- reconnect and expired-session feedback;
- import error does not overwrite pack;
- avatar and localStorage failures;
- 320px width and touch interactions.

### Playwright multiplayer

Використовуй окремі browser contexts щонайменше для host, second participant і spectator. Critical E2E:

- 3 users login, create/join, ready, auto-start;
- кожен із 3 controllers отримує два персонажі, бачить тільки дві власні hands, а engine застосовує 6-character table;
- room defaults show all four timers off; окремий сценарій вмикає короткі test values і перевіряє selection/speech/discussion/voting expiry;
- 4 users із `fillToSixCharacters`: simultaneous claims дають extras рівно двом різним winners, третій бачить conflict, а start blocked до quota 6;
- round 1 Profession reveals, rounds 2–5 chosen reveals і п'ять Bunker+Threat pairs;
- voting відбувається лише у scheduled rounds; hidden ballot можна змінити до lock, `abstain` відсутній;
- у 3-person game дозволена tie не виганяє нікого; після round 5 запускаються overtime-раунди, доки не лишається capacity;
- у 6+ game tie запускає defense і runoff, повторна tie — server-random expulsion;
- exiled character відкриває ordinary cards, не має reveal-turn, але далі голосує і може зіграти Special Condition;
- late join після старту стає spectator і ніколи не отримує hand;
- host reconnect and host transfer after grace;
- base final і повний Survival Story до остаточного списку переможців;
- після final room і users залишаються, readiness скидається; усі ready запускає rematch з fresh hands і новим `gameId`, а старий command відхиляється;
- mixed Ukrainian/English clients in the same room;
- mobile viewport usability.

Використовуй fake clock/injected clock для domain/integration tests. Не роби test suite залежним від реальних sleeps. E2E може використовувати test-only короткі values, але production defaults усіх чотирьох timers залишаються `off`; canonical tie-defense timer лишається 60 секунд.

## Quality gates

Перед завершенням мають пройти з exit code 0:

- install із clean lockfile state;
- formatting check;
- lint;
- strict typecheck усіх packages;
- unit tests;
- server integration tests;
- component tests;
- critical Playwright E2E;
- production build web і server;
- local smoke test через production-like start;
- rule-by-rule audit: кожен state-changing пункт PDF 3.3 і кожен `approved-product-rule` має implementation і passing test IDs у `RULES_TRACEABILITY`, без неврахованих deviations;
- dependency/security audit з тріажем, а не сліпим autofix.

Reviewer окремо перевіряє browser console, network failures, reconnect, 320px mobile layout і хоча б один desktop viewport. Не оголошуй gate зеленим, якщо процес завис, був interrupted або output неповний.

## Deployment

### Backend / Railway

- Один instance/replica.
- Production start command, Node version, healthcheck і graceful shutdown.
- Environment variables для port, frontend origins, TTLs, limits і protocol version.
- Задокументуй, що deploy/restart видаляє active rooms.
- Не використовуй local filesystem як persistence.

### Frontend / Vercel

- Environment variable для public backend URL.
- Correct HTTPS/WSS Socket.IO connectivity та CORS.
- Static assets й localized content build-safe.
- Preview/production config без hardcoded localhost.

Якщо deployment credentials/configured integrations доступні, виконай deploy і smoke test deployed URLs. Якщо ні — не проси копіювати secrets у chat і не вигадуй успіх; підготуй конфіг, дай exact manual commands/steps і познач deployment як єдиний зовнішній blocker.

## Definition of done

Завдання завершене лише коли:

- нова людина може виконати README і запустити весь monorepo;
- 3–15 друзів можуть пройти повну партію `bunker-party-v1` з телефонів; forced/optional extra-character rules коректно дають потрібний character count;
- усі механіки 3.3 та approved overrides — чотири optional timers, atomic fill-to-six, participant-based tie/overtime і rematch — реалізовані й простежуються від source до passing tests;
- server state витримує reconnect, simultaneous claims, timer/manual races, повторні effects, stale commands між rematches і некоректні client intents без порушення invariants;
- hidden cards не витікають;
- room lifecycle/cleanup не зависає;
- завершена гра не видаляє populated room, а повторна готовність запускає чистий rematch;
- українська та англійська працюють одночасно в одній кімнаті;
- built-in multi-pack і custom pack flow працюють;
- усі quality gates зелені;
- Reviewer не має unresolved P0/P1 blockers;
- документація відповідає коду;
- git status не містить випадкового сміття або secrets;
- фінальний звіт чесно містить: реалізовано, tests/gates з командами, deployment URLs або blocker, known limitations, branches/commits і наступні рекомендовані кроки.

Не зупиняйся після створення `DELIVERY_PLAN.md`. Виконай план і доведи MVP до перевіреного стану.
