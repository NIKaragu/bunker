export type UiLocale = "uk" | "en";

const messages = {
  uk: {
    appName: "Бункер",
    tagline: "Вирішіть, хто збереже майбутнє",
    rooms: "Відкриті кімнати",
    createRoom: "Створити кімнату",
    profile: "Профіль",
    packs: "Мої паки",
    rules: "Правила",
    ready: "Я готовий",
    notReady: "Не готовий",
    reconnecting: "Відновлюємо зв’язок…",
    expired: "Сесію завершено. Створіть новий профіль.",
    offline: "Сервер зараз недоступний",
    spectators: "Спостерігачі",
    leave: "Вийти",
    save: "Зберегти",
    cancel: "Скасувати",
  },
  en: {
    appName: "Bunker",
    tagline: "Decide who carries the future",
    rooms: "Open rooms",
    createRoom: "Create room",
    profile: "Profile",
    packs: "My packs",
    rules: "Rules",
    ready: "I'm ready",
    notReady: "Not ready",
    reconnecting: "Restoring connection…",
    expired: "Your session expired. Create a new profile.",
    offline: "The server is unavailable",
    spectators: "Spectators",
    leave: "Leave",
    save: "Save",
    cancel: "Cancel",
  },
} as const;

export type MessageKey = keyof (typeof messages)["en"];

export const t = (locale: UiLocale, key: MessageKey): string => messages[locale][key];

export const pickLocalized = (
  value: { uk?: string | undefined; en?: string | undefined },
  locale: UiLocale,
): string => value[locale] ?? value[locale === "uk" ? "en" : "uk"] ?? "—";
