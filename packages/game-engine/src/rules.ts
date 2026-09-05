export const BASE_ROUND_COUNT = 5 as const;
export const TIE_DEFENSE_SECONDS = 60 as const;

export const EXPULSION_TABLE = Object.freeze({
  4: [0, 0, 0, 1, 1],
  5: [0, 0, 1, 1, 1],
  6: [0, 0, 1, 1, 1],
  7: [0, 1, 1, 1, 1],
  8: [0, 1, 1, 1, 1],
  9: [0, 1, 1, 1, 2],
  10: [0, 1, 1, 1, 2],
  11: [0, 1, 1, 2, 2],
  12: [0, 1, 1, 2, 2],
  13: [0, 1, 2, 2, 2],
  14: [0, 1, 2, 2, 2],
  15: [0, 2, 2, 2, 2],
} as const satisfies Record<number, readonly number[]>);

export const expulsionSchedule = (
  startCharacterCount: number,
): readonly number[] => {
  if (startCharacterCount === 3)
    throw new Error(
      "Three participants must be allocated to six characters first",
    );
  const schedule =
    EXPULSION_TABLE[startCharacterCount as keyof typeof EXPULSION_TABLE];
  if (!schedule)
    throw new RangeError("startCharacterCount must be between 4 and 15");
  return schedule;
};

export const revealCountSchedule = (deckCount: number): readonly number[] => {
  if (!Number.isInteger(deckCount) || deckCount < 6 || deckCount > 9)
    throw new RangeError("deckCount must be 6 through 9");
  if (deckCount === 6) return [1, 1, 1, 1, 1];
  if (deckCount === 7) return [2, 1, 1, 1, 1];
  if (deckCount === 8) return [2, 2, 1, 1, 1];
  return [2, 2, 2, 1, 1];
};

export const validateDeckSelection = (categories: readonly string[]): void => {
  if (
    categories.length < 6 ||
    categories.length > 9 ||
    new Set(categories).size !== categories.length
  ) {
    throw new Error("Choose 6 through 9 distinct character decks");
  }
  if (
    !categories.includes("profession") &&
    !categories.includes("superpower")
  ) {
    throw new Error("Combined decks require Profession or Superpower");
  }
};

export const nextActiveClockwise = (
  seatOrder: readonly string[],
  previousStarterId: string,
  exiledIds: ReadonlySet<string>,
): string => {
  const previousIndex = seatOrder.indexOf(previousStarterId);
  if (previousIndex < 0)
    throw new Error("Starter is outside the immutable seat order");
  for (let offset = 1; offset <= seatOrder.length; offset += 1) {
    const candidate = seatOrder[(previousIndex + offset) % seatOrder.length];
    if (candidate && !exiledIds.has(candidate)) return candidate;
  }
  throw new Error("No active character remains");
};

export const legalRevealCategories = (
  baseRound: number,
  hiddenCategories: readonly string[],
): readonly string[] => {
  if (baseRound === 1)
    return hiddenCategories.includes("profession") ? ["profession"] : [];
  if (baseRound >= 2 || baseRound === 0)
    return hiddenCategories.filter(
      (category) => category !== "special-condition",
    );
  throw new RangeError("Invalid round");
};

export const shouldStartOvertime = (
  baseRound: number,
  activeCount: number,
  capacity: number,
): boolean => baseRound >= BASE_ROUND_COUNT && activeCount > capacity;
