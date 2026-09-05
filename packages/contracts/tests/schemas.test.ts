import { describe, expect, it } from "vitest";
import {
  PACK_LIMITS,
  commandAckSchema,
  clientCommandSchemas,
  customPackImportSchema,
  errorCodeSchema,
  finalStateSchema,
  gameSettingsSchema,
  publicGameSnapshotSchema,
  roomSnapshotSchema,
  socketHandshakeAuthSchema,
  uploadedAvatarSchema
} from "../src/index.js";

describe("security boundaries", () => {
  it("does not permit private cards in a public character projection", () => {
    const result = publicGameSnapshotSchema.safeParse({
      gameId: "game_12345678", version: 1, phase: "round-selection", baseRound: 1, overtimeAttempt: 0,
      capacity: 3, starterCharacterId: null, activeCharacterId: null, scheduledExilesThisRound: 1, remainingExiles: 2,
      characters: [{ characterId: "char_12345678", controller: null, seat: 0, status: "active", revealedCards: [], concealedCardCount: 7, specialConditionPlayed: false, cards: ["secret"] }],
      revealedBunkerCards: [], revealedThreatCards: [], revealedCatastrophe: null,
      deadlines: { selection: null, speech: null, discussion: null, voting: null, tieDefense: null },
      ballot: null, tiedCharacterIds: [], outcome: null
    });
    expect(result.success).toBe(false);
  });

  it("rejects oversized uploaded avatars", () => {
    expect(uploadedAvatarSchema.safeParse({ kind: "uploaded", mimeType: "image/png", bytes: 256_001, dataUrl: "data:image/png;base64,AAAA" }).success).toBe(false);
  });

  it("requires the exact protocol version in socket auth", () => {
    expect(socketHandshakeAuthSchema.safeParse({ protocolVersion: "v2", reconnectToken: "x".repeat(32) }).success).toBe(false);
  });

  it("requires a current game ID for game and rematch commands", () => {
    const common = { protocolVersion: "bunker-party-v1", commandId: "command_12345678", roomId: "room_12345678", expectedVersion: 4 };
    expect(clientCommandSchemas["game:end-discussion"].safeParse(common).success).toBe(false);
    expect(clientCommandSchemas["game:end-discussion"].safeParse({ ...common, gameId: "game_12345678" }).success).toBe(true);
  });
});

describe("stable transport contracts", () => {
  it("accepts every configured room capacity from 3 through 15", () => {
    const base = {
      fillToSix: false,
      mode: "base",
      finalGoal: "salvation",
      timers: { selection: null, speech: null, discussion: null, voting: null },
      tiePolicy: "participant-count-v1",
      overtimePolicy: "single-attempt-until-capacity-v1",
      selectedPackIds: ["pack_general_v1"],
      characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact"]
    };
    for (let maxParticipants = 3; maxParticipants <= 15; maxParticipants += 1) {
      expect(gameSettingsSchema.safeParse({ ...base, maxParticipants }).success).toBe(true);
    }
    expect(gameSettingsSchema.safeParse({ ...base, maxParticipants: 2 }).success).toBe(false);
    expect(gameSettingsSchema.safeParse({ ...base, maxParticipants: 16 }).success).toBe(false);
    expect(gameSettingsSchema.safeParse({ ...base, maxParticipants: 8.5 }).success).toBe(false);
  });

  it("exposes only safe viewer character IDs for lobby release commands", () => {
    expect(roomSnapshotSchema.shape.viewerControlledCharacterIds.parse(["char_primary_1", "char_extra_123"])).toEqual(["char_primary_1", "char_extra_123"]);
    expect(roomSnapshotSchema.shape.viewerControlledCharacterIds.safeParse([{ characterId: "char_extra_123", cards: ["secret"] }]).success).toBe(false);
  });

  it("models guided Survival Story progress without accepting hidden cards", () => {
    const state = {
      mode: "survival-story",
      goal: "salvation",
      stage: "bunker-threat",
      currentSubjectCardId: "card_subject_1",
      currentGroup: "bunker",
      utilityVote: {
        subjectCardId: "card_subject_1",
        eligibleParticipantIds: ["participant_1"],
        castParticipantIds: [],
        usefulVotes: 0,
        notUsefulVotes: 0,
        resolvedUseful: null
      },
      groupProgress: [{
        group: "bunker",
        threatCardId: "card_threat_1",
        attempt: 0,
        requiredUsefulCards: 3,
        usefulCardIds: [],
        survivorCharacterIds: ["character_1"],
        defeated: null
      }],
      outcome: null
    };
    expect(finalStateSchema.safeParse(state).success).toBe(true);
    expect(finalStateSchema.safeParse({ ...state, hiddenCards: ["card_secret_1"] }).success).toBe(false);
  });

  it("accepts machine-readable failure acknowledgements", () => {
    const parsed = commandAckSchema.parse({ ok: false, protocolVersion: "bunker-party-v1", error: { code: "STALE_STATE", message: "Refresh" } });
    expect(parsed.ok).toBe(false);
    expect(errorCodeSchema.parse("STALE_STATE")).toBe("STALE_STATE");
  });

  it("rejects a custom card whose provenance points at another pack", () => {
    const result = customPackImportSchema.safeParse({
      serializedBytes: 400,
      pack: {
        schemaVersion: 1, id: "pack_12345678", rulesProfileId: "bunker-party-v1", kind: "addon", name: "Test",
        cards: [{ id: "card_12345678", sourcePackId: "pack_87654321", type: "character", category: "profession", title: { en: "Medic" } }]
      }
    });
    expect(result.success).toBe(false);
  });

  it("publishes explicit import size limits", () => {
    expect(PACK_LIMITS.maxCards).toBe(1_000);
    expect(PACK_LIMITS.maxJsonBytes).toBe(1_000_000);
  });
});
