import { describe, expect, test } from "vitest";
import {
  SeededRandom,
  allocations,
  castVote,
  claimExtraCharacter,
  closeBallot,
  createBallot,
  createBunkerPartyPack,
  createGameState,
  createLobbyAllocation,
  dealGame,
  projectForViewer,
  revealOrdinaryCard,
  validatePack,
  type CharacterState,
} from "../src/index.js";

const categories = [
  "profession",
  "biology",
  "health",
  "hobby",
  "baggage",
  "fact",
] as const;

describe("deterministic domain primitives", () => {
  test("serializes fill-to-six claims and makes duplicate command retries stable", () => {
    let lobby = createLobbyAllocation(
      [
        "participant_0001",
        "participant_0002",
        "participant_0003",
        "participant_0004",
      ],
      true,
    );
    const [afterFirst, accepted] = claimExtraCharacter(
      lobby,
      "participant_0001",
      "command_0001",
    );
    lobby = afterFirst;
    const [afterDuplicate, duplicate] = claimExtraCharacter(
      lobby,
      "participant_0001",
      "command_0001",
    );
    expect(accepted.ok).toBe(true);
    expect(duplicate).toMatchObject({
      ok: true,
      duplicate: true,
      version: accepted.version,
    });
    expect(afterDuplicate).toBe(lobby);
    const [afterSecond] = claimExtraCharacter(
      lobby,
      "participant_0002",
      "command_0002",
    );
    const [, rejected] = claimExtraCharacter(
      afterSecond,
      "participant_0003",
      "command_0003",
    );
    expect(rejected).toMatchObject({
      ok: false,
      code: "EXTRA_CHARACTER_UNAVAILABLE",
    });
    expect(
      allocations(afterSecond).flatMap(({ characterIds }) => characterIds),
    ).toHaveLength(6);
  });

  test("closes zero-vote ballot as a tie across every active candidate", () => {
    const ballot = createBallot(
      ["character_0001", "character_0002"],
      ["character_0001", "character_0002"],
    );
    expect(closeBallot(ballot, 3, 2)).toMatchObject({
      kind: "allowed-tie",
      tiedIds: ["character_0001", "character_0002"],
    });
  });

  test("allows changing a hidden ballot until it is resolved", () => {
    let ballot = createBallot(
      ["character_0001"],
      ["character_0001", "character_0002"],
    );
    ballot = castVote(ballot, "character_0001", "character_0001");
    ballot = castVote(ballot, "character_0001", "character_0002");
    expect(closeBallot(ballot, 6, 2)).toMatchObject({
      kind: "expelled",
      characterId: "character_0002",
    });
  });

  test("deals the same unique cards for the same seed", () => {
    const pack = createBunkerPartyPack();
    const characterIds = Array.from(
      { length: 6 },
      (_, index) => `character_${String(index + 1).padStart(4, "0")}`,
    );
    const first = dealGame(
      characterIds,
      pack.cards,
      categories,
      new SeededRandom("seed"),
    );
    const second = dealGame(
      characterIds,
      pack.cards,
      categories,
      new SeededRandom("seed"),
    );
    expect([...first.hands]).toEqual([...second.hands]);
    const dealt = [...first.hands.values()].flat().map(({ id }) => id);
    expect(new Set(dealt).size).toBe(dealt.length);
    expect(validatePack(pack)).toMatchObject({
      valid: true,
      compatibleCharacterCounts: expect.arrayContaining([15]),
    });
  });

  test("manual reveal and expiry retry cannot reveal two cards", () => {
    const pack = createBunkerPartyPack();
    const hand = categories.map(
      (category) =>
        pack.cards.find(
          (card) => card.type === "character" && card.category === category,
        ) as (typeof pack.cards)[number],
    );
    const character: CharacterState = {
      id: "character_0001",
      controllerId: "participant_0001",
      seat: 0,
      status: "active",
      hand,
      revealedCardIds: new Set(),
      specialConditionPlayed: false,
    };
    const companions = Array.from(
      { length: 5 },
      (_, index): CharacterState => ({
        ...character,
        id: `character_${String(index + 2).padStart(4, "0")}`,
        controllerId: `participant_${String(index + 2).padStart(4, "0")}`,
        seat: index + 1,
      }),
    );
    const state = createGameState({
      gameId: "game_0001",
      seed: "seed",
      humanParticipantCount: 6,
      characters: [character, ...companions],
      starterCharacterId: character.id,
    });
    const command = {
      commandId: "command_0001",
      gameId: state.gameId,
      expectedVersion: state.version,
      characterId: character.id,
    };
    const once = revealOrdinaryCard(state, command, new SeededRandom("seed"));
    const twice = revealOrdinaryCard(once, command, new SeededRandom("other"));
    expect(twice).toBe(once);
    expect(once.characters[0]?.revealedCardIds.size).toBe(1);
  });

  test("viewer projection exposes only controlled private hands", () => {
    const state = createGameState({
      gameId: "game_0001",
      seed: "seed",
      humanParticipantCount: 6,
      starterCharacterId: "character_0001",
      characters: [
        "participant_0001",
        "participant_0002",
        "participant_0003",
        "participant_0004",
        "participant_0005",
        "participant_0006",
      ].map((controllerId, index) => ({
        id: `character_${String(index + 1).padStart(4, "0")}`,
        controllerId,
        seat: index,
        status: "active" as const,
        hand: [],
        revealedCardIds: new Set<string>(),
        specialConditionPlayed: false,
      })),
    });
    const projection = projectForViewer(state, "participant_0001");
    expect(projection.characters[0]).toHaveProperty("privateHand");
    expect(projection.characters[1]).not.toHaveProperty("privateHand");
  });
});
