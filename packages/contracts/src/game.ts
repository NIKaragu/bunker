import { z } from "zod";
import { cardIdSchema, characterIdSchema, gameIdSchema, isoTimestampSchema, packIdSchema, participantIdSchema, stateVersionSchema } from "./primitives.js";
import { revealedCardSchema, privateCharacterHandSchema } from "./content.js";

export const gameModeSchema = z.enum(["base", "survival-story"]);
export const finalGoalSchema = z.enum(["salvation", "revival"]);
export const gamePhaseSchema = z.enum([
  "lobby", "dealing", "round-selection", "round-speech", "round-discussion", "round-voting",
  "tie-defense", "runoff-voting", "lot-resolution", "overtime-selection", "overtime-speech",
  "overtime-discussion", "overtime-voting", "final-usefulness-vote", "final-threat",
  "final-catastrophe", "complete", "post-game"
]);
export type GamePhase = z.infer<typeof gamePhaseSchema>;

export const timerKindSchema = z.enum(["selection", "speech", "discussion", "voting"]);
export const timerDurationSchema = z.number().int().min(10).max(3_600).nullable();
export const timerSettingsSchema = z.object({
  selection: timerDurationSchema.default(null), speech: timerDurationSchema.default(null),
  discussion: timerDurationSchema.default(null), voting: timerDurationSchema.default(null)
}).strict();
export const deadlineSetSchema = z.object({
  selection: isoTimestampSchema.nullable(), speech: isoTimestampSchema.nullable(),
  discussion: isoTimestampSchema.nullable(), voting: isoTimestampSchema.nullable(),
  tieDefense: isoTimestampSchema.nullable()
}).strict();

export const gameSettingsSchema = z.object({
  minParticipants: z.literal(3).default(3), maxParticipants: z.number().int().min(3).max(15).default(15),
  fillToSix: z.boolean().default(false), mode: gameModeSchema.default("base"),
  finalGoal: finalGoalSchema.default("salvation"), timers: timerSettingsSchema,
  tiePolicy: z.literal("participant-count-v1").default("participant-count-v1"),
  overtimePolicy: z.literal("single-attempt-until-capacity-v1").default("single-attempt-until-capacity-v1"),
  selectedPackIds: z.array(packIdSchema).min(1).max(20),
  characterDecks: z.array(z.string().min(1).max(50)).min(6).max(9)
}).strict();

export const controllerSummarySchema = z.object({ participantId: participantIdSchema, nickname: z.string().min(2).max(32), connected: z.boolean() }).strict();
export const publicCharacterSchema = z.object({
  characterId: characterIdSchema,
  controller: controllerSummarySchema.nullable(),
  seat: z.number().int().nonnegative().max(14),
  status: z.enum(["active", "exiled", "dead", "survivor"]),
  revealedCards: z.array(revealedCardSchema).max(16),
  concealedCardCount: z.number().int().nonnegative().max(16),
  specialConditionPlayed: z.boolean()
}).strict();

export const ballotSummarySchema = z.object({
  eligibleVoterIds: z.array(characterIdSchema).max(15),
  castVoterIds: z.array(characterIdSchema).max(15),
  notCastVoterIds: z.array(characterIdSchema).max(15),
  candidates: z.array(characterIdSchema).max(15),
  tally: z.record(z.string(), z.number().int().nonnegative()).optional()
}).strict();
export const finalOutcomeSchema = z.object({
  goal: finalGoalSchema,
  winningCharacterIds: z.array(characterIdSchema).max(15),
  losingCharacterIds: z.array(characterIdSchema).max(15),
  summaryKey: z.string().min(1).max(100)
}).strict();

export const finalStageSchema = z.enum([
  "not-started",
  "bunker-threat",
  "exiled-threat-one",
  "exiled-threat-two",
  "catastrophe",
  "resolved"
]);

export const finalUtilityVoteSchema = z.object({
  subjectCardId: cardIdSchema,
  eligibleParticipantIds: z.array(participantIdSchema).max(15),
  castParticipantIds: z.array(participantIdSchema).max(15),
  usefulVotes: z.number().int().nonnegative().max(15),
  notUsefulVotes: z.number().int().nonnegative().max(15),
  resolvedUseful: z.boolean().nullable()
}).strict();

export const finalGroupProgressSchema = z.object({
  group: z.enum(["bunker", "exiled", "combined"]),
  threatCardId: cardIdSchema.nullable(),
  attempt: z.number().int().min(0).max(2),
  requiredUsefulCards: z.literal(3),
  usefulCardIds: z.array(cardIdSchema).max(32),
  survivorCharacterIds: z.array(characterIdSchema).max(15),
  defeated: z.boolean().nullable()
}).strict();

export const finalStateSchema = z.object({
  mode: gameModeSchema,
  goal: finalGoalSchema,
  stage: finalStageSchema,
  currentSubjectCardId: cardIdSchema.nullable(),
  currentGroup: z.enum(["bunker", "exiled", "combined"]).nullable(),
  utilityVote: finalUtilityVoteSchema.nullable(),
  groupProgress: z.array(finalGroupProgressSchema).max(4),
  outcome: finalOutcomeSchema.nullable()
}).strict();
export type FinalState = z.infer<typeof finalStateSchema>;

export const publicGameSnapshotSchema = z.object({
  gameId: gameIdSchema,
  version: stateVersionSchema,
  phase: gamePhaseSchema,
  baseRound: z.number().int().min(0).max(5),
  overtimeAttempt: z.number().int().nonnegative().max(15),
  capacity: z.number().int().min(1).max(7),
  starterCharacterId: characterIdSchema.nullable(),
  activeCharacterId: characterIdSchema.nullable(),
  scheduledExilesThisRound: z.number().int().nonnegative().max(5),
  remainingExiles: z.number().int().nonnegative().max(14),
  characters: z.array(publicCharacterSchema).min(3).max(15),
  revealedBunkerCards: z.array(revealedCardSchema).max(5),
  revealedThreatCards: z.array(revealedCardSchema).max(7),
  revealedCatastrophe: revealedCardSchema.nullable(),
  deadlines: deadlineSetSchema,
  ballot: ballotSummarySchema.nullable(),
  tiedCharacterIds: z.array(characterIdSchema).max(15),
  outcome: finalOutcomeSchema.nullable(),
  finalState: finalStateSchema.nullable().default(null)
}).strict().superRefine((snapshot, ctx) => {
  if ((snapshot.phase.startsWith("final-") || snapshot.phase === "complete" || snapshot.phase === "post-game") && snapshot.finalState === null) {
    ctx.addIssue({ code: "custom", path: ["finalState"], message: "Final phases require viewer-safe final progress" });
  }
});

export const privateViewerStateSchema = z.object({
  participantId: participantIdSchema,
  controlledCharacters: z.array(privateCharacterHandSchema).max(2),
  pendingVote: z.object({ voterCharacterId: characterIdSchema, targetCharacterId: characterIdSchema.nullable() }).strict().nullable(),
  legalActions: z.array(z.string().min(1).max(80)).max(50)
}).strict();

export const spectatorViewerStateSchema = z.object({ participantId: participantIdSchema, reason: z.enum(["late-join", "grace-expired", "voluntary"]) }).strict();
export const viewerStateSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("participant"), privateState: privateViewerStateSchema }).strict(),
  z.object({ role: z.literal("spectator"), privateState: spectatorViewerStateSchema }).strict()
]);

export const viewerGameSnapshotSchema = z.object({ publicState: publicGameSnapshotSchema, viewer: viewerStateSchema }).strict();

export const revealCardIntentSchema = z.object({ characterId: characterIdSchema, cardId: cardIdSchema }).strict();
export const castVoteIntentSchema = z.object({ voterCharacterId: characterIdSchema, targetCharacterId: characterIdSchema }).strict();
export const specialConditionIntentSchema = z.object({
  characterId: characterIdSchema, cardId: cardIdSchema, targetCharacterId: characterIdSchema.optional(), targetCardId: cardIdSchema.optional()
}).strict();
export const usefulnessVoteIntentSchema = z.object({ voterParticipantId: participantIdSchema, subjectCardId: cardIdSchema, useful: z.boolean() }).strict();
