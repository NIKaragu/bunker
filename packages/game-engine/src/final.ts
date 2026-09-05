import type { RandomSource } from "./random.js";
import { choose } from "./random.js";

export type FinalCharacter = Readonly<{
  id: string;
  professionCardId: string;
  baggageCardIds: readonly string[];
  reproductiveRole?: "female" | "male" | "other";
  viable?: boolean;
}>;
export type FinalOutcome = Readonly<{
  winningCharacterIds: readonly string[];
  losingCharacterIds: readonly string[];
  summaryKey: string;
}>;

export const usefulnessAccepted = (
  usefulVotes: number,
  totalVotes: number,
): boolean => totalVotes > 0 && usefulVotes >= Math.ceil(totalVotes / 2);

export const hasViableRevivalPair = (
  characters: readonly FinalCharacter[],
): boolean =>
  characters.some(
    (character) =>
      character.viable !== false && character.reproductiveRole === "female",
  ) &&
  characters.some(
    (character) =>
      character.viable !== false && character.reproductiveRole === "male",
  );

export const resolveBaseFinal = (
  survivors: readonly FinalCharacter[],
  all: readonly FinalCharacter[],
  goal: "salvation" | "revival",
): FinalOutcome => {
  const successful = goal === "salvation" || hasViableRevivalPair(survivors);
  const winningCharacterIds = successful ? survivors.map(({ id }) => id) : [];
  return {
    winningCharacterIds,
    losingCharacterIds: all
      .filter(({ id }) => !winningCharacterIds.includes(id))
      .map(({ id }) => id),
    summaryKey: successful ? `base.${goal}.success` : `base.${goal}.failed`,
  };
};

export type SurvivalGroup = Readonly<{
  members: readonly FinalCharacter[];
  retainedBaggageCardIds: readonly string[];
}>;
export type ThreatResult = Readonly<{
  survivors: SurvivalGroup;
  killedIds: readonly string[];
  groupDestroyed: boolean;
}>;

export const resolveThreat = (
  group: SurvivalGroup,
  usefulCardCount: number,
  threatCardId: string,
  random: RandomSource,
): ThreatResult => {
  if (usefulCardCount >= 3 || group.members.length === 0)
    return { survivors: group, killedIds: [], groupDestroyed: false };
  const consequence = choose(
    [
      ...group.members.map(({ professionCardId }) => professionCardId),
      threatCardId,
    ],
    random,
  );
  if (consequence === threatCardId)
    return {
      survivors: {
        members: [],
        retainedBaggageCardIds: [
          ...group.retainedBaggageCardIds,
          ...group.members.flatMap(({ baggageCardIds }) => baggageCardIds),
        ],
      },
      killedIds: group.members.map(({ id }) => id),
      groupDestroyed: true,
    };
  const killed = group.members.find(
    ({ professionCardId }) => professionCardId === consequence,
  ) as FinalCharacter;
  return {
    survivors: {
      members: group.members.filter(({ id }) => id !== killed.id),
      retainedBaggageCardIds: [
        ...group.retainedBaggageCardIds,
        ...killed.baggageCardIds,
      ],
    },
    killedIds: [killed.id],
    groupDestroyed: false,
  };
};

export const resolveSurvivalFinal = (
  bunker: SurvivalGroup,
  exiled: SurvivalGroup,
  threatIds: readonly string[],
  usefulCounts: Readonly<Record<string, number>>,
  catastropheId: string,
  goal: "salvation" | "revival",
  random: RandomSource,
): FinalOutcome => {
  if (threatIds.length < 3)
    throw new Error(
      "Survival Story requires a bunker threat and two exile threats",
    );
  let bunkerResult = resolveThreat(
    bunker,
    usefulCounts[threatIds[0] as string] ?? 0,
    threatIds[0] as string,
    random,
  ).survivors;
  let exileResult = exiled;
  for (const threat of threatIds.slice(1, 3))
    exileResult = resolveThreat(
      exileResult,
      usefulCounts[threat] ?? 0,
      threat,
      random,
    ).survivors;
  const joined: SurvivalGroup = {
    members: [...bunkerResult.members, ...exileResult.members],
    retainedBaggageCardIds: [
      ...bunkerResult.retainedBaggageCardIds,
      ...exileResult.retainedBaggageCardIds,
    ],
  };
  const finalGroup = resolveThreat(
    joined,
    usefulCounts[catastropheId] ?? 0,
    catastropheId,
    random,
  ).survivors;
  const winners =
    goal === "salvation" || hasViableRevivalPair(finalGroup.members)
      ? finalGroup.members.map(({ id }) => id)
      : [];
  const all = [...bunker.members, ...exiled.members];
  return {
    winningCharacterIds: winners,
    losingCharacterIds: all
      .filter(({ id }) => !winners.includes(id))
      .map(({ id }) => id),
    summaryKey: winners.length
      ? `survival.${goal}.success`
      : `survival.${goal}.failed`,
  };
};
