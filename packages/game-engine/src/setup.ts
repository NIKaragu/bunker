export type ParticipantAllocation = Readonly<{
  participantId: string;
  characterIds: readonly string[];
  ready: boolean;
}>;

export type LobbyAllocation = Readonly<{
  participantIds: readonly string[];
  fillToSix: boolean;
  extraClaims: ReadonlyMap<string, string>;
  readyIds: ReadonlySet<string>;
  version: number;
  processedCommands: ReadonlyMap<string, ClaimResult>;
}>;

export type ClaimResult = Readonly<{
  ok: boolean;
  code?: "EXTRA_CHARACTER_UNAVAILABLE" | "INVALID_ROSTER";
  duplicate: boolean;
  version: number;
  characterId?: string;
}>;

export const bunkerCapacity = (characterCount: number): number => {
  if (
    !Number.isInteger(characterCount) ||
    characterCount < 3 ||
    characterCount > 15
  ) {
    throw new RangeError("characterCount must be between 3 and 15");
  }
  return Math.floor(characterCount / 2);
};

export const extraQuota = (participants: number, fillToSix: boolean): number =>
  fillToSix && (participants === 4 || participants === 5)
    ? 6 - participants
    : 0;

export const createLobbyAllocation = (
  participantIds: readonly string[],
  fillToSix = false,
): LobbyAllocation => {
  assertParticipantCount(participantIds.length);
  return {
    participantIds: [...participantIds],
    fillToSix,
    extraClaims: new Map(),
    readyIds: new Set(),
    version: 0,
    processedCommands: new Map(),
  };
};

export const claimExtraCharacter = (
  state: LobbyAllocation,
  participantId: string,
  commandId: string,
): readonly [LobbyAllocation, ClaimResult] => {
  const previous = state.processedCommands.get(commandId);
  if (previous) return [state, { ...previous, duplicate: true }];

  const quota = extraQuota(state.participantIds.length, state.fillToSix);
  const eligible = state.participantIds.includes(participantId);
  const alreadyClaimed = state.extraClaims.has(participantId);
  const available = state.extraClaims.size < quota;
  const version = state.version + 1;
  const result: ClaimResult =
    eligible && !alreadyClaimed && available
      ? {
          ok: true,
          duplicate: false,
          version,
          characterId: `character_extra_${state.extraClaims.size + 1}`,
        }
      : {
          ok: false,
          code: eligible ? "EXTRA_CHARACTER_UNAVAILABLE" : "INVALID_ROSTER",
          duplicate: false,
          version,
        };
  const claims = new Map(state.extraClaims);
  if (result.ok) claims.set(participantId, result.characterId as string);
  const processed = new Map(state.processedCommands).set(commandId, result);
  return [
    {
      ...state,
      extraClaims: claims,
      readyIds: new Set(),
      version,
      processedCommands: processed,
    },
    result,
  ];
};

export const releaseExtraCharacter = (
  state: LobbyAllocation,
  participantId: string,
): LobbyAllocation => {
  if (!state.extraClaims.has(participantId)) return state;
  const claims = new Map(state.extraClaims);
  claims.delete(participantId);
  return {
    ...state,
    extraClaims: claims,
    readyIds: new Set(),
    version: state.version + 1,
  };
};

export const reconcileRoster = (
  state: LobbyAllocation,
  participantIds: readonly string[],
  fillToSix = state.fillToSix,
): LobbyAllocation => {
  assertParticipantCount(participantIds.length);
  const compatibleClaims = new Map<string, string>();
  if (
    fillToSix &&
    (participantIds.length === 4 || participantIds.length === 5)
  ) {
    const quota = extraQuota(participantIds.length, fillToSix);
    for (const participantId of participantIds) {
      const characterId = state.extraClaims.get(participantId);
      if (characterId && compatibleClaims.size < quota)
        compatibleClaims.set(participantId, characterId);
    }
  }
  return {
    participantIds: [...participantIds],
    fillToSix,
    extraClaims: compatibleClaims,
    readyIds: new Set(),
    version: state.version + 1,
    processedCommands: new Map(),
  };
};

export const allocations = (
  state: LobbyAllocation,
): readonly ParticipantAllocation[] => {
  const forceTwo = state.participantIds.length === 3;
  return state.participantIds.map((participantId, seat) => {
    const characterIds = [`character_${seat + 1}`];
    if (forceTwo) characterIds.push(`character_${seat + 4}`);
    else {
      const extra = state.extraClaims.get(participantId);
      if (extra) characterIds.push(extra);
    }
    return {
      participantId,
      characterIds,
      ready: state.readyIds.has(participantId),
    };
  });
};

export const allocationIsStartable = (state: LobbyAllocation): boolean => {
  const count = allocations(state).reduce(
    (sum, entry) => sum + entry.characterIds.length,
    0,
  );
  return (
    extraQuota(state.participantIds.length, state.fillToSix) ===
      state.extraClaims.size && count >= state.participantIds.length
  );
};

const assertParticipantCount = (count: number): void => {
  if (!Number.isInteger(count) || count < 3 || count > 15)
    throw new RangeError("participants must be between 3 and 15");
};
