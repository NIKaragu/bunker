import type { RandomSource } from "./random.js";
import { choose } from "./random.js";

export type Ballot = Readonly<{
  eligibleVoterIds: readonly string[];
  candidateIds: readonly string[];
  votes: ReadonlyMap<string, string>;
  closed: boolean;
}>;

export type VoteOutcome =
  | Readonly<{
      kind: "expelled";
      characterId: string;
      tally: ReadonlyMap<string, number>;
    }>
  | Readonly<{
      kind: "allowed-tie";
      tiedIds: readonly string[];
      tally: ReadonlyMap<string, number>;
    }>
  | Readonly<{
      kind: "defense";
      tiedIds: readonly string[];
      deadlineSeconds: 60;
      tally: ReadonlyMap<string, number>;
    }>;

export const createBallot = (
  eligibleVoterIds: readonly string[],
  candidateIds: readonly string[],
): Ballot => ({
  eligibleVoterIds: [...eligibleVoterIds],
  candidateIds: [...candidateIds],
  votes: new Map(),
  closed: false,
});

export const castVote = (
  ballot: Ballot,
  voterId: string,
  targetId: string,
): Ballot => {
  if (ballot.closed) throw new Error("VOTE_CLOSED");
  if (!ballot.eligibleVoterIds.includes(voterId)) throw new Error("FORBIDDEN");
  if (!ballot.candidateIds.includes(targetId))
    throw new Error("INVALID_TARGET");
  return { ...ballot, votes: new Map(ballot.votes).set(voterId, targetId) };
};

export const closeBallot = (
  ballot: Ballot,
  humansAtStart: number,
  gameRound: number,
): VoteOutcome => {
  const tally = new Map(ballot.candidateIds.map((id) => [id, 0]));
  for (const target of ballot.votes.values())
    tally.set(target, (tally.get(target) ?? 0) + 1);
  const maximum = Math.max(...tally.values());
  const tiedIds = [...tally]
    .filter(([, count]) => count === maximum)
    .map(([id]) => id);
  if (tiedIds.length === 1)
    return { kind: "expelled", characterId: tiedIds[0] as string, tally };
  if (humansAtStart <= 4 || (humansAtStart === 5 && gameRound === 1))
    return { kind: "allowed-tie", tiedIds, tally };
  return { kind: "defense", tiedIds, deadlineSeconds: 60, tally };
};

export const resolveRunoff = (
  ballot: Ballot,
  tiedIds: readonly string[],
  random: RandomSource,
): Readonly<{ characterId: string; byLot: boolean }> => {
  if (ballot.candidateIds.some((id) => !tiedIds.includes(id)))
    throw new Error("Runoff may contain tied candidates only");
  const result = closeBallot(ballot, 6, 2);
  return result.kind === "expelled"
    ? { characterId: result.characterId, byLot: false }
    : { characterId: choose(result.tiedIds, random), byLot: true };
};

export const notCastIds = (ballot: Ballot): readonly string[] =>
  ballot.eligibleVoterIds.filter((id) => !ballot.votes.has(id));
