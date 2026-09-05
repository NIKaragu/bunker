export interface RandomSource {
  integer(maxExclusive: number): number;
}

const hashSeed = (seed: string): number => {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

/** Small deterministic PRNG for replayable domain decisions. Not cryptographic. */
export class SeededRandom implements RandomSource {
  private state: number;

  public constructor(seed: string) {
    this.state = hashSeed(seed) || 0x9e3779b9;
  }

  public integer(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive safe integer");
    }
    let value = this.state;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.state = value >>> 0;
    return this.state % maxExclusive;
  }
}

export const shuffled = <T>(
  values: readonly T[],
  random: RandomSource,
): T[] => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const selected = random.integer(index + 1);
    [result[index], result[selected]] = [
      result[selected] as T,
      result[index] as T,
    ];
  }
  return result;
};

export const choose = <T>(values: readonly T[], random: RandomSource): T => {
  if (values.length === 0)
    throw new Error("Cannot choose from an empty collection");
  return values[random.integer(values.length)] as T;
};
