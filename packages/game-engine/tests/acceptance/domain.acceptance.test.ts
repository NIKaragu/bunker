import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  customPackSchema,
  finalStateSchema,
  gameSettingsSchema,
  timerSettingsSchema,
} from "../../../contracts/src/index.js";
import {
  REQUIRED_ACCEPTANCE_CRITERIA,
  REQUIRED_RULE_IDS,
  acceptanceScenarios,
  assertExecution,
  scenariosFor,
  type DomainAcceptanceDriver,
} from "./acceptance-manifest.js";

const driverUrl = new URL("../../src/acceptance-driver.ts", import.meta.url);
const hasDriver = existsSync(fileURLToPath(driverUrl));
const behaviorTest = hasDriver ? test : test.todo;

const loadDriver = async (): Promise<DomainAcceptanceDriver> => {
  const module = (await import(driverUrl.href)) as { createDomainAcceptanceDriver: () => DomainAcceptanceDriver };
  return module.createDomainAcceptanceDriver();
};

describe("acceptance manifest integrity", () => {
  test("covers AC-01 through AC-17 with unique executable scenario IDs", () => {
    const ids = acceptanceScenarios.map(({ id }) => id);
    const covered = new Set(acceptanceScenarios.flatMap(({ acceptanceCriteria }) => acceptanceCriteria));
    expect(new Set(ids).size).toBe(ids.length);
    expect([...covered].sort()).toEqual([...REQUIRED_ACCEPTANCE_CRITERIA].sort());
    expect(acceptanceScenarios.every(({ behavior, assertions }) => behavior.length > 15 && assertions.length > 0)).toBe(true);
  });

  test("covers all required rule families and exactly the approved overrides", () => {
    const rules = new Set(acceptanceScenarios.flatMap(({ ruleIds }) => ruleIds));
    for (const ruleId of REQUIRED_RULE_IDS) expect(rules.has(ruleId)).toBe(true);
    expect([...rules].filter((ruleId) => ruleId.startsWith("APR-")).sort()).toEqual([
      "APR-PARTICIPANT-TIE-OVERTIME",
      "APR-R1-PROFESSION-OPTIONAL",
      "APR-SAME-ROOM-REMATCH",
      "APR-SMALL-GROUP-FILL-SIX",
      "APR-TIMERS-FOUR-OPTIONAL",
    ]);
  });
});

describe("contract-backed domain fixtures", () => {
  test("proves four timer defaults are independently nullable", () => {
    expect(timerSettingsSchema.parse({})).toEqual({ selection: null, speech: null, discussion: null, voting: null });
    expect(timerSettingsSchema.parse({ selection: 10, speech: null, discussion: 30, voting: 40 })).toEqual({ selection: 10, speech: null, discussion: 30, voting: 40 });
    expect(timerSettingsSchema.safeParse({ selection: 9, speech: null, discussion: null, voting: null }).success).toBe(false);
  });

  test("proves the only MVP tie and overtime policies are contract-fixed", () => {
    const result = gameSettingsSchema.safeParse({
      timers: {},
      selectedPackIds: ["pack_base"],
      characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact"],
      tiePolicy: "client-decides",
    });
    expect(result.success).toBe(false);
  });

  test("accepts every maxParticipants value from 3 through 15 and rejects the boundaries outside", () => {
    const base = {
      timers: {},
      selectedPackIds: ["pack_base"],
      characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact"],
    };
    for (let maxParticipants = 3; maxParticipants <= 15; maxParticipants += 1) {
      expect(gameSettingsSchema.safeParse({ ...base, maxParticipants }).success, String(maxParticipants)).toBe(true);
    }
    expect(gameSettingsSchema.safeParse({ ...base, maxParticipants: 2 }).success).toBe(false);
    expect(gameSettingsSchema.safeParse({ ...base, maxParticipants: 16 }).success).toBe(false);
  });

  test("finalState carries current subject and group progress but rejects hidden-card fields", () => {
    const visibleFinalState = {
      mode: "survival-story",
      goal: "salvation",
      stage: "bunker-threat",
      currentSubjectCardId: "card_subject_001",
      currentGroup: "bunker",
      utilityVote: {
        subjectCardId: "card_subject_001",
        eligibleParticipantIds: ["participant_001"],
        castParticipantIds: [],
        usefulVotes: 0,
        notUsefulVotes: 0,
        resolvedUseful: null,
      },
      groupProgress: [{
        group: "bunker",
        threatCardId: "card_threat_001",
        attempt: 1,
        requiredUsefulCards: 3,
        usefulCardIds: [],
        survivorCharacterIds: ["character_001"],
        defeated: null,
      }],
      outcome: null,
    };
    expect(finalStateSchema.safeParse(visibleFinalState).success).toBe(true);
    expect(finalStateSchema.safeParse({ ...visibleFinalState, hiddenCards: ["card_secret_001"] }).success).toBe(false);
  });

  test("rejects duplicate card IDs and cross-pack source IDs with path issues", () => {
    const card = {
      id: "card_0001",
      sourcePackId: "wrong_pack",
      title: { uk: "Професія", en: "Profession" },
      type: "character" as const,
      category: "profession" as const,
    };
    const result = customPackSchema.safeParse({
      schemaVersion: 1,
      id: "pack_base",
      rulesProfileId: "bunker-party-v1",
      kind: "base",
      name: "Acceptance",
      cards: [card, card],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some(({ path }) => path.join(".") === "cards.1.id")).toBe(true);
      expect(result.error.issues.some(({ path }) => path.join(".") === "cards.0.sourcePackId")).toBe(true);
    }
  });
});

describe("domain behavior acceptance", () => {
  for (const scenarioEntry of scenariosFor("domain")) {
    behaviorTest(`${scenarioEntry.id}: ${scenarioEntry.behavior}`, async () => {
      const driver = await loadDriver();
      assertExecution(scenarioEntry, await driver.execute(scenarioEntry));
    });
  }
});
