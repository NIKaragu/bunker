import type { RandomSource } from "./random.js";
import { choose } from "./random.js";

export type SpecialEffect =
  | Readonly<{ type: "swap-card"; category: string }>
  | Readonly<{ type: "reveal-random"; count: 1 | 2 }>
  | Readonly<{ type: "protect-from-vote"; rounds: 1 }>
  | Readonly<{ type: "double-vote"; rounds: 1 }>
  | Readonly<{ type: "force-reveal"; category?: string }>
  | Readonly<{ type: "exchange-characters" }>;
export type SpecialTiming =
  | "before-game"
  | "reveal"
  | "discussion"
  | "before-vote"
  | "after-vote"
  | "final";
export type SpecialCharacter = Readonly<{
  id: string;
  controllerId: string;
  active: boolean;
  hiddenCategories: readonly string[];
  revealedCategories: readonly string[];
}>;
export type SpecialState = Readonly<{
  phase: SpecialTiming;
  characters: readonly SpecialCharacter[];
  protectedIds: ReadonlySet<string>;
  doubleVoteIds: ReadonlySet<string>;
  usedCardIds: ReadonlySet<string>;
  processedCommands: ReadonlySet<string>;
  audit: readonly string[];
}>;

export const applySpecial = (
  state: SpecialState,
  input: Readonly<{
    commandId: string;
    cardId: string;
    actorId: string;
    timing: SpecialTiming;
    targetId?: string;
    effect: SpecialEffect;
  }>,
  random: RandomSource,
): SpecialState => {
  if (state.processedCommands.has(input.commandId)) return state;
  if (state.usedCardIds.has(input.cardId))
    throw new Error("CARD_ALREADY_REVEALED");
  if (state.phase !== input.timing) throw new Error("INVALID_PHASE");
  const actor = state.characters.find(({ id }) => id === input.actorId);
  if (!actor) throw new Error("FORBIDDEN");
  const target = input.targetId
    ? state.characters.find(({ id }) => id === input.targetId)
    : undefined;
  if (
    ["swap-card", "force-reveal", "exchange-characters"].includes(
      input.effect.type,
    ) &&
    !target
  )
    throw new Error("INVALID_TARGET");

  let characters = [...state.characters];
  const protectedIds = new Set(state.protectedIds);
  const doubleVoteIds = new Set(state.doubleVoteIds);
  if (input.effect.type === "reveal-random") {
    const categories = [...actor.hiddenCategories];
    const revealed = new Set(actor.revealedCategories);
    for (
      let count = 0;
      count < input.effect.count && categories.length;
      count += 1
    ) {
      const selected = choose(categories, random);
      categories.splice(categories.indexOf(selected), 1);
      revealed.add(selected);
    }
    characters = characters.map((entry) =>
      entry.id === actor.id
        ? {
            ...entry,
            hiddenCategories: categories,
            revealedCategories: [...revealed],
          }
        : entry,
    );
  } else if (input.effect.type === "protect-from-vote")
    protectedIds.add(target?.id ?? actor.id);
  else if (input.effect.type === "double-vote") doubleVoteIds.add(actor.id);
  else if (input.effect.type === "force-reveal" && target) {
    const legal =
      input.effect.category &&
      target.hiddenCategories.includes(input.effect.category)
        ? input.effect.category
        : target.hiddenCategories[0];
    if (!legal) throw new Error("INVALID_CARD");
    characters = characters.map((entry) =>
      entry.id === target.id
        ? {
            ...entry,
            hiddenCategories: entry.hiddenCategories.filter(
              (category) => category !== legal,
            ),
            revealedCategories: [...entry.revealedCategories, legal],
          }
        : entry,
    );
  } else if (input.effect.type === "exchange-characters" && target) {
    characters = characters.map((entry) =>
      entry.id === actor.id
        ? { ...entry, controllerId: target.controllerId }
        : entry.id === target.id
          ? { ...entry, controllerId: actor.controllerId }
          : entry,
    );
  }
  return {
    ...state,
    characters,
    protectedIds,
    doubleVoteIds,
    usedCardIds: new Set(state.usedCardIds).add(input.cardId),
    processedCommands: new Set(state.processedCommands).add(input.commandId),
    audit: [
      ...state.audit,
      `${input.commandId}:${input.effect.type}:${input.actorId}:${input.targetId ?? "self"}`,
    ],
  };
};
