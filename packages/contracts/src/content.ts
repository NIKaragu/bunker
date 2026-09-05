import { z } from "zod";
import { boundedPlainTextSchema, cardIdSchema, packIdSchema, participantIdSchema, characterIdSchema } from "./primitives.js";

export const characterCategorySchema = z.enum(["profession", "biology", "health", "hobby", "baggage", "fact", "superpower", "phobia", "personality"]);
export const cardTypeSchema = z.enum(["character", "special-condition", "catastrophe", "bunker", "threat"]);
export const rulesProfileIdSchema = z.enum(["bunker-party-v1", "combined-editions-v1"]);

/** Character decks the `bunker-party-v1` rules profile deals from; the built-in pack covers exactly these. */
export const BUNKER_PARTY_CHARACTER_DECKS = ["profession", "biology", "health", "hobby", "baggage", "fact"] as const;

export const localizedTextSchema = z.object({
  uk: boundedPlainTextSchema.optional(),
  en: boundedPlainTextSchema.optional()
}).strict().refine((value) => Boolean(value.uk || value.en), "At least one locale is required");

export const specialTimingSchema = z.enum(["before-game", "reveal", "discussion", "before-vote", "after-vote", "final"]);
export const specialEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("swap-card"), category: characterCategorySchema }).strict(),
  z.object({ type: z.literal("reveal-random"), count: z.number().int().min(1).max(2) }).strict(),
  z.object({ type: z.literal("protect-from-vote"), rounds: z.literal(1) }).strict(),
  z.object({ type: z.literal("double-vote"), rounds: z.literal(1) }).strict(),
  z.object({ type: z.literal("force-reveal"), category: characterCategorySchema.optional() }).strict(),
  z.object({ type: z.literal("exchange-characters") }).strict()
]);

const cardBaseSchema = z.object({
  id: cardIdSchema,
  sourcePackId: packIdSchema,
  title: localizedTextSchema,
  details: localizedTextSchema.optional(),
  provenance: z.string().trim().max(200).optional()
});

export const characterCardSchema = cardBaseSchema.extend({ type: z.literal("character"), category: characterCategorySchema }).strict();
export const specialConditionCardSchema = cardBaseSchema.extend({
  type: z.literal("special-condition"), timing: specialTimingSchema, effect: specialEffectSchema
}).strict();
export const catastropheCardSchema = cardBaseSchema.extend({
  type: z.literal("catastrophe"), usefulTags: z.array(z.string().min(1).max(40)).max(20), consequence: localizedTextSchema
}).strict();
export const bunkerCardSchema = cardBaseSchema.extend({ type: z.literal("bunker"), usefulTags: z.array(z.string().min(1).max(40)).max(20) }).strict();
export const threatCardSchema = cardBaseSchema.extend({ type: z.literal("threat"), usefulTags: z.array(z.string().min(1).max(40)).max(20), consequence: localizedTextSchema }).strict();
export const cardSchema = z.discriminatedUnion("type", [characterCardSchema, specialConditionCardSchema, catastropheCardSchema, bunkerCardSchema, threatCardSchema]);
export type Card = z.infer<typeof cardSchema>;

export const PACK_LIMITS = { maxCards: 1_000, maxJsonBytes: 1_000_000, maxNameLength: 80 } as const;
export const packKindSchema = z.enum(["base", "addon"]);
export const customPackSchema = z.object({
  schemaVersion: z.literal(1),
  id: packIdSchema,
  rulesProfileId: rulesProfileIdSchema,
  kind: packKindSchema,
  name: z.string().trim().min(1).max(PACK_LIMITS.maxNameLength),
  description: localizedTextSchema.optional(),
  adultContent: z.boolean().default(false),
  cards: z.array(cardSchema).min(1).max(PACK_LIMITS.maxCards)
}).strict().superRefine((pack, ctx) => {
  const ids = new Set<string>();
  pack.cards.forEach((card, index) => {
    if (ids.has(card.id)) ctx.addIssue({ code: "custom", path: ["cards", index, "id"], message: "Card ID must be unique" });
    ids.add(card.id);
    if (card.sourcePackId !== pack.id) ctx.addIssue({ code: "custom", path: ["cards", index, "sourcePackId"], message: "sourcePackId must equal pack id" });
  });
});
export type CustomPack = z.infer<typeof customPackSchema>;

export const customPackImportSchema = z.object({
  serializedBytes: z.number().int().positive().max(PACK_LIMITS.maxJsonBytes),
  pack: customPackSchema
}).strict();
export const packValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.object({ path: z.string().max(300), code: z.string().max(80), message: z.string().max(300) }).strict()).max(200),
  coverage: z.record(z.string(), z.number().int().nonnegative()),
  compatibleCharacterCounts: z.array(z.number().int().min(3).max(15)).max(13)
}).strict();

export const revealedCardSchema = z.intersection(cardSchema, z.object({ revealedAt: z.string().datetime({ offset: true }) }).strict());
export const concealedCardSchema = z.object({ cardId: cardIdSchema, type: cardTypeSchema, category: characterCategorySchema.optional() }).strict();
export const privateCharacterHandSchema = z.object({
  characterId: characterIdSchema,
  controllerId: participantIdSchema,
  cards: z.array(cardSchema).max(16),
  /** Who this character voted for in the open ballot; visible only to its controller. */
  votedForCharacterId: characterIdSchema.nullable().default(null)
}).strict();
