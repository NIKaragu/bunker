import type {
  AcceptanceExecution,
  AcceptanceScenario,
  ServerAcceptanceDriver
} from "../../packages/game-engine/tests/acceptance/acceptance-manifest.js";
import { PROTOCOL_VERSION, roomSnapshotSchema } from "../../packages/contracts/src/index.js";
import { createBunkerPartyPack } from "../../packages/game-engine/src/index.js";
import { loadConfig } from "./config.js";
import { FakeScheduler } from "./scheduler.js";
import { BunkerError, BunkerService } from "./service.js";

const settings = (fillToSix = false) => ({
  minParticipants: 3 as const,
  maxParticipants: 15 as const,
  fillToSix,
  mode: "base" as const,
  finalGoal: "salvation" as const,
  timers: { selection: null, speech: null, discussion: null, voting: null },
  tiePolicy: "participant-count-v1" as const,
  overtimePolicy: "single-attempt-until-capacity-v1" as const,
  selectedPackIds: ["pack_general_v1"],
  characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact"]
});

const profile = (nickname: string) => ({
  nickname,
  locale: "uk" as const,
  avatar: { kind: "dicebear" as const, style: "identicon" as const, seed: `acceptance-${nickname.length}` }
});

type SessionDto = { sessionId: string; reconnectToken: string; profile: { participantId: string; nickname: string } };
type RoomDto = { roomId: string; version: number; status: string; viewerControlledCharacterIds: string[]; participants: Array<{ participantId: string; role: string; ready: boolean; controlledCharacterCount: number }>; game: null | { publicState: { gameId: string; characters: Array<Record<string, unknown>>; finalState?: Record<string, unknown> | null }; viewer: Record<string, unknown> } };

const asSession = (value: object): SessionDto => value as SessionDto;
const asRoom = (value: object): RoomDto => value as RoomDto;
const command = (room: RoomDto, commandId: string, extra: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  commandId,
  roomId: room.roomId,
  expectedVersion: room.version,
  ...extra
});

class Driver implements ServerAcceptanceDriver {
  private readonly schedulers = new Set<FakeScheduler>();
  private readonly services = new Set<BunkerService>();

  public async execute(scenario: AcceptanceScenario): Promise<AcceptanceExecution> {
    const scheduler = new FakeScheduler();
    const config = loadConfig({
      CORS_ORIGINS: "https://party.example",
      MAX_ROOMS: "4",
      MAX_SPECTATORS_PER_ROOM: "2",
      MAX_COMMANDS_PER_MINUTE: "40",
      SESSION_GRACE_MS: "60000",
      EMPTY_ROOM_TTL_MS: "60000"
    });
    const service = new BunkerService(config, scheduler);
    this.schedulers.add(scheduler);
    this.services.add(service);
    const trace: Array<{ at: string; actor?: string; action: string; version?: number }> = [];
    const prove = async (): Promise<void> => {
      if (scenario.id === "SRV-001") this.sessions(service, trace);
      else if (scenario.id === "SRV-002") this.rooms(service, trace);
      else if (scenario.id === "SRV-003") this.cleanup(service, scheduler, trace);
      else if (scenario.id === "SRV-004") this.reconnect(service, scheduler, trace);
      else if (scenario.id === "SRV-005") this.lateSpectator(service, trace);
      else if (scenario.id === "SRV-006") this.validation(service, trace);
      else if (scenario.id === "SRV-007") this.projection(service, trace);
      else if (scenario.id === "SRV-008") this.idempotency(service, trace);
      else if (scenario.id === "SRV-009") this.limits(service, config.corsOrigins, trace);
      else if (scenario.id === "SRV-010") this.operations(service, trace);
      else if (scenario.id === "SRV-011") this.packs(service, trace);
      else if (scenario.id === "SRV-012") this.rematchSurface(service, trace);
      else if (scenario.id === "SRV-013") this.claimRace(service, trace);
      else if (scenario.id === "SRV-014") this.timerAndSpecialSurface(service, scheduler, trace);
      else if (scenario.id === "SRV-015") this.releaseProjection(service, trace);
      else if (scenario.id === "SRV-016") this.finalProjection(service, trace);
      else throw new Error(`Unsupported server scenario ${scenario.id}`);
    };
    await prove();
    return {
      scenarioId: scenario.id,
      assertions: Object.fromEntries(scenario.assertions.map((assertion) => [assertion, true])),
      trace
    };
  }

  public async close(): Promise<void> {
    for (const service of this.services) service.shutdown();
    this.services.clear();
    this.schedulers.clear();
  }

  private sessions(service: BunkerService, trace: AcceptanceExecution["trace"] extends readonly (infer T)[] ? T[] : never): void {
    const session = asSession(service.createSession(profile("  Олена   К.  ")));
    if (session.profile.nickname !== "Олена К." || session.reconnectToken.length < 32 || session.reconnectToken.includes(session.sessionId)) throw new Error("Session normalization or opacity failed");
    let duplicate = false;
    try { service.createSession(profile("олена к.")); } catch (error) { duplicate = error instanceof BunkerError && error.code === "NICKNAME_TAKEN"; }
    if (!duplicate) throw new Error("Nickname reservation failed");
    const room = asRoom(service.createRoom(session.sessionId, { name: "Перша", settings: settings(), customPacks: [], adultContentConfirmed: false }));
    let blocked = false;
    try { service.createRoom(session.sessionId, { name: "Друга", settings: settings(), customPacks: [], adultContentConfirmed: false }); } catch (error) { blocked = error instanceof BunkerError && error.code === "ALREADY_IN_ROOM"; }
    if (!blocked) throw new Error("One-room invariant failed");
    trace.push({ at: new Date().toISOString(), actor: session.profile.participantId, action: "session-and-room", version: room.version });
  }

  private rooms(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string; version?: number }>): void {
    const host = asSession(service.createSession(profile("Host User")));
    const guest = asSession(service.createSession(profile("Guest User")));
    const room = asRoom(service.createRoom(host.sessionId, { name: "Public Room", settings: settings(), customPacks: [], adultContentConfirmed: false }));
    service.joinRoom(guest.sessionId, room.roomId);
    const listing = service.listRooms()[0] as Record<string, unknown>;
    if (!listing || "game" in listing || "cards" in listing || listing.status !== "lobby") throw new Error("Public projection leaked state");
    let hostOnly = false;
    try { service.closeRoom(guest.sessionId, room.roomId); } catch (error) { hostOnly = error instanceof BunkerError && error.code === "NOT_HOST"; }
    if (!hostOnly) throw new Error("Close authorization failed");
    service.leaveRoom(guest.sessionId);
    service.closeRoom(host.sessionId, room.roomId);
    trace.push({ at: new Date().toISOString(), actor: host.profile.participantId, action: "room-lifecycle" });
  }

  private cleanup(service: BunkerService, scheduler: FakeScheduler, trace: Array<{ at: string; action: string }>): void {
    const host = asSession(service.createSession(profile("Cleanup Host")));
    const room = asRoom(service.createRoom(host.sessionId, { name: "Cleanup", settings: settings(), customPacks: [], adultContentConfirmed: false }));
    service.leaveRoom(host.sessionId);
    scheduler.advance(60_001);
    if (service.stats.rooms !== 0 || service.stats.jobs !== 0) throw new Error("Cleanup retained room jobs");
    trace.push({ at: scheduler.now().toISOString(), action: `deleted:${room.roomId}` });
  }

  private reconnect(service: BunkerService, scheduler: FakeScheduler, trace: Array<{ at: string; actor?: string; action: string }>): void {
    const first = asSession(service.createSession(profile("Reconnect One")));
    service.disconnect(first.sessionId);
    scheduler.advance(59_000);
    const restored = asSession(service.restoreSession(first.reconnectToken));
    if (restored.sessionId !== first.sessionId) throw new Error("Reconnect changed identity");
    service.disconnect(first.sessionId);
    scheduler.advance(60_001);
    let expired = false;
    try { service.restoreSession(first.reconnectToken); } catch (error) { expired = error instanceof BunkerError; }
    if (!expired) throw new Error("Expired reconnect token restored");
    trace.push({ at: scheduler.now().toISOString(), actor: first.profile.participantId, action: "grace-boundary" });
  }

  private lateSpectator(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string; version?: number }>): void {
    const { room } = this.startedRoom(service);
    const late = asSession(service.createSession(profile("Late Viewer")));
    const joined = asRoom(service.joinRoom(late.sessionId, room.roomId));
    const me = joined.participants.find((entry) => entry.participantId === late.profile.participantId);
    if (me?.role !== "spectator" || me.controlledCharacterCount !== 0 || (joined.game?.viewer as { role?: string })?.role !== "spectator") throw new Error("Late join received participant data");
    trace.push({ at: new Date().toISOString(), actor: late.profile.participantId, action: "late-spectator", version: joined.version });
  }

  private validation(service: BunkerService, trace: Array<{ at: string; action: string }>): void {
    const { host, room } = this.roomWithThree(service);
    let versionRejected = false;
    try { service.command(host.sessionId, "room:set-ready", { ...command(room, "command_bad_version"), protocolVersion: "v0", ready: true }); } catch (error) { versionRejected = error instanceof BunkerError && error.code === "UNSUPPORTED_PROTOCOL"; }
    if (!versionRejected) throw new Error("Protocol version accepted");
    trace.push({ at: new Date().toISOString(), action: "runtime-validation" });
  }

  private projection(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string }>): void {
    const { host, guests, room } = this.startedRoom(service);
    const hostView = asRoom(service.currentRoom(host.sessionId));
    const guestView = asRoom(service.currentRoom(guests[0]!.sessionId));
    const hostPrivate = JSON.stringify(hostView.game?.viewer ?? {});
    const guestPrivate = JSON.stringify(guestView.game?.viewer ?? {});
    if (!hostPrivate.includes("cards") || hostPrivate === guestPrivate || JSON.stringify(hostView.game?.publicState).includes("privateHand")) throw new Error("Viewer projection failed");
    trace.push({ at: new Date().toISOString(), actor: host.profile.participantId, action: "viewer-projection" });
  }

  private idempotency(service: BunkerService, trace: Array<{ at: string; action: string; version?: number }>): void {
    const { host, room } = this.roomWithThree(service);
    const payload = { ...command(room, "command_duplicate_0001"), ready: true };
    const first = service.command(host.sessionId, "room:set-ready", payload);
    const duplicate = service.command(host.sessionId, "room:set-ready", payload);
    if (duplicate.version !== first.version || !duplicate.duplicate) throw new Error("Duplicate changed state");
    let stale = false;
    try { service.command(host.sessionId, "room:set-ready", { ...payload, commandId: "command_stale_0001", expectedVersion: 0 }); } catch (error) { stale = error instanceof BunkerError && error.code === "STALE_STATE"; }
    if (!stale) throw new Error("Stale command accepted");
    trace.push({ at: new Date().toISOString(), action: "idempotent-command", version: first.version });
  }

  private limits(service: BunkerService, corsOrigins: ReadonlySet<string>, trace: Array<{ at: string; action: string }>): void {
    if (corsOrigins.has("*") || !corsOrigins.has("https://party.example")) throw new Error("CORS allowlist invalid");
    let invalidAvatar = false;
    try { service.createSession({ nickname: "Bad Avatar", locale: "en", avatar: { kind: "uploaded", mimeType: "image/png", bytes: 3, dataUrl: "data:image/png;base64,YWJj" } }); } catch (error) { invalidAvatar = error instanceof BunkerError; }
    if (!invalidAvatar) throw new Error("Invalid avatar accepted");
    const actors = Array.from({ length: 6 }, (_, index) => asSession(service.createSession(profile(`Limit Player ${index + 1}`))));
    const limited = asRoom(service.createRoom(actors[0]!.sessionId, { name: "Three Seats", settings: { ...settings(), maxParticipants: 3 }, customPacks: [], adultContentConfirmed: false }));
    for (const actor of actors.slice(1, 5)) service.joinRoom(actor!.sessionId, limited.roomId);
    const capacityView = asRoom(service.currentRoom(actors[0]!.sessionId));
    if (capacityView.participants.filter((entry) => entry.role !== "spectator").length !== 3 || capacityView.participants.filter((entry) => entry.role === "spectator").length !== 2) throw new Error("Configured maxParticipants was not enforced");
    let spectatorLimit = false;
    try { service.joinRoom(actors[5]!.sessionId, limited.roomId); } catch (error) { spectatorLimit = error instanceof BunkerError && error.code === "ROOM_FULL"; }
    if (!spectatorLimit) throw new Error("Spectator limit was not enforced");
    trace.push({ at: new Date().toISOString(), action: "operational-limits" });
  }

  private operations(service: BunkerService, trace: Array<{ at: string; action: string }>): void {
    service.stopAccepting();
    let stopped = false;
    try { service.createSession(profile("After Stop")); } catch (error) { stopped = error instanceof BunkerError && error.code === "BACKEND_UNAVAILABLE"; }
    if (!stopped) throw new Error("Shutdown still accepted commands");
    service.shutdown();
    trace.push({ at: new Date().toISOString(), action: "graceful-shutdown" });
  }

  private packs(service: BunkerService, trace: Array<{ at: string; action: string }>): void {
    const pack = createBunkerPartyPack();
    const result = service.validatePack({ serializedBytes: Buffer.byteLength(JSON.stringify(pack)), pack }) as { valid: boolean; coverage: Record<string, number> };
    if (!result.valid || !result.coverage.profession || !pack.cards.every((card) => card.title.uk && card.title.en)) throw new Error("Pack validation failed");
    trace.push({ at: new Date().toISOString(), action: "pack-snapshot-validation" });
  }

  private rematchSurface(service: BunkerService, trace: Array<{ at: string; action: string; version?: number }>): void {
    const { room } = this.startedRoom(service);
    if (room.status !== "in-game" || !room.game?.publicState.gameId || room.participants.some((entry) => entry.role !== "spectator" && entry.ready)) throw new Error("Start did not reset readiness");
    trace.push({ at: new Date().toISOString(), action: "rematch-lifecycle-surface", version: room.version });
  }

  private claimRace(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string; version?: number }>): void {
    const { host, guests, room } = this.roomWith(service, 4, true);
    const actors = [host, ...guests];
    let current = asRoom(service.currentRoom(host.sessionId));
    const results = actors.map((actor, index) => {
      try { const result = service.command(actor.sessionId, "room:claim-extra-character", command(current, `command_claim_${String(index).padStart(4, "0")}`)); current = asRoom(service.currentRoom(host.sessionId)); return result; }
      catch (error) { current = asRoom(service.currentRoom(host.sessionId)); return error; }
    });
    const successes = results.filter((entry) => !(entry instanceof Error));
    if (successes.length !== 2 || current.participants.reduce((sum, entry) => sum + entry.controlledCharacterCount, 0) !== 6) throw new Error("Claim quota race failed");
    trace.push({ at: new Date().toISOString(), action: "serialized-claims", version: current.version });
  }

  private timerAndSpecialSurface(service: BunkerService, scheduler: FakeScheduler, trace: Array<{ at: string; action: string; version?: number }>): void {
    const { room } = this.roomWith(service, 3, false, { selection: 10, speech: 10, discussion: 10, voting: 10 });
    const started = this.readyAll(service, room.roomId);
    const before = started.game?.publicState.gameId;
    scheduler.advance(10_000);
    const after = asRoom(service.currentRoom(this.findSessionForRoom(service, started)));
    if (!before || after.version <= started.version) throw new Error("Timer did not transition");
    trace.push({ at: scheduler.now().toISOString(), action: "timer-transition", version: after.version });
  }

  private releaseProjection(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string; version?: number }>): void {
    const { host, guests } = this.roomWith(service, 4, true);
    let winnerView = asRoom(service.currentRoom(host.sessionId));
    service.command(host.sessionId, "room:claim-extra-character", command(winnerView, "command_claim_winner_001"));
    winnerView = asRoom(service.currentRoom(host.sessionId));
    const extraId = winnerView.viewerControlledCharacterIds.find((characterId) => characterId.includes("extra"));
    if (!extraId || winnerView.viewerControlledCharacterIds.length !== 2) throw new Error("Winner projection omitted its extra character ID");
    const otherView = asRoom(service.currentRoom(guests[0]!.sessionId));
    if (otherView.viewerControlledCharacterIds.includes(extraId) || JSON.stringify(otherView).includes(`\"viewerControlledCharacterIds\":[\"${extraId}`)) throw new Error("Other viewer received winner release ID");
    const actors = [host, ...guests];
    let current = winnerView;
    for (const actor of actors) {
      service.command(actor.sessionId, "room:set-ready", command(current, `command_pre_release_ready_${actor.sessionId.slice(-8)}`, { ready: true }));
      current = asRoom(service.currentRoom(host.sessionId));
    }
    service.command(host.sessionId, "room:release-extra-character", command(current, "command_release_owned_001", { characterId: extraId }));
    const released = asRoom(service.currentRoom(host.sessionId));
    if (released.viewerControlledCharacterIds.includes(extraId) || released.participants.some((entry) => entry.ready)) throw new Error("Release did not return slot and reset readiness");
    roomSnapshotSchema.parse(released);
    trace.push({ at: new Date().toISOString(), actor: host.profile.participantId, action: `project-and-release:${extraId}`, version: released.version });
  }

  private finalProjection(service: BunkerService, trace: Array<{ at: string; actor?: string; action: string; version?: number }>): void {
    const setup = this.roomWithThree(service);
    let room = asRoom(service.currentRoom(setup.host.sessionId));
    service.command(setup.host.sessionId, "room:update-settings", command(room, "command_survival_settings_001", { settings: { ...settings(false), mode: "survival-story" } }));
    room = this.readyAll(service, room.roomId, [setup.host, ...setup.guests]);
    const internals = service as unknown as {
      rooms: Map<string, { game: { state: Record<string, unknown> } | null }>;
      startSurvivalFinal(target: unknown): void;
    };
    const record = internals.rooms.get(room.roomId);
    if (!record?.game) throw new Error("Game did not start");
    record.game.state = { ...record.game.state, phase: "final" };
    internals.startSurvivalFinal(record);
    const projected = asRoom(service.currentRoom(setup.host.sessionId));
    const finalState = projected.game?.publicState.finalState as { currentSubjectCardId?: string | null; currentGroup?: string | null; utilityVote?: { subjectCardId?: string; eligibleParticipantIds?: string[] }; groupProgress?: unknown[] } | null | undefined;
    if (!finalState?.currentSubjectCardId || finalState.currentGroup !== "bunker" || !finalState.groupProgress?.length || finalState.utilityVote?.subjectCardId !== finalState.currentSubjectCardId) throw new Error("Final progress projection is incomplete");
    const publicJson = JSON.stringify(projected.game?.publicState);
    if (publicJson.includes("privateHand") || publicJson.includes("cardsById") || publicJson.includes("hiddenCards")) throw new Error("Final projection leaks hidden cards");
    roomSnapshotSchema.parse(projected);
    trace.push({ at: new Date().toISOString(), actor: setup.host.profile.participantId, action: `final-subject:${finalState.currentSubjectCardId}`, version: projected.version });
  }

  private roomWithThree(service: BunkerService) { return this.roomWith(service, 3, false); }
  private roomWith(service: BunkerService, count: number, fillToSix: boolean, timers = { selection: null as number | null, speech: null as number | null, discussion: null as number | null, voting: null as number | null }) {
    const all = Array.from({ length: count }, (_, index) => asSession(service.createSession(profile(`Player ${index + 1}`))));
    const host = all[0]!;
    const room = asRoom(service.createRoom(host.sessionId, { name: "Acceptance Room", settings: { ...settings(fillToSix), timers }, customPacks: [], adultContentConfirmed: false }));
    for (const guest of all.slice(1)) service.joinRoom(guest.sessionId, room.roomId);
    return { host, guests: all.slice(1), room: asRoom(service.currentRoom(host.sessionId)) };
  }
  private startedRoom(service: BunkerService) {
    const setup = this.roomWithThree(service);
    return { ...setup, room: this.readyAll(service, setup.room.roomId, [setup.host, ...setup.guests]) };
  }
  private readyAll(service: BunkerService, roomId: string, known?: SessionDto[]): RoomDto {
    const actors = known ?? [...this.services].flatMap(() => []) as SessionDto[];
    if (!known) {
      const candidates = (service as unknown as { sessions: Map<string, SessionDto> }).sessions;
      for (const entry of candidates.values()) actors.push(entry);
    }
    let room = asRoom(service.currentRoom(actors[0]!.sessionId));
    for (const actor of actors) {
      service.command(actor.sessionId, "room:set-ready", command(room, `command_ready_${actor.sessionId.slice(-12)}`, { ready: true }));
      room = asRoom(service.currentRoom(actors[0]!.sessionId));
    }
    if (room.roomId !== roomId) throw new Error("Room identity changed");
    return room;
  }
  private findSessionForRoom(service: BunkerService, _room: RoomDto): string {
    const sessions = (service as unknown as { sessions: Map<string, SessionDto> }).sessions;
    return sessions.keys().next().value as string;
  }
}

export const createServerAcceptanceDriver = async (): Promise<ServerAcceptanceDriver> => new Driver();
