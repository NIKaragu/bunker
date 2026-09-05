import type { RandomSource } from "./random.js";
import { shuffled } from "./random.js";
import { validateDeckSelection } from "./rules.js";
import {
  BAGGAGE_CARDS,
  BIOLOGY_CARDS,
  BUNKER_CARDS,
  CATASTROPHE_CARDS,
  FACT_CARDS,
  HEALTH_CARDS,
  HOBBY_CARDS,
  PROFESSION_CARDS,
  SPECIAL_CONDITION_CARDS,
  THREAT_CARDS,
  type CardEntry,
  type ContextCard,
} from "./bunker-party-cards.js";

export const CLASSIC_CATEGORIES = [
  "profession",
  "biology",
  "health",
  "hobby",
  "baggage",
  "fact",
] as const;
export const SUPPORTED_SPECIAL_EFFECTS = [
  "swap-card",
  "reveal-random",
  "protect-from-vote",
  "double-vote",
  "force-reveal",
  "exchange-characters",
] as const;

export type LocalizedText = Readonly<{ uk?: string; en?: string }>;
export type CharacterCategory =
  | "profession"
  | "biology"
  | "health"
  | "hobby"
  | "baggage"
  | "fact"
  | "superpower"
  | "phobia"
  | "personality";
export type Card = Readonly<{
  id: string;
  sourcePackId: string;
  title: LocalizedText;
  details?: LocalizedText;
  provenance?: string;
  type: "character" | "special-condition" | "catastrophe" | "bunker" | "threat";
  category?: CharacterCategory;
  timing?: string;
  effect?: Readonly<Record<string, unknown>>;
  usefulTags?: readonly string[];
  consequence?: LocalizedText;
}>;
export type CustomPack = Readonly<{
  schemaVersion: 1;
  id: string;
  rulesProfileId: "bunker-party-v1" | "combined-editions-v1";
  kind: "base" | "addon";
  name: string;
  description?: LocalizedText;
  adultContent: boolean;
  cards: readonly Card[];
}>;

export type PackIssue = Readonly<{
  path: string;
  code: string;
  message: string;
}>;
export type PackValidation = Readonly<{
  valid: boolean;
  issues: readonly PackIssue[];
  coverage: Readonly<Record<string, number>>;
  compatibleCharacterCounts: readonly number[];
}>;

export const validatePack = (input: unknown): PackValidation => {
  const structural = validateStructure(input);
  if (structural.issues.length > 0 || !structural.pack)
    return {
      valid: false,
      issues: structural.issues,
      coverage: {},
      compatibleCharacterCounts: [],
    };
  const parsed = structural.pack;
  const coverage: Record<string, number> = {};
  for (const card of parsed.cards) {
    const key =
      card.type === "character" ? (card.category ?? "unknown") : card.type;
    coverage[key] = (coverage[key] ?? 0) + 1;
  }
  const issues: PackIssue[] = [];
  const required =
    parsed.kind === "addon"
      ? [
          ...CLASSIC_CATEGORIES,
          "special-condition",
          "catastrophe",
          "bunker",
          "threat",
        ]
      : [
          ...CLASSIC_CATEGORIES,
          "special-condition",
          "catastrophe",
          "bunker",
          "threat",
        ];
  for (const key of required)
    if (!coverage[key])
      issues.push({
        path: "cards",
        code: "coverage",
        message: `Missing ${key}`,
      });
  const compatibleCharacterCounts =
    parsed.kind === "addon"
      ? Array.from({ length: 13 }, (_, index) => index + 3)
      : Array.from({ length: 13 }, (_, index) => index + 3).filter(
          (count) =>
            CLASSIC_CATEGORIES.every(
              (category) => (coverage[category] ?? 0) >= count,
            ) &&
            (coverage["special-condition"] ?? 0) >= count &&
            (coverage.catastrophe ?? 0) >= 1 &&
            (coverage.bunker ?? 0) >= 5 &&
            (coverage.threat ?? 0) >= 7,
        );
  return {
    valid: issues.length === 0,
    issues,
    coverage,
    compatibleCharacterCounts,
  };
};

const validateStructure = (
  input: unknown,
): Readonly<{ pack?: CustomPack; issues: PackIssue[] }> => {
  const issues: PackIssue[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return {
      issues: [{ path: "", code: "type", message: "Pack must be an object" }],
    };
  const value = input as Record<string, unknown>;
  if (value.schemaVersion !== 1)
    issues.push({
      path: "schemaVersion",
      code: "literal",
      message: "schemaVersion must be 1",
    });
  if (typeof value.id !== "string" || value.id.length < 8)
    issues.push({ path: "id", code: "format", message: "Pack ID is invalid" });
  if (
    value.rulesProfileId !== "bunker-party-v1" &&
    value.rulesProfileId !== "combined-editions-v1"
  )
    issues.push({
      path: "rulesProfileId",
      code: "enum",
      message: "Unsupported rules profile",
    });
  if (value.kind !== "base" && value.kind !== "addon")
    issues.push({
      path: "kind",
      code: "enum",
      message: "Unsupported pack kind",
    });
  if (
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    value.name.length > 80
  )
    issues.push({
      path: "name",
      code: "length",
      message: "Pack name is invalid",
    });
  if (
    !Array.isArray(value.cards) ||
    value.cards.length === 0 ||
    value.cards.length > 1_000
  )
    issues.push({
      path: "cards",
      code: "length",
      message: "Pack must contain 1 through 1000 cards",
    });
  if (!Array.isArray(value.cards)) return { issues };
  const seen = new Set<string>();
  value.cards.forEach((raw, index) => {
    if (!raw || typeof raw !== "object") {
      issues.push({
        path: `cards.${index}`,
        code: "type",
        message: "Card must be an object",
      });
      return;
    }
    const card = raw as Record<string, unknown>;
    if (typeof card.id !== "string")
      issues.push({
        path: `cards.${index}.id`,
        code: "format",
        message: "Card ID is invalid",
      });
    else if (seen.has(card.id))
      issues.push({
        path: `cards.${index}.id`,
        code: "duplicate",
        message: "Card ID must be unique",
      });
    else seen.add(card.id);
    if (card.sourcePackId !== value.id)
      issues.push({
        path: `cards.${index}.sourcePackId`,
        code: "reference",
        message: "sourcePackId must equal pack id",
      });
    if (card.type === "special-condition") {
      const effect = card.effect as Record<string, unknown> | undefined;
      if (
        !effect ||
        !SUPPORTED_SPECIAL_EFFECTS.includes(
          effect.type as (typeof SUPPORTED_SPECIAL_EFFECTS)[number],
        )
      )
        issues.push({
          path: `cards.${index}.effect.type`,
          code: "enum",
          message: "Unsupported special effect",
        });
    }
  });
  return issues.length > 0
    ? { issues }
    : { pack: value as unknown as CustomPack, issues };
};

export const mixPacks = (
  base: CustomPack,
  addons: readonly CustomPack[],
): readonly Card[] => {
  if (base.kind !== "base")
    throw new Error("The first pack must be a base pack");
  const packs = [base, ...addons];
  if (packs.some((pack) => pack.rulesProfileId !== base.rulesProfileId))
    throw new Error("PACK_UNSUPPORTED");
  const cards = packs.flatMap((pack) => pack.cards);
  if (new Set(cards.map(({ id }) => id)).size !== cards.length)
    throw new Error("Duplicate card ID across selected packs");
  return cards;
};

export type Deal = Readonly<{
  hands: ReadonlyMap<string, readonly Card[]>;
  catastrophe: Card;
  bunkerThreatPairs: readonly Readonly<{ bunker: Card; threat: Card }>[];
  remainingThreats: readonly Card[];
}>;

const take = (
  cards: readonly Card[],
  count: number,
  random: RandomSource,
  label: string,
): readonly Card[] => {
  if (cards.length < count) throw new Error(`Insufficient ${label} cards`);
  return shuffled(cards, random).slice(0, count);
};

/** Fixed non-character requirements every deal draws from, regardless of table size. */
const FIXED_DEAL_REQUIREMENTS = [
  ["catastrophe", 1],
  ["bunker", 5],
  ["threat", 7],
] as const;

/**
 * Reports every deck that cannot cover a table of `characterCount` characters.
 * Callers use it to reject an undealable configuration up front instead of
 * letting `dealGame` throw once the table is already waiting to start.
 */
export const dealShortfalls = (
  cards: readonly Card[],
  characterDecks: readonly string[],
  characterCount: number,
): readonly Readonly<{
  deck: string;
  available: number;
  required: number;
}>[] => {
  const shortfalls: { deck: string; available: number; required: number }[] =
    [];
  const record = (deck: string, available: number, required: number) => {
    if (available < required) shortfalls.push({ deck, available, required });
  };
  for (const category of characterDecks) {
    record(
      category,
      cards.filter(
        (card) => card.type === "character" && card.category === category,
      ).length,
      characterCount,
    );
  }
  record(
    "special-condition",
    cards.filter((card) => card.type === "special-condition").length,
    characterCount,
  );
  for (const [type, required] of FIXED_DEAL_REQUIREMENTS)
    record(type, cards.filter((card) => card.type === type).length, required);
  return shortfalls;
};

export const dealGame = (
  characterIds: readonly string[],
  cards: readonly Card[],
  characterDecks: readonly string[],
  random: RandomSource,
): Deal => {
  validateDeckSelection(characterDecks);
  const pools = new Map<string, readonly Card[]>();
  for (const category of characterDecks)
    pools.set(
      category,
      cards.filter(
        (card) => card.type === "character" && card.category === category,
      ),
    );
  pools.set(
    "special-condition",
    cards.filter((card) => card.type === "special-condition"),
  );
  const hands = new Map<string, readonly Card[]>();
  const byCategory = new Map<string, readonly Card[]>();
  for (const [category, pool] of pools)
    byCategory.set(category, take(pool, characterIds.length, random, category));
  characterIds.forEach((characterId, index) => {
    hands.set(
      characterId,
      [...characterDecks, "special-condition"].map(
        (category) =>
          (byCategory.get(category) as readonly Card[])[index] as Card,
      ),
    );
  });
  const catastrophe = take(
    cards.filter((card) => card.type === "catastrophe"),
    1,
    random,
    "catastrophe",
  )[0] as Card;
  const bunkers = take(
    cards.filter((card) => card.type === "bunker"),
    5,
    random,
    "bunker",
  );
  const threats = take(
    cards.filter((card) => card.type === "threat"),
    7,
    random,
    "threat",
  );
  return {
    hands,
    catastrophe,
    bunkerThreatPairs: bunkers.map((bunker, index) => ({
      bunker,
      threat: threats[index] as Card,
    })),
    remainingThreats: threats.slice(5),
  };
};

const localized = (uk: string, en: string) => ({ uk, en });
const cardId = (kind: string, index: number) =>
  `${kind}_${String(index).padStart(4, "0")}`;

/** Original, compact bilingual content sufficient for a 15-character party. */
export const createBunkerPartyPack = (): CustomPack => {
  const packId = "pack_general_v1";
  const provenance = "Original Bunker Party content";
  const decks: readonly (readonly [CharacterCategory, readonly CardEntry[]])[] =
    [
      ["profession", PROFESSION_CARDS],
      ["biology", BIOLOGY_CARDS],
      ["health", HEALTH_CARDS],
      ["hobby", HOBBY_CARDS],
      ["baggage", BAGGAGE_CARDS],
      ["fact", FACT_CARDS],
    ];
  const cards: Card[] = [];
  for (const [category, entries] of decks)
    entries.forEach(([titleUk, titleEn, detailUk, detailEn], index) => {
      cards.push({
        id: cardId(category, index + 1),
        sourcePackId: packId,
        type: "character",
        category,
        title: localized(titleUk, titleEn),
        details: localized(detailUk, detailEn),
        provenance,
      } as Card);
    });
  SPECIAL_CONDITION_CARDS.forEach((entry, index) => {
    cards.push({
      id: cardId("special", index + 1),
      sourcePackId: packId,
      type: "special-condition",
      timing: entry.timing,
      effect: entry.effect,
      title: localized(entry.title[0], entry.title[1]),
      details: localized(entry.details[0], entry.details[1]),
      provenance,
    } as Card);
  });
  const contextDeck = (
    kind: "catastrophe" | "bunker" | "threat",
    entries: readonly ContextCard[],
  ) =>
    entries.forEach((entry, index) => {
      cards.push({
        id: cardId(kind, index + 1),
        sourcePackId: packId,
        type: kind,
        title: localized(entry.title[0], entry.title[1]),
        usefulTags: entry.usefulTags,
        ...(kind === "bunker"
          ? { details: localized(entry.consequence[0], entry.consequence[1]) }
          : {
              consequence: localized(
                entry.consequence[0],
                entry.consequence[1],
              ),
            }),
        provenance,
      } as Card);
    });
  contextDeck("catastrophe", CATASTROPHE_CARDS);
  contextDeck("bunker", BUNKER_CARDS);
  contextDeck("threat", THREAT_CARDS);
  return {
    schemaVersion: 1,
    id: packId,
    rulesProfileId: "bunker-party-v1",
    kind: "base",
    name: "General / Загальний",
    description: localized("Оригінальний базовий набір.", "Original base set."),
    adultContent: false,
    cards,
  };
};
