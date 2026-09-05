import type { Card } from "./content.js";
import type { RandomSource } from "./random.js";
import { choose } from "./random.js";
import { bunkerCapacity } from "./setup.js";
import {
  expulsionSchedule,
  legalRevealCategories,
  nextActiveClockwise,
  shouldStartOvertime,
} from "./rules.js";

export type CharacterState = Readonly<{
  id: string;
  controllerId: string;
  seat: number;
  status: "active" | "exiled" | "dead" | "survivor";
  hand: readonly Card[];
  revealedCardIds: ReadonlySet<string>;
  specialConditionPlayed: boolean;
}>;

export type EnginePhase =
  | "round-selection"
  | "round-speech"
  | "round-discussion"
  | "round-voting"
  | "tie-defense"
  | "runoff-voting"
  | "overtime-selection"
  | "overtime-speech"
  | "overtime-discussion"
  | "overtime-voting"
  | "final"
  | "complete";
export type GameState = Readonly<{
  gameId: string;
  seed: string;
  version: number;
  humanParticipantCountAtGameStart: number;
  characterCountAtStart: number;
  capacity: number;
  phase: EnginePhase;
  baseRound: number;
  overtimeAttempt: number;
  starterCharacterId: string;
  activeCharacterId: string;
  characters: readonly CharacterState[];
  revealedPairIndexes: ReadonlySet<number>;
  schedule: readonly number[];
  processedCommands: ReadonlyMap<string, Readonly<{ version: number }>>;
  audit: readonly string[];
}>;

export type EngineCommand = Readonly<{
  commandId: string;
  gameId: string;
  expectedVersion: number;
}>;

export const createGameState = (
  input: Readonly<{
    gameId: string;
    seed: string;
    humanParticipantCount: number;
    characters: readonly CharacterState[];
    starterCharacterId: string;
  }>,
): GameState => ({
  gameId: input.gameId,
  seed: input.seed,
  version: 0,
  humanParticipantCountAtGameStart: input.humanParticipantCount,
  characterCountAtStart: input.characters.length,
  capacity: bunkerCapacity(input.characters.length),
  phase: "round-selection",
  baseRound: 1,
  overtimeAttempt: 0,
  starterCharacterId: input.starterCharacterId,
  activeCharacterId: input.starterCharacterId,
  characters: input.characters,
  revealedPairIndexes: new Set(),
  schedule: expulsionSchedule(input.characters.length),
  processedCommands: new Map(),
  audit: [],
});

const authorizeCommand = (
  state: GameState,
  command: EngineCommand,
): Readonly<{ duplicate: boolean }> => {
  if (command.gameId !== state.gameId) throw new Error("STALE_GAME");
  if (state.processedCommands.has(command.commandId))
    return { duplicate: true };
  if (command.expectedVersion !== state.version) throw new Error("STALE_STATE");
  return { duplicate: false };
};

const commit = (
  state: GameState,
  command: EngineCommand,
  change: Omit<Partial<GameState>, "version" | "processedCommands">,
  action: string,
): GameState => {
  const version = state.version + 1;
  return {
    ...state,
    ...change,
    version,
    processedCommands: new Map(state.processedCommands).set(command.commandId, {
      version,
    }),
    audit: [...state.audit, `${version}:${command.commandId}:${action}`],
  };
};

export const revealOrdinaryCard = (
  state: GameState,
  command: EngineCommand & Readonly<{ characterId: string; cardId?: string }>,
  random: RandomSource,
): GameState => {
  if (authorizeCommand(state, command).duplicate) return state;
  if (state.phase !== "round-selection" && state.phase !== "overtime-selection")
    throw new Error("INVALID_PHASE");
  if (command.characterId !== state.activeCharacterId)
    throw new Error("FORBIDDEN");
  const character = state.characters.find(
    ({ id }) => id === command.characterId,
  );
  if (!character || character.status !== "active")
    throw new Error("INVALID_TARGET");
  const hidden = character.hand.filter(
    (card) =>
      card.type === "character" && !character.revealedCardIds.has(card.id),
  );
  const categories = legalRevealCategories(
    state.phase === "round-selection" ? state.baseRound : 0,
    hidden.map((card) => card.category ?? ""),
  );
  const legal = hidden.filter(
    (card) =>
      card.type === "character" && categories.includes(card.category ?? ""),
  );
  if (legal.length === 0)
    return commit(
      state,
      command,
      {
        phase:
          state.phase === "round-selection"
            ? "round-speech"
            : "overtime-speech",
      },
      "selection-with-no-hidden-card",
    );
  const selected = command.cardId
    ? legal.find(({ id }) => id === command.cardId)
    : choose(legal, random);
  if (!selected) throw new Error("INVALID_CARD");
  const characters = state.characters.map((entry) =>
    entry.id === character.id
      ? {
          ...entry,
          revealedCardIds: new Set(entry.revealedCardIds).add(selected.id),
        }
      : entry,
  );
  return commit(
    state,
    command,
    {
      characters,
      phase:
        state.phase === "round-selection" ? "round-speech" : "overtime-speech",
    },
    `reveal:${selected.id}`,
  );
};

export const exileCharacter = (
  state: GameState,
  command: EngineCommand & Readonly<{ characterId: string }>,
): GameState => {
  if (authorizeCommand(state, command).duplicate) return state;
  const target = state.characters.find(({ id }) => id === command.characterId);
  if (!target || target.status !== "active") throw new Error("INVALID_TARGET");
  const ordinaryIds = target.hand
    .filter((card) => card.type === "character")
    .map(({ id }) => id);
  const characters = state.characters.map((entry) =>
    entry.id === target.id
      ? {
          ...entry,
          status: "exiled" as const,
          revealedCardIds: new Set([...entry.revealedCardIds, ...ordinaryIds]),
        }
      : entry,
  );
  return commit(state, command, { characters }, `exile:${target.id}`);
};

export const advanceRound = (
  state: GameState,
  command: EngineCommand,
): GameState => {
  if (authorizeCommand(state, command).duplicate) return state;
  const activeCount = state.characters.filter(
    ({ status }) => status === "active",
  ).length;
  if (state.baseRound < 5) {
    const starter = nextActiveClockwise(
      state.characters.map(({ id }) => id),
      state.starterCharacterId,
      new Set(
        state.characters
          .filter(({ status }) => status !== "active")
          .map(({ id }) => id),
      ),
    );
    return commit(
      state,
      command,
      {
        baseRound: state.baseRound + 1,
        starterCharacterId: starter,
        activeCharacterId: starter,
        phase: "round-selection",
      },
      "next-base-round",
    );
  }
  if (shouldStartOvertime(state.baseRound, activeCount, state.capacity)) {
    return commit(
      state,
      command,
      {
        overtimeAttempt: state.overtimeAttempt + 1,
        phase: "overtime-selection",
      },
      "next-overtime",
    );
  }
  return commit(state, command, { phase: "final" }, "start-final");
};

export const createRematch = (
  state: GameState,
  newGameId: string,
  newSeed: string,
  characters: readonly CharacterState[],
): GameState => {
  if (newGameId === state.gameId || newSeed === state.seed)
    throw new Error("Rematch requires fresh identity and seed");
  return createGameState({
    gameId: newGameId,
    seed: newSeed,
    humanParticipantCount: state.humanParticipantCountAtGameStart,
    characters,
    starterCharacterId: characters[0]?.id ?? "",
  });
};

export type ViewerProjection = Readonly<{
  gameId: string;
  version: number;
  characters: readonly Readonly<{
    id: string;
    status: CharacterState["status"];
    revealedCards: readonly Card[];
    concealedCardCount: number;
    privateHand?: readonly Card[];
  }>[];
}>;

export const projectForViewer = (
  state: GameState,
  participantId?: string,
): ViewerProjection => ({
  gameId: state.gameId,
  version: state.version,
  characters: state.characters.map((character) => ({
    id: character.id,
    status: character.status,
    revealedCards: character.hand.filter(({ id }) =>
      character.revealedCardIds.has(id),
    ),
    concealedCardCount: character.hand.filter(
      ({ id }) => !character.revealedCardIds.has(id),
    ).length,
    ...(character.controllerId === participantId
      ? { privateHand: character.hand }
      : {}),
  })),
});
