export type AcceptanceArea = "domain" | "server" | "frontend" | "e2e";

export type AcceptanceScenario = Readonly<{
  id: string;
  area: AcceptanceArea;
  acceptanceCriteria: readonly string[];
  ruleIds: readonly string[];
  behavior: string;
  assertions: readonly string[];
  fixture: Readonly<Record<string, unknown>>;
}>;

export type AcceptanceExecution = Readonly<{
  scenarioId: string;
  assertions: Readonly<Record<string, boolean>>;
  trace: readonly Readonly<{
    at: string;
    actor?: string;
    action: string;
    version?: number;
  }>[];
}>;

export interface DomainAcceptanceDriver {
  execute(scenario: AcceptanceScenario): Promise<AcceptanceExecution>;
}

export interface ServerAcceptanceDriver {
  execute(scenario: AcceptanceScenario): Promise<AcceptanceExecution>;
  close(): Promise<void>;
}

export interface BrowserAcceptanceDriver {
  execute(scenario: AcceptanceScenario): Promise<AcceptanceExecution>;
  close(): Promise<void>;
}

const scenario = (
  id: string,
  area: AcceptanceArea,
  acceptanceCriteria: readonly string[],
  ruleIds: readonly string[],
  behavior: string,
  assertions: readonly string[],
  fixture: Readonly<Record<string, unknown>> = {},
): AcceptanceScenario => ({ id, area, acceptanceCriteria, ruleIds, behavior, assertions, fixture });

export const REQUIRED_ACCEPTANCE_CRITERIA = Array.from(
  { length: 17 },
  (_, index) => `AC-${String(index + 1).padStart(2, "0")}`,
);

export const REQUIRED_RULE_IDS = [
  "OFF-SETUP-CAPACITY",
  "OFF-DEAL-UNIQUE",
  "OFF-DEAL-BUNKER-THREAT",
  "APR-SMALL-GROUP-FILL-SIX",
  "OFF-ROUND-COUNT",
  "OFF-R1-PROFESSION",
  "OFF-R2-R5-CHOICE",
  "OFF-ROUND-STARTER",
  "APR-TIMERS-FOUR-OPTIONAL",
  "OFF-EXPULSION-TABLE",
  "OFF-BALLOT-EXILED-VOTE",
  "OFF-EXILED-CONTINUES",
  "OFF-EXILE-REVEAL",
  "OFF-TIE-DEFENSE-RUNOFF-LOT",
  "APR-PARTICIPANT-TIE-OVERTIME",
  "OFF-SPECIAL-CONDITION",
  "OFF-GOAL-SALVATION",
  "OFF-GOAL-REVIVAL",
  "OFF-FINAL-BASE",
  "OFF-FINAL-SURVIVAL-STORY",
  "OFF-COMBINED-DECKS",
  "APR-SAME-ROOM-REMATCH",
] as const;

const fakeClock = { now: "2030-01-01T12:00:00.000Z", advanceMs: 0 } as const;
const seeded = { seed: "acceptance-seed-2026" } as const;

export const acceptanceScenarios: readonly AcceptanceScenario[] = [
  scenario("DOM-001", "domain", ["AC-01"], ["OFF-SETUP-CAPACITY"], "capacity is floor(character count divided by two and every maxParticipants value from three through fifteen is valid", ["capacityMatchesFloor", "supportsThreeThroughFifteenHumans", "allMaxParticipantsAccepted"], { characterCounts: [6, 7, 8, 9, 10, 15], maxParticipants: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], ...seeded }),
  scenario("DOM-002", "domain", ["AC-01"], ["OFF-DEAL-UNIQUE", "OFF-DEAL-BUNKER-THREAT"], "deal is deterministic, unique, private, and contains one catastrophe plus five bunker-threat pairs", ["sameSeedSameDeal", "cardIdsUnique", "oneCatastrophe", "fiveBunkerThreatPairs", "ordinaryHandsPrivate"], { participants: 6, ...seeded }),
  scenario("DOM-003", "domain", ["AC-02"], ["APR-SMALL-GROUP-FILL-SIX"], "three participants receive two independent characters each", ["sixCharacters", "twoPerController", "independentTurnsAndVotes"], { participants: 3 }),
  scenario("DOM-004", "domain", ["AC-02"], ["APR-SMALL-GROUP-FILL-SIX"], "four and five participant claim races fill to six without a seventh character", ["quotaSerialized", "differentWinners", "loserStableError", "controllerHasAtMostOneExtra"], { participantCases: [4, 5], simultaneousClaims: 3 }),
  scenario("DOM-005", "domain", ["AC-02"], ["APR-SMALL-GROUP-FILL-SIX"], "roster and fill flag transitions clear incompatible claims and reset readiness", ["claimsRecomputed", "sixPlusOneEach", "readinessReset"], { transitions: ["3>4", "5>6", "6>5", "4>3", "flag-off"] }),
  scenario("DOM-006", "domain", ["AC-03"], ["OFF-ROUND-COUNT", "OFF-R1-PROFESSION", "OFF-R2-R5-CHOICE"], "five base rounds reveal profession first and one legal chosen ordinary card later", ["exactlyFiveBaseRounds", "professionForcedFirst", "oneOrdinaryRevealLater", "illegalCategoryRejected"], { ...fakeClock }),
  scenario("DOM-007", "domain", ["AC-03"], ["OFF-ROUND-STARTER", "OFF-DEAL-BUNKER-THREAT"], "active starter rotates clockwise and each base round reveals one bunker-threat pair", ["starterRotation", "activeOnlyGetsRevealTurn", "fivePairsByRoundFive", "noPairInOvertime"]),
  scenario("DOM-008", "domain", ["AC-04"], ["APR-TIMERS-FOUR-OPTIONAL"], "four nullable timers produce independent deadlines and changing one preserves the other three", ["defaultsAllNull", "deadlinesIndependent", "singleSettingIsolation", "tieDefenseAlwaysSixtySeconds"], { timers: { selection: null, speech: 20, discussion: 30, voting: 40 }, ...fakeClock }),
  scenario("DOM-009", "domain", ["AC-04"], ["APR-TIMERS-FOUR-OPTIONAL"], "timer expiry and simultaneous manual intent apply exactly one legal transition", ["selectionRevealsOneSeededLegalCard", "speechAdvancesOnce", "discussionOpensBallotOnce", "votingMarksNotCast", "manualExpiryRaceIdempotent"], { ...fakeClock, ...seeded }),
  scenario("DOM-010", "domain", ["AC-05"], ["OFF-EXPULSION-TABLE"], "immutable start cohort selects one and two full official expulsion cycles", ["scheduleUsesStartCohort", "oneCycleMatchesTable", "twoCyclesMatchTable", "disconnectDoesNotChangeSchedule"]),
  scenario("DOM-011", "domain", ["AC-05"], ["OFF-BALLOT-EXILED-VOTE", "OFF-EXILED-CONTINUES", "OFF-EXILE-REVEAL"], "exiled characters keep separate ballots and special actions but lose reveal turns", ["activeAndExiledVote", "spectatorNeverVotes", "exiledOrdinaryCardsRevealed", "specialRemainsHidden", "exiledHasNoRevealTurn"]),
  scenario("DOM-012", "domain", ["AC-06"], ["OFF-TIE-DEFENSE-RUNOFF-LOT", "APR-PARTICIPANT-TIE-OVERTIME"], "three-to-five human tables permit scheduled no-exile ties and continue to overtime", ["allowedTieExilesNobody", "roundScheduleContinues", "overtimeOneAttemptAtATime", "stopsAtCapacity"], { humanParticipantCountAtGameStart: 3 }),
  scenario("DOM-013", "domain", ["AC-06"], ["OFF-TIE-DEFENSE-RUNOFF-LOT", "APR-PARTICIPANT-TIE-OVERTIME"], "six-plus human tables run defense, tied-only runoff, then seeded lot", ["defenseDeadlineSixtySeconds", "runoffCandidatesOnly", "repeatTieUsesSeededLot", "oneCharacterExiled"], { humanParticipantCountAtGameStart: 6, ...seeded }),
  scenario("DOM-014", "domain", ["AC-07"], ["OFF-SPECIAL-CONDITION"], "every selectable special effect validates actor target timing phase and duplicate command", ["allSupportedEffectsExecute", "invalidActorRejected", "invalidTargetRejected", "invalidTimingRejected", "duplicateHasNoSecondEffect"], { effectTypes: ["swap-card", "reveal-random", "protect-from-vote", "double-vote", "force-reveal", "exchange-characters"] }),
  scenario("DOM-015", "domain", ["AC-07", "AC-14"], ["OFF-SPECIAL-CONDITION"], "unsupported special effects cannot enter a selectable pack", ["schemaRejectsUnknownEffect", "validationIssueHasPath", "activePackUnchanged"]),
  scenario("DOM-016", "domain", ["AC-08"], ["OFF-GOAL-SALVATION", "OFF-FINAL-BASE"], "base salvation final returns deterministic winners at bunker capacity", ["capacityApplied", "survivorsWin", "summaryStable"]),
  scenario("DOM-017", "domain", ["AC-08"], ["OFF-GOAL-REVIVAL", "OFF-FINAL-BASE"], "base revival requires the documented viable pair condition", ["pairConditionRequired", "positivePairWins", "negativePairLoses"]),
  scenario("DOM-018", "domain", ["AC-08"], ["OFF-FINAL-SURVIVAL-STORY", "OFF-GOAL-SALVATION", "OFF-GOAL-REVIVAL"], "Survival Story resolves useful votes threats random consequences baggage exiled threats and catastrophe", ["halfVotesCountUseful", "threeUsefulThreshold", "professionThreatConsequence", "baggageRetained", "exiledGroupGetsTwoThreats", "catastropheChecked", "bothGoalsResolved"], { ...seeded }),
  scenario("DOM-019", "domain", ["AC-09"], ["OFF-COMBINED-DECKS"], "combined six-through-nine deck schedules enforce reveal counts and Profession or Superpower", ["allDeckCountsLegal", "revealCountsMatch", "requiredCategoryPresent", "invalidScheduleRejected"]),
  scenario("DOM-020", "domain", ["AC-10"], ["APR-SAME-ROOM-REMATCH"], "rematch creates clean state with new identity seed and deal while preserving room settings", ["newGameId", "freshSeedAndDeal", "oldRolesVotesCardsCleared", "roomIdentityAndSettingsPreserved", "oldGameCommandStale"]),
  scenario("DOM-021", "domain", ["AC-17"], REQUIRED_RULE_IDS, "traceability inventory contains every official and exactly four approved product rule families", ["allRequiredRuleIdsCovered", "exactlyFourApprovedRuleIds", "noUnclassifiedDeviation"]),

  scenario("SRV-001", "server", ["AC-11"], [], "anonymous sessions normalize nicknames reserve uniqueness through grace and enforce one room", ["normalizedNickname", "duplicateReserved", "oneSessionOneRoom", "opaqueToken"]),
  scenario("SRV-002", "server", ["AC-11"], [], "public room list create join leave close and browser status reveal no game secrets", ["roomLifecycleWorks", "hostOnlyClose", "statusPublic", "noSecretFields"]),
  scenario("SRV-003", "server", ["AC-11", "AC-12"], [], "host transfers by seat and empty rooms expire with every cleanup job cancelled", ["hostTransfersAfterGrace", "emptyRoomDeletedAfterGrace", "cleanupJobsCancelled", "spectatorHostGetsNoVote"]),
  scenario("SRV-004", "server", ["AC-12"], [], "reconnect before sixty seconds restores private state and after grace expires token and anonymizes control", ["beforeGraceRestores", "afterGraceRejectsToken", "profileRemoved", "characterPersists", "controlTransfersAtomically", "scheduleUnchanged"], { ...fakeClock }),
  scenario("SRV-005", "server", ["AC-12"], [], "late join during a game is spectator-only and receives no hand or ballot", ["lateRoleSpectator", "noCharacterAssigned", "noPrivateHand", "voteForbidden"]),
  scenario("SRV-006", "server", ["AC-13"], [], "every HTTP and socket input is runtime validated authorized and protocol-versioned", ["allRoutesValidated", "allCommandsAuthorized", "versionMismatchStableError", "invalidPhaseStableError"]),
  scenario("SRV-007", "server", ["AC-13"], [], "viewer projections and errors never disclose another character hand", ["ownHandsVisible", "otherHandsConcealed", "logsSanitized", "errorsSanitized"]),
  scenario("SRV-008", "server", ["AC-13"], [], "stale versions duplicate commands and simultaneous timer intents preserve one state transition", ["staleRejected", "duplicateAckStable", "versionMonotonic", "singleTransition"]),
  scenario("SRV-009", "server", ["AC-13"], [], "payload avatar pack room spectator command-rate and CORS limits fail safely", ["oversizedPayloadRejected", "invalidAvatarRejected", "packLimitsEnforced", "roomLimitEnforced", "spectatorLimitEnforced", "rateLimitStable", "corsAllowlistApplied"]),
  scenario("SRV-010", "server", ["AC-13", "AC-16"], [], "liveness readiness graceful shutdown and configuration work without embedded secrets", ["liveEndpoint", "readyEndpoint", "shutdownEvent", "newCommandsStop", "noHardcodedSecret"]),
  scenario("SRV-011", "server", ["AC-14"], [], "room snapshots selected built-in and custom packs and cannot mutate active game content", ["selectedPacksMixed", "roomPackSnapshotted", "laterEditDoesNotMutateGame", "originalBilingualCoverage"]),
  scenario("SRV-012", "server", ["AC-10", "AC-11"], ["APR-SAME-ROOM-REMATCH"], "post-game keeps populated room resets readiness and auto-starts valid rematch", ["roomPersists", "summaryPersists", "readinessReset", "spectatorsDoNotBlock", "validReadyAutoStarts"]),
  scenario("SRV-013", "server", ["AC-02", "AC-13"], ["APR-SMALL-GROUP-FILL-SIX"], "concurrent extra claims serialize and converge for every viewer", ["quotaNeverExceeded", "stableConflictCode", "snapshotsConverge", "duplicateClaimIdempotent"]),
  scenario("SRV-014", "server", ["AC-04", "AC-05", "AC-07"], ["APR-TIMERS-FOUR-OPTIONAL", "OFF-SPECIAL-CONDITION"], "ballot runoff lot timers and special intents cannot hang or execute twice", ["ballotCloses", "runoffCloses", "lotCloses", "timerJobsCancel", "specialAppliedOnce"], { ...fakeClock, ...seeded }),
  scenario("SRV-015", "server", ["AC-02", "AC-13"], ["APR-SMALL-GROUP-FILL-SIX"], "an extra-character winner receives its own releasable character ID while every other viewer projection conceals that ID", ["winnerProjectionContainsOwnExtraId", "releaseUsesProjectedCharacterId", "otherProjectionConcealsExtraId", "releaseReturnsSlot", "readinessResetAfterRelease"]),
  scenario("SRV-016", "server", ["AC-08", "AC-13"], ["OFF-FINAL-SURVIVAL-STORY"], "final projection identifies the current subject and group progress without private or unrevealed card data", ["currentSubjectProjected", "groupProgressProjected", "utilityVoteProgressProjected", "hiddenCardsAbsent"]),

  scenario("UI-001", "frontend", ["AC-15"], [], "onboarding stores valid nickname locale and DiceBear or uploaded avatar with recoverable storage errors", ["profileCreated", "localeStoredLocally", "avatarValidated", "storageFailureExplained"]),
  scenario("UI-002", "frontend", ["AC-15"], [], "room browser create and lobby expose host settings roster readiness and clear validation", ["publicRoomsRendered", "createJoinWork", "hostControlsScoped", "readinessResetExplained"]),
  scenario("UI-003", "frontend", ["AC-04", "AC-15"], ["APR-TIMERS-FOUR-OPTIONAL"], "four controls default off remain independent and active countdowns derive from server deadlines", ["allDefaultsOff", "valuesIndependent", "countdownUsesDeadline", "expiredUIWaitsForServer"]),
  scenario("UI-004", "frontend", ["AC-02", "AC-15"], ["APR-SMALL-GROUP-FILL-SIX"], "mobile lobby explains quota claim success conflict release by the viewer-owned ID and readiness blocker", ["quotaVisible", "claimFeedback", "conflictFeedback", "releaseAvailable", "releaseUsesViewerOwnedId", "otherViewerExtraIdAbsent", "startBlockerVisible"]),
  scenario("UI-005", "frontend", ["AC-01", "AC-15"], [], "two-character controller switches isolated hands and actions without exposing either to another viewer", ["bothOwnCharactersSelectable", "handsRemainSeparate", "otherViewerCannotSeeCards", "characterScopedActions"]),
  scenario("UI-006", "frontend", ["AC-03", "AC-05", "AC-06", "AC-07", "AC-15"], [], "game table presents rounds reveals expulsion ties overtime special actions and role-specific controls at 320px", ["roundStateClear", "expulsionTableReadable", "tieAndOvertimeClear", "specialActionClear", "activeExiledSpectatorDistinct", "noHorizontalCriticalClipping"]),
  scenario("UI-007", "frontend", ["AC-08", "AC-15"], [], "both final modes show current subject, group progress, useful voting, consequences and final winners without hidden cards", ["baseOutcomeReadable", "survivalFlowReadable", "currentSubjectReadable", "groupProgressReadable", "hiddenCardsAbsent", "voteLabelsAccessible", "winnerSummaryAnnounced"]),
  scenario("UI-008", "frontend", ["AC-10", "AC-15"], ["APR-SAME-ROOM-REMATCH"], "post-game summary and rematch readiness work without re-entering the room", ["summaryVisible", "readyAvailable", "sameRoomRetained", "newGamePresented"]),
  scenario("UI-009", "frontend", ["AC-12", "AC-15"], [], "spectator reconnect and expired-session states expose only legal recovery actions", ["spectatorControlsDistinct", "reconnectProgressClear", "restoreWorks", "expiredFeedbackClear"]),
  scenario("UI-010", "frontend", ["AC-14", "AC-15"], [], "custom packs support local create edit duplicate delete export and non-destructive import errors", ["crudWorksLocally", "exportRoundTrips", "pathErrorsShown", "invalidImportPreservesExisting", "licensedCombinedHidden"]),
  scenario("UI-011", "frontend", ["AC-15"], [], "Ukrainian and English clients coexist with keyboard touch focus and status announcements", ["localesIndependent", "labelsLocalized", "keyboardOperable", "touchTargetsUsable", "focusVisible", "liveStatusAnnounced"]),

  scenario("E2E-001", "e2e", ["AC-01", "AC-02", "AC-15"], ["APR-SMALL-GROUP-FILL-SIX"], "three isolated participants create join ready auto-start and receive exactly two private hands each", ["autoStarted", "sixCharacters", "twoHandsEach", "crossViewerSecretsAbsent"], { contexts: ["host", "participant-2", "participant-3"] }),
  scenario("E2E-002", "e2e", ["AC-02", "AC-15"], ["APR-SMALL-GROUP-FILL-SIX"], "four-player simultaneous fill-to-six claims select two winners and block start until quota", ["twoDifferentWinners", "thirdConflict", "sixTotal", "blockedBeforeQuota"]),
  scenario("E2E-003", "e2e", ["AC-03", "AC-05"], [], "round one profession rounds two-five chosen reveals scheduled votes and five bunker-threat pairs complete", ["professionFirst", "laterChoice", "votesOnlyScheduled", "ballotMutableUntilLock", "noAbstain", "fivePairs"]),
  scenario("E2E-004", "e2e", ["AC-04"], ["APR-TIMERS-FOUR-OPTIONAL"], "all timers default off and short test values drive selection speech discussion and voting expiry", ["productionDefaultsOff", "fourExpiriesObserved", "notCastExcluded"]),
  scenario("E2E-005", "e2e", ["AC-06"], ["APR-PARTICIPANT-TIE-OVERTIME"], "three-person allowed tie leads to repeated overtime until capacity", ["tieExilesNobody", "overtimeShown", "endsAtCapacity"]),
  scenario("E2E-006", "e2e", ["AC-06"], ["OFF-TIE-DEFENSE-RUNOFF-LOT"], "six-person tie reaches defense runoff and seeded random expulsion", ["defenseShown", "runoffTiedOnly", "repeatTieExilesOne"]),
  scenario("E2E-007", "e2e", ["AC-05", "AC-07"], ["OFF-EXILED-CONTINUES", "OFF-SPECIAL-CONDITION"], "exiled character reveals ordinary cards loses reveal turn but still votes and plays special", ["ordinaryCardsPublic", "specialHidden", "noRevealTurn", "ballotAvailable", "specialAvailable"]),
  scenario("E2E-008", "e2e", ["AC-12"], [], "late join is spectator with no hand and host reconnects before grace then transfers after grace", ["lateJoinSpectates", "noHand", "hostRestoredBeforeGrace", "hostTransferredAfterGrace"]),
  scenario("E2E-009", "e2e", ["AC-08"], [], "base and full Survival Story flows reach final deterministic winner lists", ["baseCompleted", "survivalCompleted", "winnerListsStable"]),
  scenario("E2E-010", "e2e", ["AC-10"], ["APR-SAME-ROOM-REMATCH"], "final keeps room resets readiness and creates fresh rematch rejecting old command", ["sameRoom", "readyReset", "newGameId", "freshHands", "oldCommandRejected"]),
  scenario("E2E-011", "e2e", ["AC-15"], [], "Ukrainian host English participant and spectator use one game at mobile and desktop viewports", ["mixedLocales", "mobileUsableAt320", "desktopUsable", "spectatorProjectionSafe"]),
  scenario("E2E-012", "e2e", ["AC-14", "AC-16"], [], "custom pack round-trip starts a game and production-like health plus websocket flow has no console or network failures", ["packRoundTrip", "gameUsesSnapshot", "healthReady", "socketConnected", "noConsoleErrors", "noFailedRequests"]),
];

export const scenariosFor = (area: AcceptanceArea): readonly AcceptanceScenario[] =>
  acceptanceScenarios.filter((entry) => entry.area === area);

export const assertExecution = (scenarioEntry: AcceptanceScenario, execution: AcceptanceExecution): void => {
  if (execution.scenarioId !== scenarioEntry.id) {
    throw new Error(`Driver returned ${execution.scenarioId} for ${scenarioEntry.id}`);
  }
  for (const assertion of scenarioEntry.assertions) {
    if (execution.assertions[assertion] !== true) {
      throw new Error(`${scenarioEntry.id} did not prove assertion: ${assertion}`);
    }
  }
};
