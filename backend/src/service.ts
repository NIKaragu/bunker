import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  PROTOCOL_VERSION,
  createRoomInputSchema,
  customPackImportSchema,
  profileInputSchema,
  profilePatchSchema,
  type ErrorCode
} from "../../packages/contracts/src/index.js";
import {
  SeededRandom,
  allocationIsStartable,
  advanceRound,
  allocations,
  claimExtraCharacter,
  createBunkerPartyPack,
  createGameState,
  createLobbyAllocation,
  dealGame,
  exileCharacter,
  projectForViewer,
  reconcileRoster,
  releaseExtraCharacter,
  resolveBaseFinal,
  revealOrdinaryCard,
  validatePack,
  type Card,
  type CustomPack as EngineCustomPack,
  type GameState,
  type LobbyAllocation
} from "../../packages/game-engine/src/index.js";
import type { ServerConfig } from "./config.js";
import type { Scheduler } from "./scheduler.js";

export class BunkerError extends Error {
  public constructor(public readonly code: ErrorCode, message: string = code) { super(message); }
}

type Profile = ReturnType<typeof profileInputSchema.parse> & { participantId: string };
type Settings = ReturnType<typeof createRoomInputSchema.parse>["settings"];
type CustomPack = ReturnType<typeof createRoomInputSchema.parse>["customPacks"][number];

type SessionRecord = {
  sessionId: string;
  reconnectToken: string;
  profile: Profile;
  expiresAt: number;
  roomId: string | undefined;
  connected: boolean;
  reconnectDeadline: number | null;
  reconnectJob: unknown | undefined;
};

type FinalView = {
  mode: "base" | "survival-story";
  goal: "salvation" | "revival";
  stage: "not-started" | "bunker-threat" | "exiled-threat-one" | "exiled-threat-two" | "catastrophe" | "resolved";
  currentSubjectCardId: string | null;
  currentGroup: "bunker" | "exiled" | "combined" | null;
  utilityVote: null | { subjectCardId: string; eligibleParticipantIds: string[]; castParticipantIds: string[]; usefulVotes: number; notUsefulVotes: number; resolvedUseful: boolean | null };
  groupProgress: Array<{ group: "bunker" | "exiled" | "combined"; threatCardId: string | null; attempt: number; requiredUsefulCards: 3; usefulCardIds: string[]; survivorCharacterIds: string[]; defeated: boolean | null }>;
  outcome: null | { goal: "salvation" | "revival"; winningCharacterIds: string[]; losingCharacterIds: string[]; summaryKey: string };
};

type Member = {
  sessionId: string;
  role: "host" | "participant" | "spectator";
  ready: boolean;
  seat: number;
};

type GameRecord = {
  state: GameState;
  cardsById: Map<string, Card>;
  selectedPackIds: string[];
  deadlines: Record<"selection" | "speech" | "discussion" | "voting" | "tieDefense", string | null>;
  jobs: Set<unknown>;
  jobByKind: Map<"selection" | "speech" | "discussion" | "voting" | "tieDefense", unknown>;
  ballot: null | {
    eligibleVoterIds: string[];
    castVoterIds: string[];
    notCastVoterIds: string[];
    candidates: string[];
    tally?: Record<string, number>;
  };
  outcome: null | { goal: "salvation" | "revival"; winningCharacterIds: string[]; losingCharacterIds: string[]; summaryKey: string };
  spokenCharacterIds: Set<string>;
  finalState: FinalView | null;
  finalCards: {
    catastrophe: Card;
    bunker: Card[];
    threats: Card[];
  };
};

type RoomRecord = {
  roomId: string;
  name: string;
  status: "lobby" | "in-game" | "post-game" | "closed";
  version: number;
  hostId: string;
  settings: Settings;
  adultContent: boolean;
  customPacks: CustomPack[];
  members: Member[];
  allocation: LobbyAllocation | null;
  game: GameRecord | null;
  lastGameSummary: GameRecord["outcome"];
  createdAt: number;
  updatedAt: number;
  processed: Map<string, { version: number; ok: boolean; code?: ErrorCode }>;
  cleanupJob?: unknown;
};

const id = (prefix: string): string => `${prefix}_${randomUUID().replaceAll("-", "")}`;
const normalizeNickname = (value: string): string => value.normalize("NFKC").trim().replace(/\s+/g, " ");
const nicknameKey = (value: string): string => normalizeNickname(value).toLocaleLowerCase("en-US");
const clone = <T>(value: T): T => structuredClone(value);

export class BunkerService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionsByToken = new Map<string, string>();
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly commandWindows = new Map<string, number[]>();
  private accepting = true;

  public constructor(private readonly config: ServerConfig, private readonly scheduler: Scheduler) {}

  public createSession(input: unknown): object {
    this.assertAccepting();
    const parsed = profileInputSchema.parse(input);
    const nickname = normalizeNickname(parsed.nickname);
    if ([...this.sessions.values()].some((entry) => entry.expiresAt > this.now && nicknameKey(entry.profile.nickname) === nicknameKey(nickname))) {
      throw new BunkerError("NICKNAME_TAKEN");
    }
    this.verifyAvatar(parsed.avatar);
    const sessionId = id("session");
    const participantId = id("participant");
    const reconnectToken = randomBytes(32).toString("base64url");
    const session: SessionRecord = {
      sessionId,
      reconnectToken,
      profile: { ...parsed, nickname, participantId },
      expiresAt: this.now + this.config.sessionTtlMs,
      connected: true,
      reconnectDeadline: null,
      roomId: undefined,
      reconnectJob: undefined
    };
    this.sessions.set(sessionId, session);
    this.sessionsByToken.set(reconnectToken, sessionId);
    return this.sessionDto(session);
  }

  public restoreSession(token: string): object {
    const session = this.sessionByToken(token);
    if (session.expiresAt <= this.now || (session.reconnectDeadline !== null && session.reconnectDeadline <= this.now)) {
      this.expireSession(session.sessionId);
      throw new BunkerError("SESSION_EXPIRED");
    }
    if (session.reconnectJob) this.scheduler.clear(session.reconnectJob);
    session.connected = true;
    session.reconnectDeadline = null;
    session.reconnectJob = undefined;
    session.expiresAt = this.now + this.config.sessionTtlMs;
    this.touchRoom(session.roomId);
    return this.sessionDto(session);
  }

  public updateProfile(sessionId: string, input: unknown): object {
    const session = this.requireSession(sessionId);
    const patch = profilePatchSchema.parse(input);
    if (patch.nickname) {
      const normalized = normalizeNickname(patch.nickname);
      if ([...this.sessions.values()].some((entry) => entry.sessionId !== sessionId && entry.expiresAt > this.now && nicknameKey(entry.profile.nickname) === nicknameKey(normalized))) throw new BunkerError("NICKNAME_TAKEN");
      patch.nickname = normalized;
    }
    if (patch.avatar) this.verifyAvatar(patch.avatar);
    if (patch.nickname !== undefined) session.profile.nickname = patch.nickname;
    if (patch.locale !== undefined) session.profile.locale = patch.locale;
    if (patch.avatar !== undefined) session.profile.avatar = patch.avatar;
    return { profile: clone(session.profile) };
  }

  public listRooms(status?: string): object[] {
    return [...this.rooms.values()].filter((room) => room.status !== "closed" && (!status || room.status === status)).map((room) => this.publicRoom(room));
  }

  public createRoom(sessionId: string, input: unknown): object {
    this.assertAccepting();
    const session = this.requireSession(sessionId);
    if (session.roomId) throw new BunkerError("ALREADY_IN_ROOM");
    if (this.rooms.size >= this.config.maxRooms) throw new BunkerError("RATE_LIMITED", "Room capacity reached");
    const parsed = createRoomInputSchema.parse(input);
    this.validatePacks(parsed.customPacks);
    const roomId = id("room");
    const now = this.now;
    const room: RoomRecord = {
      roomId,
      name: parsed.name.trim(),
      status: "lobby",
      version: 0,
      hostId: session.profile.participantId,
      settings: clone(parsed.settings),
      adultContent: parsed.adultContentConfirmed,
      customPacks: clone(parsed.customPacks),
      members: [{ sessionId, role: "host", ready: false, seat: 0 }],
      allocation: null,
      game: null,
      lastGameSummary: null,
      createdAt: now,
      updatedAt: now,
      processed: new Map()
    };
    this.rooms.set(roomId, room);
    session.roomId = roomId;
    return this.roomSnapshot(room, session);
  }

  public joinRoom(sessionId: string, roomId: string): object {
    const session = this.requireSession(sessionId);
    if (session.roomId) throw new BunkerError("ALREADY_IN_ROOM");
    const room = this.requireRoom(roomId);
    const participantCount = room.members.filter((member) => member.role !== "spectator").length;
    let role: Member["role"] = "participant";
    if (room.status === "in-game") role = "spectator";
    else if (participantCount >= room.settings.maxParticipants) role = "spectator";
    if (role === "spectator" && room.members.filter((member) => member.role === "spectator").length >= this.config.maxSpectatorsPerRoom) throw new BunkerError("ROOM_FULL");
    room.members.push({ sessionId, role, ready: false, seat: room.members.length });
    session.roomId = roomId;
    this.mutateRoom(room, true);
    return this.roomSnapshot(room, session);
  }

  public leaveRoom(sessionId: string): void {
    const session = this.requireSession(sessionId);
    if (!session.roomId) return;
    const room = this.rooms.get(session.roomId);
    session.roomId = undefined;
    if (!room) return;
    const member = room.members.find((entry) => entry.sessionId === sessionId);
    room.members = room.members.filter((entry) => entry.sessionId !== sessionId);
    if (member && room.status !== "in-game") this.reconcile(room);
    if (member?.role === "host") this.transferHost(room);
    this.mutateRoom(room, false);
    this.scheduleEmptyCleanup(room);
  }

  public closeRoom(sessionId: string, roomId: string): void {
    const session = this.requireSession(sessionId);
    const room = this.requireRoom(roomId);
    if (room.hostId !== session.profile.participantId) throw new BunkerError("NOT_HOST");
    room.status = "closed";
    this.cancelGameJobs(room);
    if (room.cleanupJob) this.scheduler.clear(room.cleanupJob);
    for (const member of room.members) {
      const entry = this.sessions.get(member.sessionId);
      if (entry) entry.roomId = undefined;
    }
    this.rooms.delete(roomId);
  }

  public currentRoom(sessionId: string): object {
    const session = this.requireSession(sessionId);
    if (!session.roomId) throw new BunkerError("NOT_FOUND");
    return this.roomSnapshot(this.requireRoom(session.roomId), session);
  }

  public disconnect(sessionId: string): void {
    const session = this.requireSession(sessionId);
    if (!session.connected) return;
    session.connected = false;
    session.reconnectDeadline = this.now + this.config.sessionGraceMs;
    session.reconnectJob = this.scheduler.set(this.config.sessionGraceMs, () => this.expireSession(sessionId));
    this.touchRoom(session.roomId);
  }

  public validatePack(input: unknown): object {
    const parsed = customPackImportSchema.parse(input);
    const actualBytes = Buffer.byteLength(JSON.stringify(parsed.pack));
    if (actualBytes > parsed.serializedBytes || actualBytes > 1_000_000) throw new BunkerError("PAYLOAD_TOO_LARGE");
    return validatePack(parsed.pack);
  }

  public command(sessionId: string, name: string, payload: Record<string, unknown>): { roomId: string; version: number; duplicate: boolean } {
    this.assertAccepting();
    this.rateLimit(sessionId);
    const session = this.requireSession(sessionId);
    if (!session.roomId || payload.roomId !== session.roomId) throw new BunkerError("FORBIDDEN");
    const room = this.requireRoom(session.roomId);
    const commandId = String(payload.commandId ?? "");
    const previous = room.processed.get(commandId);
    if (previous) {
      if (!previous.ok) throw new BunkerError(previous.code ?? "INTERNAL_ERROR");
      return { roomId: room.roomId, version: previous.version, duplicate: true };
    }
    if (payload.protocolVersion !== PROTOCOL_VERSION) throw new BunkerError("UNSUPPORTED_PROTOCOL");
    if (payload.expectedVersion !== room.version) throw new BunkerError("STALE_STATE");
    try {
      this.applyCommand(room, session, name, payload);
      room.processed.set(commandId, { version: room.version, ok: true });
      return { roomId: room.roomId, version: room.version, duplicate: false };
    } catch (error) {
      const bunker = this.asBunkerError(error);
      room.processed.set(commandId, { version: room.version, ok: false, code: bunker.code });
      throw bunker;
    }
  }

  public roomForToken(token: string): object | null {
    const session = this.sessionByToken(token);
    return session.roomId ? this.roomSnapshot(this.requireRoom(session.roomId), session) : null;
  }

  public sessionIdForToken(token: string): string { return this.sessionByToken(token).sessionId; }
  public stopAccepting(): void { this.accepting = false; }
  public shutdown(): void {
    this.accepting = false;
    for (const room of this.rooms.values()) {
      this.cancelGameJobs(room);
      if (room.cleanupJob) this.scheduler.clear(room.cleanupJob);
    }
    for (const session of this.sessions.values()) if (session.reconnectJob) this.scheduler.clear(session.reconnectJob);
  }
  public get stats(): { sessions: number; rooms: number; jobs: number } {
    let jobs = 0;
    for (const room of this.rooms.values()) jobs += room.game?.jobs.size ?? 0 + (room.cleanupJob ? 1 : 0);
    for (const session of this.sessions.values()) if (session.reconnectJob) jobs += 1;
    return { sessions: this.sessions.size, rooms: this.rooms.size, jobs };
  }

  private applyCommand(room: RoomRecord, session: SessionRecord, name: string, payload: Record<string, unknown>): void {
    const member = room.members.find((entry) => entry.sessionId === session.sessionId);
    if (!member) throw new BunkerError("FORBIDDEN");
    if (name === "room:subscribe" || name === "room:resync") return;
    if (name === "room:leave") { this.leaveRoom(session.sessionId); return; }
    if (name === "room:set-ready" || name === "postgame:set-ready") {
      if (member.role === "spectator") throw new BunkerError("SPECTATOR_FORBIDDEN");
      if (room.status !== "lobby" && room.status !== "post-game") throw new BunkerError("INVALID_PHASE");
      member.ready = Boolean(payload.ready);
      this.mutateRoom(room, false);
      this.autoStart(room);
      return;
    }
    if (name === "room:update-settings") {
      this.requireHost(room, session);
      if (room.status === "in-game") throw new BunkerError("INVALID_PHASE");
      const settings = createRoomInputSchema.shape.settings.parse(payload.settings);
      const participantCount = room.members.filter((entry) => entry.role !== "spectator").length;
      if (participantCount > settings.maxParticipants) throw new BunkerError("ROOM_FULL", "maxParticipants cannot be lower than the current participant count");
      room.settings = clone(settings);
      for (const entry of room.members) entry.ready = false;
      this.reconcile(room);
      this.mutateRoom(room, false);
      return;
    }
    if (name === "room:claim-extra-character") {
      if (member.role === "spectator") throw new BunkerError("SPECTATOR_FORBIDDEN");
      if (room.status === "in-game") throw new BunkerError("INVALID_PHASE");
      this.ensureAllocation(room);
      const [next, result] = claimExtraCharacter(room.allocation as LobbyAllocation, session.profile.participantId, String(payload.commandId));
      room.allocation = next;
      for (const entry of room.members) entry.ready = false;
      this.mutateRoom(room, false);
      if (!result.ok) throw new BunkerError("CLAIM_UNAVAILABLE");
      return;
    }
    if (name === "room:release-extra-character") {
      if (!room.allocation) throw new BunkerError("CLAIM_UNAVAILABLE");
      const ownedExtraId = room.allocation.extraClaims.get(session.profile.participantId);
      if (!ownedExtraId || payload.characterId !== ownedExtraId) throw new BunkerError("INVALID_TARGET");
      const before = room.allocation;
      room.allocation = releaseExtraCharacter(before, session.profile.participantId);
      if (before === room.allocation) throw new BunkerError("CLAIM_UNAVAILABLE");
      for (const entry of room.members) entry.ready = false;
      this.mutateRoom(room, false);
      return;
    }
    if (name === "room:start-game" || name === "postgame:start-rematch") {
      this.requireHost(room, session);
      if (!this.canStart(room)) throw new BunkerError("NOT_READY");
      this.startGame(room);
      return;
    }
    if (!room.game || room.status !== "in-game") throw new BunkerError("INVALID_PHASE");
    if (payload.gameId !== room.game.state.gameId) throw new BunkerError("STALE_STATE");
    if (member.role === "spectator") throw new BunkerError("SPECTATOR_FORBIDDEN");
    const controlled = room.game.state.characters.filter((character) => character.controllerId === session.profile.participantId);
    if (name === "game:reveal-card") {
      if (!controlled.some((character) => character.id === payload.characterId)) throw new BunkerError("FORBIDDEN");
      room.game.state = revealOrdinaryCard(room.game.state, {
        commandId: String(payload.commandId), gameId: room.game.state.gameId,
        expectedVersion: room.game.state.version, characterId: String(payload.characterId), cardId: String(payload.cardId)
      }, new SeededRandom(`${room.game.state.seed}:${String(payload.commandId)}`));
      this.cancelKind(room.game, "selection");
      this.schedulePhase(room, "speech");
      this.mutateRoom(room, false);
      return;
    }
    if (name === "game:end-speech") {
      if (payload.characterId !== room.game.state.activeCharacterId || !controlled.some((entry) => entry.id === payload.characterId)) throw new BunkerError("FORBIDDEN");
      this.finishSpeech(room);
      return;
    }
    if (name === "game:end-discussion") {
      this.requireHost(room, session);
      this.openBallot(room);
      return;
    }
    if (name === "game:cast-vote") {
      const voter = String(payload.voterCharacterId);
      const target = String(payload.targetCharacterId);
      if (!controlled.some((entry) => entry.id === voter)) throw new BunkerError("FORBIDDEN");
      if (!room.game.ballot || !room.game.ballot.eligibleVoterIds.includes(voter)) throw new BunkerError("VOTE_CLOSED");
      if (!room.game.ballot.candidates.includes(target)) throw new BunkerError("INVALID_TARGET");
      if (!room.game.ballot.castVoterIds.includes(voter)) room.game.ballot.castVoterIds.push(voter);
      room.game.ballot.notCastVoterIds = room.game.ballot.eligibleVoterIds.filter((entry) => !room.game?.ballot?.castVoterIds.includes(entry));
      room.game.ballot.tally = { ...(room.game.ballot.tally ?? {}), [target]: (room.game.ballot.tally?.[target] ?? 0) + 1 };
      this.mutateRoom(room, false);
      return;
    }
    if (name === "game:close-vote") {
      this.requireHost(room, session);
      this.closeBallot(room);
      return;
    }
    if (name === "game:play-special-condition") {
      const characterId = String(payload.characterId);
      if (!controlled.some((entry) => entry.id === characterId)) throw new BunkerError("FORBIDDEN");
      const character = room.game.state.characters.find((entry) => entry.id === characterId);
      const cardId = String(payload.cardId);
      if (!character?.hand.some((card) => card.id === cardId && card.type === "special-condition")) throw new BunkerError("INVALID_CARD");
      if (character.specialConditionPlayed) throw new BunkerError("DUPLICATE_COMMAND");
      room.game.state = {
        ...room.game.state,
        version: room.game.state.version + 1,
        characters: room.game.state.characters.map((entry) => entry.id === characterId ? { ...entry, specialConditionPlayed: true } : entry)
      };
      this.mutateRoom(room, false);
      return;
    }
    if (name === "game:vote-usefulness") {
      const finalState = room.game.finalState;
      const voterId = String(payload.voterParticipantId);
      if (!finalState?.utilityVote || finalState.stage === "resolved") throw new BunkerError("INVALID_PHASE");
      if (voterId !== session.profile.participantId || !finalState.utilityVote.eligibleParticipantIds.includes(voterId)) throw new BunkerError("FORBIDDEN");
      if (payload.subjectCardId !== finalState.currentSubjectCardId) throw new BunkerError("INVALID_TARGET");
      if (finalState.utilityVote.castParticipantIds.includes(voterId)) throw new BunkerError("DUPLICATE_COMMAND");
      const castParticipantIds = [...finalState.utilityVote.castParticipantIds, voterId];
      const usefulVotes = finalState.utilityVote.usefulVotes + (payload.useful === true ? 1 : 0);
      const notUsefulVotes = finalState.utilityVote.notUsefulVotes + (payload.useful === true ? 0 : 1);
      const complete = castParticipantIds.length === finalState.utilityVote.eligibleParticipantIds.length;
      room.game.finalState = {
        ...finalState,
        utilityVote: {
          ...finalState.utilityVote,
          castParticipantIds,
          usefulVotes,
          notUsefulVotes,
          resolvedUseful: complete ? usefulVotes >= Math.ceil(castParticipantIds.length / 2) : null
        }
      };
      this.mutateRoom(room, false);
      return;
    }
    throw new BunkerError("INVALID_PAYLOAD");
  }

  private startGame(room: RoomRecord): void {
    this.ensureAllocation(room);
    if (!room.allocation || !allocationIsStartable(room.allocation)) throw new BunkerError("NOT_READY");
    const allocation = allocations(room.allocation);
    const characterIds = allocation.flatMap((entry) => entry.characterIds);
    const builtIn = createBunkerPartyPack();
    const packs: EngineCustomPack[] = [builtIn, ...(room.customPacks as unknown as EngineCustomPack[])];
    const cards = packs.flatMap((pack) => pack.cards);
    const gameId = id("game");
    const seed = randomBytes(24).toString("base64url");
    const deal = dealGame(characterIds, cards, room.settings.characterDecks, new SeededRandom(seed));
    const characters = allocation.flatMap((entry) => entry.characterIds.map((characterId, index) => ({
      id: characterId.startsWith("character_") ? `${characterId}_${gameId.slice(-8)}` : characterId,
      controllerId: entry.participantId,
      seat: characterIds.indexOf(characterId) + index,
      status: "active" as const,
      hand: deal.hands.get(characterId) ?? [],
      revealedCardIds: new Set<string>(),
      specialConditionPlayed: false
    })));
    const remappedHands = new Map(characterIds.map((old, index) => [characters[index]?.id ?? old, deal.hands.get(old) ?? []]));
    const withHands = characters.map((entry) => ({ ...entry, hand: remappedHands.get(entry.id) ?? [] }));
    const state = createGameState({ gameId, seed, humanParticipantCount: allocation.length, characters: withHands, starterCharacterId: withHands[0]?.id ?? "" });
    room.game = {
      state,
      cardsById: new Map(cards.map((card) => [card.id, card])),
      selectedPackIds: packs.map((pack) => pack.id),
      deadlines: { selection: null, speech: null, discussion: null, voting: null, tieDefense: null },
      jobs: new Set(), jobByKind: new Map(), ballot: null, outcome: null, spokenCharacterIds: new Set(),
      finalState: null,
      finalCards: {
        catastrophe: deal.catastrophe,
        bunker: deal.bunkerThreatPairs.map((entry) => entry.bunker),
        threats: [...deal.bunkerThreatPairs.map((entry) => entry.threat), ...deal.remainingThreats]
      }
    };
    room.status = "in-game";
    room.lastGameSummary = null;
    for (const entry of room.members) entry.ready = false;
    this.schedulePhase(room, "selection");
    this.mutateRoom(room, false);
  }

  private roomSnapshot(room: RoomRecord, viewer: SessionRecord): object {
    const publicProjection = room.game ? projectForViewer(room.game.state, viewer.profile.participantId) : null;
    const viewerMember = room.members.find((entry) => entry.sessionId === viewer.sessionId);
    const game = room.game && publicProjection ? {
      publicState: {
        gameId: room.game.state.gameId,
        version: room.game.state.version,
        phase: room.game.state.phase === "final" ? "final-usefulness-vote" : room.game.state.phase,
        baseRound: room.game.state.baseRound,
        overtimeAttempt: room.game.state.overtimeAttempt,
        capacity: room.game.state.capacity,
        starterCharacterId: room.game.state.starterCharacterId || null,
        activeCharacterId: room.game.state.activeCharacterId || null,
        scheduledExilesThisRound: room.game.state.schedule[room.game.state.baseRound - 1] ?? 0,
        remainingExiles: Math.max(0, room.game.state.characterCountAtStart - room.game.state.capacity - room.game.state.characters.filter((entry) => entry.status === "exiled").length),
        characters: room.game.state.characters.map((character) => {
          const controller = this.sessionByParticipant(room, character.controllerId);
          const revealed = character.hand.filter((card) => character.revealedCardIds.has(card.id)).map((card) => ({ ...card, revealedAt: new Date(room.updatedAt).toISOString() }));
          return { characterId: character.id, controller: controller ? { participantId: controller.profile.participantId, nickname: controller.profile.nickname, connected: controller.connected } : null, seat: character.seat, status: character.status, revealedCards: revealed, concealedCardCount: character.hand.length - revealed.length, specialConditionPlayed: character.specialConditionPlayed };
        }),
        revealedBunkerCards: [],
        revealedThreatCards: room.game.finalState && room.game.finalState.stage !== "not-started" ? room.game.finalCards.threats.slice(0, 1).map((card) => ({ ...card, revealedAt: new Date(room.updatedAt).toISOString() })) : [],
        revealedCatastrophe: room.game.finalState?.stage === "catastrophe" || room.game.finalState?.stage === "resolved" ? { ...room.game.finalCards.catastrophe, revealedAt: new Date(room.updatedAt).toISOString() } : null,
        deadlines: room.game.deadlines, ballot: room.game.ballot,
        tiedCharacterIds: [], outcome: room.game.outcome,
        finalState: room.game.finalState ? clone(room.game.finalState) : null
      },
      viewer: viewerMember?.role === "spectator" ? { role: "spectator", privateState: { participantId: viewer.profile.participantId, reason: "late-join" } } : {
        role: "participant",
        privateState: {
          participantId: viewer.profile.participantId,
          controlledCharacters: room.game.state.characters.filter((entry) => entry.controllerId === viewer.profile.participantId).map((entry) => ({ characterId: entry.id, controllerId: viewer.profile.participantId, cards: entry.hand })),
          pendingVote: null,
          legalActions: this.legalActions(room, viewer)
        }
      }
    } : null;
    return {
      roomId: room.roomId, version: room.version, name: room.name, status: room.status, hostId: room.hostId,
      settings: clone(room.settings),
      participants: room.members.map((member) => {
        const session = this.sessions.get(member.sessionId);
        if (!session) throw new Error("Dangling room member");
        const controlledCharacterCount = room.game ? room.game.state.characters.filter((entry) => entry.controllerId === session.profile.participantId).length : this.characterCount(room, session.profile.participantId);
        return { participantId: session.profile.participantId, nickname: session.profile.nickname, avatar: clone(session.profile.avatar), role: member.role, ready: member.ready, connected: session.connected, reconnectDeadline: session.reconnectDeadline === null ? null : new Date(session.reconnectDeadline).toISOString(), controlledCharacterCount };
      }),
      viewerProfile: clone(viewer.profile),
      viewerControlledCharacterIds: this.viewerControlledCharacterIds(room, viewer.profile.participantId),
      game, updatedAt: new Date(room.updatedAt).toISOString()
    };
  }

  private publicRoom(room: RoomRecord): object {
    const host = this.sessionByParticipant(room, room.hostId);
    return { roomId: room.roomId, name: room.name, status: room.status, participantCount: room.members.filter((entry) => entry.role !== "spectator").length, spectatorCount: room.members.filter((entry) => entry.role === "spectator").length, maxParticipants: room.settings.maxParticipants, hostNickname: host?.profile.nickname ?? "Anonymous", adultContent: room.adultContent, createdAt: new Date(room.createdAt).toISOString() };
  }

  private autoStart(room: RoomRecord): void { if (this.canStart(room)) this.startGame(room); }
  private canStart(room: RoomRecord): boolean {
    if (room.status !== "lobby" && room.status !== "post-game") return false;
    const participants = room.members.filter((entry) => entry.role !== "spectator");
    if (participants.length < 3 || participants.some((entry) => !entry.ready)) return false;
    if (participants.some((entry) => !this.sessions.get(entry.sessionId)?.connected)) return false;
    this.ensureAllocation(room);
    return Boolean(room.allocation && allocationIsStartable(room.allocation));
  }
  private ensureAllocation(room: RoomRecord): void {
    const ids = room.members.filter((entry) => entry.role !== "spectator").map((entry) => this.sessions.get(entry.sessionId)?.profile.participantId).filter((entry): entry is string => Boolean(entry));
    if (ids.length < 3) { room.allocation = null; return; }
    if (!room.allocation) room.allocation = createLobbyAllocation(ids, room.settings.fillToSix);
    else if (room.allocation.participantIds.join() !== ids.join() || room.allocation.fillToSix !== room.settings.fillToSix) room.allocation = reconcileRoster(room.allocation, ids, room.settings.fillToSix);
  }
  private reconcile(room: RoomRecord): void { this.ensureAllocation(room); for (const member of room.members) member.ready = false; }
  private characterCount(room: RoomRecord, participantId: string): number { return room.allocation ? allocations(room.allocation).find((entry) => entry.participantId === participantId)?.characterIds.length ?? 0 : 0; }
  private viewerControlledCharacterIds(room: RoomRecord, participantId: string): string[] {
    const member = room.members.find((entry) => this.sessions.get(entry.sessionId)?.profile.participantId === participantId);
    if (!member || member.role === "spectator") return [];
    if (room.status === "in-game" && room.game) return room.game.state.characters.filter((entry) => entry.controllerId === participantId).map((entry) => entry.id);
    if (!room.allocation) return [];
    return [...(allocations(room.allocation).find((entry) => entry.participantId === participantId)?.characterIds ?? [])];
  }

  private openBallot(room: RoomRecord): void {
    if (!room.game) throw new BunkerError("INVALID_PHASE");
    const eligible = room.game.state.characters.filter((entry) => entry.status === "active" || entry.status === "exiled").map((entry) => entry.id);
    const candidates = room.game.state.characters.filter((entry) => entry.status === "active").map((entry) => entry.id);
    room.game.ballot = { eligibleVoterIds: eligible, castVoterIds: [], notCastVoterIds: [...eligible], candidates, tally: Object.fromEntries(candidates.map((entry) => [entry, 0])) };
    this.advanceGamePhase(room, room.game.state.phase.startsWith("overtime") ? "overtime-voting" : "round-voting");
    this.schedulePhase(room, "voting");
  }
  private closeBallot(room: RoomRecord): void {
    if (!room.game?.ballot) throw new BunkerError("VOTE_CLOSED");
    this.cancelKind(room.game, "voting");
    room.game.ballot.notCastVoterIds = room.game.ballot.eligibleVoterIds.filter((entry) => !room.game?.ballot?.castVoterIds.includes(entry));
    const maximum = Math.max(...Object.values(room.game.ballot.tally ?? {}));
    const tied = Object.entries(room.game.ballot.tally ?? {}).filter(([, count]) => count === maximum).map(([characterId]) => characterId);
    if (tied.length === 1 || room.game.state.phase === "runoff-voting") {
      const target = tied.length === 1 ? tied[0]! : tied[new SeededRandom(`${room.game.state.seed}:lot:${room.game.state.version}`).integer(tied.length)]!;
      room.game.state = exileCharacter(room.game.state, { commandId: id("ballot"), gameId: room.game.state.gameId, expectedVersion: room.game.state.version, characterId: target });
      room.game.ballot = null;
      this.finishExpulsionAttempt(room);
      return;
    }
    if (room.game.state.humanParticipantCountAtGameStart <= 4 || (room.game.state.humanParticipantCountAtGameStart === 5 && room.game.state.baseRound === 1)) {
      room.game.ballot = null;
      this.finishExpulsionAttempt(room);
      return;
    }
    this.advanceGamePhase(room, "tie-defense");
    room.game.deadlines.tieDefense = new Date(this.now + 60_000).toISOString();
    const handle = this.scheduler.set(60_000, () => {
      if (!room.game || room.status !== "in-game") return;
      room.game.deadlines.tieDefense = null;
      this.advanceGamePhase(room, "runoff-voting");
      this.openBallot(room);
    });
    room.game.jobs.add(handle);
    room.game.jobByKind.set("tieDefense", handle);
  }
  private finishExpulsionAttempt(room: RoomRecord): void {
    if (!room.game) return;
    room.game.state = advanceRound(room.game.state, { commandId: id("advance"), gameId: room.game.state.gameId, expectedVersion: room.game.state.version });
    if (room.game.state.phase === "final") {
      if (room.settings.mode === "base") this.completeBaseGame(room);
      else this.startSurvivalFinal(room);
      return;
    }
    room.game.spokenCharacterIds.clear();
    this.schedulePhase(room, "selection");
    this.mutateRoom(room, false);
  }
  private completeBaseGame(room: RoomRecord): void {
    if (!room.game) return;
    const all = room.game.state.characters.map((entry) => ({ id: entry.id, professionCardId: entry.hand.find((card) => card.category === "profession")?.id ?? "unknown_profession", baggageCardIds: entry.hand.filter((card) => card.category === "baggage").map((card) => card.id) }));
    const activeIds = new Set(room.game.state.characters.filter((entry) => entry.status === "active").map((entry) => entry.id));
    const outcome = resolveBaseFinal(all.filter((entry) => activeIds.has(entry.id)), all, room.settings.finalGoal);
    room.game.outcome = { goal: room.settings.finalGoal, winningCharacterIds: [...outcome.winningCharacterIds], losingCharacterIds: [...outcome.losingCharacterIds], summaryKey: outcome.summaryKey };
    room.game.finalState = {
      mode: "base", goal: room.settings.finalGoal, stage: "resolved", currentSubjectCardId: null,
      currentGroup: null, utilityVote: null, groupProgress: [], outcome: clone(room.game.outcome)
    };
    room.game.state = { ...room.game.state, phase: "complete", version: room.game.state.version + 1 };
    room.lastGameSummary = clone(room.game.outcome);
    room.status = "post-game";
    for (const member of room.members) member.ready = false;
    this.cancelGameJobs(room);
    this.mutateRoom(room, false);
  }
  private startSurvivalFinal(room: RoomRecord): void {
    if (!room.game) return;
    const subjectCharacter = room.game.state.characters.find((entry) => entry.status === "active");
    const subject = subjectCharacter?.hand.find((card) => card.type === "character" && card.category === "profession");
    if (!subjectCharacter || !subject) throw new BunkerError("INVALID_CARD", "Survival final requires a profession subject");
    subjectCharacter.revealedCardIds instanceof Set && subjectCharacter.revealedCardIds.add(subject.id);
    const eligibleParticipantIds = [...new Set(room.members.filter((entry) => entry.role !== "spectator").map((entry) => this.sessions.get(entry.sessionId)?.profile.participantId).filter((entry): entry is string => Boolean(entry)))];
    const bunkerIds = room.game.state.characters.filter((entry) => entry.status === "active").map((entry) => entry.id);
    const exiledIds = room.game.state.characters.filter((entry) => entry.status === "exiled").map((entry) => entry.id);
    room.game.finalState = {
      mode: "survival-story", goal: room.settings.finalGoal, stage: "bunker-threat",
      currentSubjectCardId: subject.id, currentGroup: "bunker",
      utilityVote: { subjectCardId: subject.id, eligibleParticipantIds, castParticipantIds: [], usefulVotes: 0, notUsefulVotes: 0, resolvedUseful: null },
      groupProgress: [
        { group: "bunker", threatCardId: room.game.finalCards.threats[0]?.id ?? null, attempt: 0, requiredUsefulCards: 3, usefulCardIds: [], survivorCharacterIds: bunkerIds, defeated: null },
        { group: "exiled", threatCardId: room.game.finalCards.threats[1]?.id ?? null, attempt: 0, requiredUsefulCards: 3, usefulCardIds: [], survivorCharacterIds: exiledIds, defeated: null }
      ],
      outcome: null
    };
    this.mutateRoom(room, false);
  }
  private advanceGamePhase(room: RoomRecord, phase: GameState["phase"]): void {
    if (!room.game) return;
    room.game.state = { ...room.game.state, phase, version: room.game.state.version + 1 };
    this.mutateRoom(room, false);
  }
  private finishSpeech(room: RoomRecord): void {
    if (!room.game) return;
    this.cancelKind(room.game, "speech");
    room.game.spokenCharacterIds.add(room.game.state.activeCharacterId);
    const active = room.game.state.characters.filter((entry) => entry.status === "active");
    const currentIndex = active.findIndex((entry) => entry.id === room.game?.state.activeCharacterId);
    const ordered = [...active.slice(currentIndex + 1), ...active.slice(0, currentIndex + 1)];
    const next = ordered.find((entry) => !room.game?.spokenCharacterIds.has(entry.id));
    if (next) {
      room.game.state = { ...room.game.state, activeCharacterId: next.id, phase: room.game.state.phase.startsWith("overtime") ? "overtime-selection" : "round-selection", version: room.game.state.version + 1 };
      this.schedulePhase(room, "selection");
      this.mutateRoom(room, false);
    } else {
      this.advanceGamePhase(room, room.game.state.phase.startsWith("overtime") ? "overtime-discussion" : "round-discussion");
      this.schedulePhase(room, "discussion");
    }
  }
  private schedulePhase(room: RoomRecord, kind: "selection" | "speech" | "discussion" | "voting"): void {
    if (!room.game) return;
    const seconds = room.settings.timers[kind];
    if (seconds === null) { room.game.deadlines[kind] = null; return; }
    const gameId = room.game.state.gameId;
    room.game.deadlines[kind] = new Date(this.now + seconds * 1_000).toISOString();
    const handle = this.scheduler.set(seconds * 1_000, () => {
      const game = room.game;
      if (!game || game.state.gameId !== gameId || room.status !== "in-game") return;
      game.jobs.delete(handle);
      game.jobByKind.delete(kind);
      game.deadlines[kind] = null;
      if (kind === "selection") {
        try { game.state = revealOrdinaryCard(game.state, { commandId: id("timer"), gameId, expectedVersion: game.state.version, characterId: game.state.activeCharacterId }, new SeededRandom(`${game.state.seed}:timer`)); } catch { return; }
        this.schedulePhase(room, "speech");
      } else if (kind === "speech") this.finishSpeech(room);
      else if (kind === "discussion") this.openBallot(room);
      else this.closeBallot(room);
      this.mutateRoom(room, false);
    });
    room.game.jobs.add(handle);
    room.game.jobByKind.set(kind, handle);
  }
  private cancelKind(game: GameRecord, kind: keyof GameRecord["deadlines"]): void {
    const handle = game.jobByKind.get(kind);
    if (handle) { this.scheduler.clear(handle); game.jobs.delete(handle); game.jobByKind.delete(kind); }
    game.deadlines[kind] = null;
  }
  private cancelGameJobs(room: RoomRecord): void { if (room.game) { for (const job of room.game.jobs) this.scheduler.clear(job); room.game.jobs.clear(); room.game.jobByKind.clear(); for (const kind of Object.keys(room.game.deadlines) as Array<keyof GameRecord["deadlines"]>) room.game.deadlines[kind] = null; } }

  private transferHost(room: RoomRecord): void {
    const connectedParticipant = room.members.sort((a, b) => a.seat - b.seat).find((entry) => entry.role !== "spectator" && this.sessions.get(entry.sessionId)?.connected);
    const next = connectedParticipant ?? room.members.find((entry) => this.sessions.get(entry.sessionId)?.connected);
    if (!next) return;
    for (const member of room.members) if (member.role === "host") member.role = "participant";
    next.role = next.role === "spectator" ? "spectator" : "host";
    const session = this.sessions.get(next.sessionId);
    if (session) room.hostId = session.profile.participantId;
  }
  private expireSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const room = session.roomId ? this.rooms.get(session.roomId) : undefined;
    if (room) {
      const wasHost = room.hostId === session.profile.participantId;
      const member = room.members.find((entry) => entry.sessionId === sessionId);
      room.members = room.members.filter((entry) => entry.sessionId !== sessionId);
      if (room.status === "in-game" && room.game) {
        const replacement = room.members.filter((entry) => entry.role !== "spectator" && this.sessions.get(entry.sessionId)?.connected).sort((a, b) => a.seat - b.seat)[0];
        const replacementId = replacement ? this.sessions.get(replacement.sessionId)?.profile.participantId : undefined;
        if (replacementId) room.game.state = { ...room.game.state, characters: room.game.state.characters.map((entry) => entry.controllerId === session.profile.participantId ? { ...entry, controllerId: replacementId } : entry) };
      } else if (member) this.reconcile(room);
      if (wasHost) this.transferHost(room);
      this.mutateRoom(room, false);
      this.scheduleEmptyCleanup(room);
    }
    this.sessions.delete(sessionId);
    this.sessionsByToken.delete(session.reconnectToken);
  }
  private scheduleEmptyCleanup(room: RoomRecord): void {
    if (room.members.length > 0) return;
    if (room.cleanupJob) this.scheduler.clear(room.cleanupJob);
    room.cleanupJob = this.scheduler.set(this.config.emptyRoomTtlMs, () => {
      if (room.members.length === 0) { this.cancelGameJobs(room); this.rooms.delete(room.roomId); }
    });
  }

  private verifyAvatar(avatar: ReturnType<typeof profileInputSchema.parse>["avatar"]): void {
    if (!avatar || avatar.kind !== "uploaded") return;
    const bytes = Buffer.from(avatar.dataUrl.slice(avatar.dataUrl.indexOf(",") + 1), "base64");
    if (bytes.length !== avatar.bytes || bytes.length > 256_000) throw new BunkerError("INVALID_PAYLOAD", "Avatar byte count mismatch");
    const signature = bytes.subarray(0, 12).toString("hex");
    const valid = avatar.mimeType === "image/png" ? signature.startsWith("89504e470d0a1a0a") : avatar.mimeType === "image/jpeg" ? signature.startsWith("ffd8ff") : signature.startsWith("52494646") && bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) throw new BunkerError("INVALID_PAYLOAD", "Avatar signature mismatch");
  }
  private validatePacks(packs: readonly CustomPack[]): void { for (const pack of packs) if (!validatePack(pack).valid) throw new BunkerError("PACK_INVALID"); }
  private legalActions(room: RoomRecord, session: SessionRecord): string[] {
    if (!room.game) return [];
    const owns = room.game.state.characters.some((entry) => entry.controllerId === session.profile.participantId);
    return owns ? ["game:reveal-card", "game:cast-vote", "game:play-special-condition"] : [];
  }
  private rateLimit(sessionId: string): void {
    const cutoff = this.now - 60_000;
    const recent = (this.commandWindows.get(sessionId) ?? []).filter((entry) => entry > cutoff);
    if (recent.length >= this.config.maxCommandsPerMinute) throw new BunkerError("RATE_LIMITED");
    recent.push(this.now); this.commandWindows.set(sessionId, recent);
  }
  private requireHost(room: RoomRecord, session: SessionRecord): void { if (room.hostId !== session.profile.participantId) throw new BunkerError("NOT_HOST"); }
  private requireSession(sessionId: string): SessionRecord { const entry = this.sessions.get(sessionId); if (!entry || entry.expiresAt <= this.now) throw new BunkerError("SESSION_EXPIRED"); return entry; }
  private sessionByToken(token: string): SessionRecord { const sessionId = this.sessionsByToken.get(token); if (!sessionId) throw new BunkerError("RECONNECT_TOKEN_INVALID"); return this.requireSession(sessionId); }
  private requireRoom(roomId: string): RoomRecord { const room = this.rooms.get(roomId); if (!room || room.status === "closed") throw new BunkerError("NOT_FOUND"); return room; }
  private sessionByParticipant(room: RoomRecord, participantId: string): SessionRecord | undefined { return room.members.map((entry) => this.sessions.get(entry.sessionId)).find((entry) => entry?.profile.participantId === participantId); }
  private sessionDto(session: SessionRecord): object { return { sessionId: session.sessionId, reconnectToken: session.reconnectToken, profile: clone(session.profile), expiresAt: new Date(session.expiresAt).toISOString() }; }
  private touchRoom(roomId?: string): void { if (roomId) { const room = this.rooms.get(roomId); if (room) this.mutateRoom(room, false); } }
  private mutateRoom(room: RoomRecord, resetReady: boolean): void { room.version += 1; room.updatedAt = this.now; if (resetReady) for (const member of room.members) member.ready = false; }
  private assertAccepting(): void { if (!this.accepting) throw new BunkerError("BACKEND_UNAVAILABLE"); }
  private asBunkerError(error: unknown): BunkerError { if (error instanceof BunkerError) return error; const code = error instanceof Error && ["STALE_STATE", "INVALID_PHASE", "INVALID_TARGET", "INVALID_CARD", "FORBIDDEN", "VOTE_CLOSED"].includes(error.message) ? error.message as ErrorCode : "INTERNAL_ERROR"; return new BunkerError(code); }
  private get now(): number { return this.scheduler.now().getTime(); }
}

export const safeCorrelationId = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 12);
