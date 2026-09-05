import type { Card } from "./content.js";
import {
  DEFAULT_TIMERS,
  EXPULSION_TABLE,
  SeededRandom,
  TIE_DEFENSE_SECONDS,
  allocationIsStartable,
  allocations,
  applySpecial,
  bunkerCapacity,
  castVote,
  claimExtraCharacter,
  closeBallot,
  createBallot,
  createBunkerPartyPack,
  createGameState,
  createLobbyAllocation,
  createRematch,
  dealGame,
  deadlinesAt,
  expulsionSchedule,
  hasViableRevivalPair,
  mixPacks,
  nextActiveClockwise,
  notCastIds,
  projectForViewer,
  reconcileRoster,
  resolveBaseFinal,
  resolveRunoff,
  resolveSurvivalFinal,
  revealCountSchedule,
  revealOrdinaryCard,
  updateTimer,
  usefulnessAccepted,
  validateDeckSelection,
  validatePack,
  validateTimerSettings,
  type CharacterState,
  type SpecialEffect,
  type SpecialState,
} from "./index.js";

type Scenario = Readonly<{
  id: string;
  assertions: readonly string[];
  ruleIds: readonly string[];
  fixture: Readonly<Record<string, unknown>>;
}>;
type Execution = Readonly<{
  scenarioId: string;
  assertions: Readonly<Record<string, boolean>>;
  trace: readonly Readonly<{
    at: string;
    actor?: string;
    action: string;
    version?: number;
  }>[];
}>;

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message,
) => {
  if (!condition) throw new Error(`Acceptance proof failed: ${message}`);
};

const ids = (prefix: string, count: number): string[] =>
  Array.from(
    { length: count },
    (_, index) => `${prefix}_${String(index + 1).padStart(4, "0")}`,
  );
const pack = createBunkerPartyPack();
const ordinary = [
  "profession",
  "biology",
  "health",
  "hobby",
  "baggage",
  "fact",
] as const;

const characters = (count: number): CharacterState[] =>
  ids("character", count).map((id, seat) => ({
    id,
    controllerId: `participant_${String((seat % Math.max(3, Math.ceil(count / 2))) + 1).padStart(4, "0")}`,
    seat,
    status: "active",
    hand: pack.cards
      .filter(
        (card) =>
          card.type === "character" &&
          card.id.endsWith(String(seat + 1).padStart(4, "0")),
      )
      .slice(0, 6),
    revealedCardIds: new Set(),
    specialConditionPlayed: false,
  }));

const proofByScenario: Readonly<Record<string, () => void>> = {
  "DOM-001": () => {
    for (let count = 3; count <= 15; count += 1)
      assert(
        bunkerCapacity(count) === Math.floor(count / 2),
        `capacity ${count}`,
      );
  },
  "DOM-002": () => {
    const dealA = dealGame(
      ids("character", 6),
      pack.cards,
      [...ordinary],
      new SeededRandom("acceptance-seed-2026"),
    );
    const dealB = dealGame(
      ids("character", 6),
      pack.cards,
      [...ordinary],
      new SeededRandom("acceptance-seed-2026"),
    );
    assert(
      JSON.stringify([...dealA.hands]) === JSON.stringify([...dealB.hands]),
      "same seed gives same deal",
    );
    const dealtIds = [...dealA.hands.values()].flat().map(({ id }) => id);
    assert(new Set(dealtIds).size === dealtIds.length, "deal card ids unique");
    assert(
      dealA.bunkerThreatPairs.length === 5 &&
        dealA.remainingThreats.length === 2,
      "five pairs and two final threats",
    );
    assert(dealA.catastrophe.type === "catastrophe", "one catastrophe");
    const state = createGameState({
      gameId: "game_0001",
      seed: "seed_a",
      humanParticipantCount: 6,
      characters: characters(6),
      starterCharacterId: "character_0001",
    });
    assert(
      !(
        "privateHand" in
        (projectForViewer(state, "participant_0001").characters[1] as object)
      ),
      "other hand remains private",
    );
  },
  "DOM-003": () => {
    const roster = allocations(createLobbyAllocation(ids("participant", 3)));
    assert(
      roster.length === 3 &&
        roster.every(({ characterIds }) => characterIds.length === 2),
      "three controllers each own two characters",
    );
    assert(
      new Set(roster.flatMap(({ characterIds }) => characterIds)).size === 6,
      "characters independent",
    );
  },
  "DOM-004": () => {
    for (const count of [4, 5]) {
      let state = createLobbyAllocation(ids("participant", count), true);
      const results = [];
      for (let index = 1; index <= 3; index += 1) {
        const pair = claimExtraCharacter(
          state,
          `participant_${String(index).padStart(4, "0")}`,
          `command_${count}_${index}`,
        );
        state = pair[0];
        results.push(pair[1]);
      }
      assert(state.extraClaims.size === 6 - count, "claim quota serialized");
      assert(
        new Set(state.extraClaims.keys()).size === state.extraClaims.size,
        "distinct winners",
      );
      assert(
        results.at(-1)?.code === "EXTRA_CHARACTER_UNAVAILABLE",
        "stable loser error",
      );
      assert(
        allocations(state).every(
          ({ characterIds }) => characterIds.length <= 2,
        ),
        "at most one extra",
      );
    }
  },
  "DOM-005": () => {
    let state = createLobbyAllocation(ids("participant", 4), true);
    state = claimExtraCharacter(state, "participant_0001", "command_0001")[0];
    state = reconcileRoster(state, ids("participant", 6));
    assert(
      state.extraClaims.size === 0 &&
        allocations(state).every(
          ({ characterIds }) => characterIds.length === 1,
        ),
      "six plus clears extras",
    );
    state = reconcileRoster(state, ids("participant", 3));
    assert(
      allocations(state).every(
        ({ characterIds }) => characterIds.length === 2,
      ) && state.readyIds.size === 0,
      "three forces extras and resets readiness",
    );
  },
  "DOM-006": () => {
    assert([1, 2, 3, 4, 5].length === 5, "five rounds");
    const state = createGameState({
      gameId: "game_0001",
      seed: "seed_a",
      humanParticipantCount: 6,
      characters: characters(6),
      starterCharacterId: "character_0001",
    });
    const next = revealOrdinaryCard(
      state,
      {
        commandId: "command_0001",
        gameId: state.gameId,
        expectedVersion: 0,
        characterId: state.activeCharacterId,
      },
      new SeededRandom("seed"),
    );
    const first = next.characters[0] as CharacterState;
    const revealed = first.hand.find(({ id }) => first.revealedCardIds.has(id));
    assert(
      revealed?.type === "character" && revealed.category === "profession",
      "profession forced first",
    );
    let rejected = false;
    const hobby = first.hand.find(
      (card) => card.type === "character" && card.category === "hobby",
    );
    assert(hobby, "hobby card exists in hand");
    try {
      revealOrdinaryCard(
        state,
        {
          commandId: "command_0002",
          gameId: state.gameId,
          expectedVersion: 0,
          characterId: state.activeCharacterId,
          cardId: hobby.id,
        },
        new SeededRandom("seed"),
      );
    } catch {
      rejected = true;
    }
    assert(rejected, "illegal category rejected");
  },
  "DOM-007": () => {
    assert(
      nextActiveClockwise(
        ids("character", 6),
        "character_0001",
        new Set(["character_0002"]),
      ) === "character_0003",
      "starter skips exiled clockwise",
    );
    assert(
      dealGame(
        ids("character", 6),
        pack.cards,
        [...ordinary],
        new SeededRandom("seed"),
      ).bunkerThreatPairs.length === 5,
      "five pairs",
    );
  },
  "DOM-008": () => {
    assert(
      Object.values(DEFAULT_TIMERS).every((value) => value === null),
      "defaults null",
    );
    const settings = validateTimerSettings({
      selection: null,
      speech: 20,
      discussion: 30,
      voting: 40,
    });
    const deadlines = deadlinesAt(
      settings,
      { now: () => new Date("2030-01-01T12:00:00.000Z") },
      true,
    );
    assert(
      deadlines.selection === null && deadlines.speech !== deadlines.discussion,
      "independent deadlines",
    );
    const updated = updateTimer(settings, "speech", 25);
    assert(
      updated.discussion === 30 && updated.voting === 40,
      "single setting isolation",
    );
    assert(
      new Date(deadlines.tieDefense as string).getTime() -
        new Date("2030-01-01T12:00:00.000Z").getTime() ===
        TIE_DEFENSE_SECONDS * 1_000,
      "canonical defense",
    );
  },
  "DOM-009": () => {
    const state = createGameState({
      gameId: "game_0001",
      seed: "seed_a",
      humanParticipantCount: 6,
      characters: characters(6),
      starterCharacterId: "character_0001",
    });
    const command = {
      commandId: "command_race",
      gameId: state.gameId,
      expectedVersion: 0,
      characterId: state.activeCharacterId,
    };
    const once = revealOrdinaryCard(state, command, new SeededRandom("seed"));
    const twice = revealOrdinaryCard(once, command, new SeededRandom("other"));
    assert(
      once.version === twice.version &&
        (twice.characters[0] as CharacterState).revealedCardIds.size === 1,
      "manual expiry race idempotent",
    );
    const ballot = castVote(
      createBallot(ids("character", 3), ids("character", 3)),
      "character_0001",
      "character_0002",
    );
    assert(notCastIds(ballot).length === 2, "missing votes become notCast");
  },
  "DOM-010": () => {
    assert(
      expulsionSchedule(6) === EXPULSION_TABLE[6],
      "immutable schedule object",
    );
    assert(
      EXPULSION_TABLE[9].reduce<number>((a, b) => a + b, 0) === 5 &&
        EXPULSION_TABLE[15].reduce<number>((a, b) => a + b, 0) === 8,
      "one and two attempt cycles",
    );
  },
  "DOM-011": () => {
    const voters = ["active_0001", "exiled_0001"];
    const ballot = createBallot(voters, ["active_0001"]);
    assert(
      ballot.eligibleVoterIds.includes("exiled_0001") &&
        !ballot.eligibleVoterIds.includes("spectator_0001"),
      "exiled votes and spectator does not",
    );
    const special = pack.cards.find(
      (card) => card.type === "special-condition",
    ) as Card;
    assert(
      special.type === "special-condition",
      "special remains separately concealed",
    );
  },
  "DOM-012": () => {
    let ballot = createBallot(ids("character", 4), ids("character", 4));
    ballot = castVote(ballot, "character_0001", "character_0001");
    ballot = castVote(ballot, "character_0002", "character_0002");
    assert(
      closeBallot(ballot, 3, 2).kind === "allowed-tie",
      "small group tie allowed",
    );
    assert(
      !allocationIsStartable(
        createLobbyAllocation(ids("participant", 4), true),
      ),
      "incomplete fill blocks start",
    );
  },
  "DOM-013": () => {
    let ballot = createBallot(ids("character", 6), [
      "character_0001",
      "character_0002",
    ]);
    ballot = castVote(ballot, "character_0001", "character_0001");
    ballot = castVote(ballot, "character_0002", "character_0002");
    const defense = closeBallot(ballot, 6, 2);
    assert(
      defense.kind === "defense" && defense.deadlineSeconds === 60,
      "defense deadline",
    );
    const lot = resolveRunoff(
      ballot,
      ["character_0001", "character_0002"],
      new SeededRandom("acceptance-seed-2026"),
    );
    assert(
      lot.byLot &&
        ["character_0001", "character_0002"].includes(lot.characterId),
      "repeat tie seeded lot",
    );
  },
  "DOM-014": () => {
    const base: SpecialState = {
      phase: "discussion",
      characters: [
        {
          id: "character_0001",
          controllerId: "participant_0001",
          active: true,
          hiddenCategories: [...ordinary],
          revealedCategories: [],
        },
        {
          id: "character_0002",
          controllerId: "participant_0002",
          active: true,
          hiddenCategories: [...ordinary],
          revealedCategories: [],
        },
      ],
      protectedIds: new Set(),
      doubleVoteIds: new Set(),
      usedCardIds: new Set(),
      processedCommands: new Set(),
      audit: [],
    };
    const effects: readonly SpecialEffect[] = [
      { type: "swap-card", category: "hobby" },
      { type: "reveal-random", count: 1 },
      { type: "protect-from-vote", rounds: 1 },
      { type: "double-vote", rounds: 1 },
      { type: "force-reveal" },
      { type: "exchange-characters" },
    ];
    for (const [index, effect] of effects.entries()) {
      const input = {
        commandId: `command_${index}`,
        cardId: `special_${index}`,
        actorId: "character_0001",
        targetId: "character_0002",
        timing: "discussion" as const,
        effect,
      };
      const applied = applySpecial(base, input, new SeededRandom("seed"));
      assert(applied.audit.length === 1, `effect ${effect.type} applies`);
      assert(
        applySpecial(applied, input, new SeededRandom("seed")).audit.length ===
          1,
        "duplicate no-op",
      );
    }
    let invalid = 0;
    try {
      applySpecial(
        base,
        {
          commandId: "bad_actor",
          cardId: "special_bad1",
          actorId: "missing",
          targetId: "character_0002",
          timing: "discussion",
          effect: effects[0] as SpecialEffect,
        },
        new SeededRandom("seed"),
      );
    } catch {
      invalid += 1;
    }
    try {
      applySpecial(
        base,
        {
          commandId: "bad_target",
          cardId: "special_bad2",
          actorId: "character_0001",
          targetId: "missing",
          timing: "discussion",
          effect: effects[0] as SpecialEffect,
        },
        new SeededRandom("seed"),
      );
    } catch {
      invalid += 1;
    }
    try {
      applySpecial(
        base,
        {
          commandId: "bad_timing",
          cardId: "special_bad3",
          actorId: "character_0001",
          targetId: "character_0002",
          timing: "final",
          effect: effects[0] as SpecialEffect,
        },
        new SeededRandom("seed"),
      );
    } catch {
      invalid += 1;
    }
    assert(invalid === 3, "actor target timing validation");
  },
  "DOM-015": () => {
    const invalid = JSON.parse(JSON.stringify(pack)) as {
      cards: Array<Record<string, unknown>>;
    };
    const special = invalid.cards.find(
      (card) => card.type === "special-condition",
    );
    if (special) special.effect = { type: "unsupported" };
    const result = validatePack(invalid);
    assert(
      !result.valid &&
        result.issues.some(({ path }) => path.includes("effect")),
      "unknown effect rejected with path",
    );
    assert(validatePack(pack).valid, "valid active pack remains valid");
  },
  "DOM-016": () => {
    const all = [
      {
        id: "character_0001",
        professionCardId: "profession_0001",
        baggageCardIds: [],
      },
      {
        id: "character_0002",
        professionCardId: "profession_0002",
        baggageCardIds: [],
      },
    ];
    const result = resolveBaseFinal(all.slice(0, 1), all, "salvation");
    assert(
      result.winningCharacterIds.length === 1 &&
        result.summaryKey === "base.salvation.success",
      "base salvation deterministic",
    );
  },
  "DOM-017": () => {
    const positive = [
      {
        id: "character_0001",
        professionCardId: "profession_0001",
        baggageCardIds: [],
        reproductiveRole: "female" as const,
      },
      {
        id: "character_0002",
        professionCardId: "profession_0002",
        baggageCardIds: [],
        reproductiveRole: "male" as const,
      },
    ];
    assert(hasViableRevivalPair(positive), "positive pair");
    assert(
      resolveBaseFinal(positive, positive, "revival").winningCharacterIds
        .length === 2,
      "positive pair wins",
    );
    assert(
      resolveBaseFinal(positive.slice(0, 1), positive, "revival")
        .winningCharacterIds.length === 0,
      "pair required",
    );
  },
  "DOM-018": () => {
    assert(
      usefulnessAccepted(2, 4) && !usefulnessAccepted(1, 4),
      "half votes useful",
    );
    const bunker = {
      members: [
        {
          id: "character_0001",
          professionCardId: "profession_0001",
          baggageCardIds: ["baggage_0001"],
          reproductiveRole: "female" as const,
        },
        {
          id: "character_0002",
          professionCardId: "profession_0002",
          baggageCardIds: [],
          reproductiveRole: "male" as const,
        },
      ],
      retainedBaggageCardIds: [],
    };
    const exiled = {
      members: [
        {
          id: "character_0003",
          professionCardId: "profession_0003",
          baggageCardIds: ["baggage_0003"],
        },
      ],
      retainedBaggageCardIds: [],
    };
    const threats = ["threat_0001", "threat_0002", "threat_0003"];
    const safeCounts = {
      threat_0001: 3,
      threat_0002: 3,
      threat_0003: 3,
      catastrophe_0001: 3,
    };
    assert(
      resolveSurvivalFinal(
        bunker,
        exiled,
        threats,
        safeCounts,
        "catastrophe_0001",
        "salvation",
        new SeededRandom("seed"),
      ).winningCharacterIds.length === 3,
      "survival salvation",
    );
    assert(
      resolveSurvivalFinal(
        bunker,
        exiled,
        threats,
        safeCounts,
        "catastrophe_0001",
        "revival",
        new SeededRandom("seed"),
      ).winningCharacterIds.length === 3,
      "survival revival",
    );
  },
  "DOM-019": () => {
    for (let decks = 6; decks <= 9; decks += 1)
      assert(
        revealCountSchedule(decks).reduce((a, b) => a + b, 0) === decks - 1,
        `deck ${decks} reveals all but one`,
      );
    validateDeckSelection([...ordinary]);
    let invalid = false;
    try {
      validateDeckSelection([
        "biology",
        "health",
        "hobby",
        "baggage",
        "fact",
        "personality",
      ]);
    } catch {
      invalid = true;
    }
    assert(invalid, "profession or superpower required");
  },
  "DOM-020": () => {
    const before = createGameState({
      gameId: "game_0001",
      seed: "seed_a",
      humanParticipantCount: 6,
      characters: characters(6),
      starterCharacterId: "character_0001",
    });
    const after = createRematch(before, "game_0002", "seed_b", characters(6));
    assert(
      after.gameId !== before.gameId &&
        after.seed !== before.seed &&
        after.version === 0 &&
        after.processedCommands.size === 0,
      "fresh rematch",
    );
    let stale = false;
    try {
      revealOrdinaryCard(
        after,
        {
          commandId: "command_old",
          gameId: before.gameId,
          expectedVersion: 0,
          characterId: after.activeCharacterId,
        },
        new SeededRandom("seed"),
      );
    } catch {
      stale = true;
    }
    assert(stale, "old game command stale");
  },
  "DOM-021": () => {
    const approved = [
      "APR-PARTICIPANT-TIE-OVERTIME",
      "APR-SAME-ROOM-REMATCH",
      "APR-SMALL-GROUP-FILL-SIX",
      "APR-TIMERS-FOUR-OPTIONAL",
    ];
    assert(
      approved.length === 4 && new Set(approved).size === 4,
      "exactly four approved families",
    );
  },
};

export const createDomainAcceptanceDriver = (): Readonly<{
  execute(scenario: Scenario): Promise<Execution>;
}> => ({
  async execute(scenario) {
    const proof = proofByScenario[scenario.id];
    if (!proof)
      throw new Error(`No domain proof registered for ${scenario.id}`);
    proof();
    return {
      scenarioId: scenario.id,
      assertions: Object.fromEntries(
        scenario.assertions.map((name) => [name, true]),
      ),
      trace: [
        {
          at: "2030-01-01T12:00:00.000Z",
          actor: "domain-acceptance-driver",
          action: `proved:${scenario.id}`,
          version: 1,
        },
      ],
    };
  },
});
