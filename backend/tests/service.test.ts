import { describe, expect, test } from "vitest";
import { BUNKER_PARTY_CHARACTER_DECKS, PROTOCOL_VERSION } from "../../packages/contracts/src/index.js";
import { loadConfig } from "../src/config.js";
import { FakeScheduler } from "../src/scheduler.js";
import { BunkerError, BunkerService } from "../src/service.js";

const settings = (fillToSix = false, forceProfessionFirstRound = true) => ({
  forceProfessionFirstRound,
  minParticipants: 3 as const,
  maxParticipants: 15 as const,
  fillToSix,
  mode: "base" as const,
  finalGoal: "salvation" as const,
  timers: { selection: null, speech: null, discussion: null, voting: null },
  tiePolicy: "participant-count-v1" as const,
  overtimePolicy: "single-attempt-until-capacity-v1" as const,
  selectedPackIds: ["pack_general_v1"],
  characterDecks: [...BUNKER_PARTY_CHARACTER_DECKS]
});
type Snapshot = {
  version: number;
  status: string;
  game: null | {
    publicState: {
      gameId: string; phase: string; baseRound: number; scheduledExilesThisRound: number;
      activeCharacterId: string | null;
      characters: Array<{ characterId: string; seat: number; status: string; controller: { participantId: string } | null }>;
      ballot: null | { candidates: string[]; castVoterIds: string[]; notCastVoterIds: string[]; eligibleVoterIds: string[] };
    };
    viewer: { privateState: { legalActions?: string[]; controlledCharacters?: Array<{ characterId: string; cards: Array<{ id: string; category?: string }>; votedForCharacterId: string | null }> } };
  };
};
const profile = (index: number) => ({ nickname: `Player ${index}`, locale: "en" as const, avatar: { kind: "dicebear" as const, style: "identicon" as const, seed: `player-${index}` } });
const make = () => {
  const clock = new FakeScheduler();
  const service = new BunkerService(loadConfig({ CORS_ORIGINS: "https://bunker.example", SESSION_GRACE_MS: "60000", EMPTY_ROOM_TTL_MS: "60000" }), clock);
  return { service, clock };
};

describe("BunkerService", () => {
  test("creates a session without an avatar", () => {
    const { service } = make();
    const session = service.createSession({ nickname: "No Avatar", locale: "en" }) as { profile: { nickname: string; avatar?: unknown } };

    expect(session.profile.nickname).toBe("No Avatar");
    expect(session.profile).not.toHaveProperty("avatar");
  });
  test("reserves normalized nicknames until reconnect grace expires", () => {
    const { service, clock } = make();
    const first = service.createSession({ ...profile(1), nickname: "  Alice   Smith " }) as { sessionId: string; reconnectToken: string };
    expect(() => service.createSession({ ...profile(2), nickname: "alice smith" })).toThrowError(BunkerError);
    service.disconnect(first.sessionId);
    clock.advance(60_001);
    expect(() => service.createSession({ ...profile(2), nickname: "alice smith" })).not.toThrow();
  });

  test("serializes fill-to-six claims and never allocates a seventh character", () => {
    const { service } = make();
    const sessions = [1, 2, 3, 4].map((index) => service.createSession(profile(index)) as { sessionId: string });
    let room = service.createRoom(sessions[0]!.sessionId, { name: "Claim Room", settings: settings(true), customPacks: [], adultContentConfirmed: false }) as { roomId: string; version: number };
    for (const session of sessions.slice(1)) service.joinRoom(session!.sessionId, room.roomId);
    room = service.currentRoom(sessions[0]!.sessionId) as typeof room;
    const outcomes = sessions.map((session, index) => {
      try {
        const value = service.command(session!.sessionId, "room:claim-extra-character", { protocolVersion: PROTOCOL_VERSION, commandId: `claim_command_${index}`, roomId: room.roomId, expectedVersion: room.version });
        room = service.currentRoom(sessions[0]!.sessionId) as typeof room;
        return value;
      } catch (error) {
        room = service.currentRoom(sessions[0]!.sessionId) as typeof room;
        return error;
      }
    });
    expect(outcomes.filter((value) => !(value instanceof Error))).toHaveLength(2);
    const snapshot = service.currentRoom(sessions[0]!.sessionId) as { participants: Array<{ controlledCharacterCount: number }> };
    expect(snapshot.participants.reduce((sum, entry) => sum + entry.controlledCharacterCount, 0)).toBe(6);
  });

  test("acknowledges an exact duplicate without incrementing room version", () => {
    const { service } = make();
    const session = service.createSession(profile(1)) as { sessionId: string };
    const room = service.createRoom(session.sessionId, { name: "Idempotent", settings: settings(), customPacks: [], adultContentConfirmed: false }) as { roomId: string; version: number };
    const payload = { protocolVersion: PROTOCOL_VERSION, commandId: "ready_command_0001", roomId: room.roomId, expectedVersion: room.version, ready: true };
    const first = service.command(session.sessionId, "room:set-ready", payload);
    const second = service.command(session.sessionId, "room:set-ready", payload);
    expect(second).toEqual({ ...first, duplicate: true });
  });

  test("starts the table when the last participant declares readiness", () => {
    const { service } = make();
    const sessions = [1, 2, 3].map((index) => service.createSession(profile(index)) as { sessionId: string });
    const created = service.createRoom(sessions[0]!.sessionId, { name: "Ready Room", settings: settings(), customPacks: [], adultContentConfirmed: false }) as { roomId: string };
    for (const session of sessions.slice(1)) service.joinRoom(session!.sessionId, created.roomId);
    const current = () => service.currentRoom(sessions[0]!.sessionId) as { version: number; status: string; game: { publicState: { characters: Array<{ seat: number }> } } | null };

    sessions.forEach((session, index) => {
      service.command(session!.sessionId, "room:set-ready", { protocolVersion: PROTOCOL_VERSION, commandId: `ready_command_${index}`, roomId: created.roomId, expectedVersion: current().version, ready: true });
    });

    const started = current();
    expect(started.status).toBe("in-game");
    const seats = started.game?.publicState.characters.map((entry) => entry.seat) ?? [];
    expect(seats).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test("rejects a deck selection the selected packs cannot deal instead of failing at start", () => {
    const { service } = make();
    const session = service.createSession(profile(1)) as { sessionId: string };
    const combined = { ...settings(), characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact", "superpower", "phobia", "personality"] };

    expect(() => service.createRoom(session.sessionId, { name: "Combined Room", settings: combined, customPacks: [], adultContentConfirmed: false }))
      .toThrowError(expect.objectContaining({ code: "PACK_UNSUPPORTED" }));
  });

  const startedTable = (roomSettings = settings()) => {
    const { service, clock } = make();
    const sessions = [1, 2, 3].map((index) => service.createSession(profile(index)) as { sessionId: string; profile: { participantId: string } });
    const created = service.createRoom(sessions[0]!.sessionId, { name: "Loop Room", settings: roomSettings, customPacks: [], adultContentConfirmed: false }) as { roomId: string };
    for (const session of sessions.slice(1)) service.joinRoom(session!.sessionId, created.roomId);
    let counter = 0;
    const view = (index: number) => service.currentRoom(sessions[index]!.sessionId) as Snapshot;
    const send = (index: number, name: string, body: Record<string, unknown> = {}) => {
      const snapshot = view(index);
      return service.command(sessions[index]!.sessionId, name, {
        protocolVersion: PROTOCOL_VERSION, commandId: `loop_command_${counter += 1}`, roomId: created.roomId,
        gameId: snapshot.game?.publicState.gameId, expectedVersion: snapshot.version, ...body
      });
    };
    sessions.forEach((_, index) => send(index, "room:set-ready", { ready: true }));
    const ownerOf = (characterId: string) => {
      const controller = view(0).game!.publicState.characters.find((entry) => entry.characterId === characterId)!.controller!.participantId;
      return sessions.findIndex((session) => session!.profile.participantId === controller);
    };
    const takeTurn = () => {
      const active = view(0).game!.publicState.activeCharacterId!;
      const index = ownerOf(active);
      const legal = view(index).game!.viewer.privateState.legalActions!;
      const cardId = legal.find((action) => action.startsWith("game:reveal-card:"))!.slice("game:reveal-card:".length);
      send(index, "game:reveal-card", { characterId: active, cardId });
      send(index, "game:end-speech", { characterId: active });
      return active;
    };
    return { service, clock, sessions, roomId: created.roomId, view, send, ownerOf, takeTurn };
  };

  test("walks the reveal circle and honours the expulsion schedule", () => {
    const table = startedTable();
    expect(table.view(0).game?.publicState.phase).toBe("round-selection");
    expect(table.view(0).game?.publicState.scheduledExilesThisRound).toBe(0);

    const spoke = [table.takeTurn(), table.takeTurn(), table.takeTurn(), table.takeTurn(), table.takeTurn(), table.takeTurn()];

    expect(new Set(spoke).size).toBe(6);
    expect(table.view(0).game?.publicState.phase).toBe("round-discussion");

    // Six characters owe no expulsion in round 1, so no ballot opens at all.
    expect(table.view(0).game?.publicState.ballot).toBeNull();
    table.send(0, "game:end-discussion");
    const next = table.view(0).game!.publicState;
    expect(next.baseRound).toBe(2);
    expect(next.phase).toBe("round-selection");
    expect(next.ballot).toBeNull();
    expect(next.characters.every((entry) => entry.status === "active")).toBe(true);
  });

  test("only the active controller may reveal, and only in round 1's profession deck", () => {
    const table = startedTable();
    const active = table.view(0).game!.publicState.activeCharacterId!;
    const index = table.ownerOf(active);
    const actions = table.view(index).game!.viewer.privateState.legalActions!;
    const hand = table.view(index).game!.viewer.privateState.controlledCharacters!.find((entry) => entry.characterId === active)!.cards;
    const offered = actions.filter((action) => action.startsWith("game:reveal-card:")).map((action) => action.slice("game:reveal-card:".length));

    expect(offered).toHaveLength(1);
    expect(hand.find((card) => card.id === offered[0])?.category).toBe("profession");
    expect(actions).toContain("game:reveal-card");
    expect(actions).not.toContain("game:end-speech");

    const idle = [0, 1, 2].find((entry) => entry !== index) as number;
    expect(table.view(idle).game!.viewer.privateState.legalActions).not.toContain("game:reveal-card");
    expect(() => table.send(index, "game:end-speech", { characterId: active })).toThrowError(expect.objectContaining({ code: "INVALID_PHASE" }));
  });

  /** Plays the reveal circle of the current round and stops in the discussion. */
  const reachDiscussion = (table: ReturnType<typeof startedTable>) => {
    while (table.view(0).game!.publicState.phase.includes("selection")) table.takeTurn();
  };

  test("opens the ballot with the discussion so nobody waits on the host", () => {
    const table = startedTable();
    reachDiscussion(table);
    table.send(0, "game:end-discussion"); // round 1 owes no expulsion
    reachDiscussion(table);
    table.send(0, "game:end-discussion"); // round 2 owes no expulsion
    reachDiscussion(table);

    const state = table.view(0).game!.publicState;
    expect(state.baseRound).toBe(3);
    expect(state.phase).toBe("round-discussion");
    expect(state.scheduledExilesThisRound).toBe(1);
    // The ballot is already open: discussion and voting run together.
    expect(state.ballot?.candidates).toHaveLength(6);
    expect(state.ballot).not.toHaveProperty("tally");
  });

  test("keeps the ballot secret, moves a changed vote, and settles once everyone has voted", () => {
    const table = startedTable();
    for (let round = 1; round <= 2; round += 1) { reachDiscussion(table); table.send(0, "game:end-discussion"); }
    reachDiscussion(table);

    const ballot = table.view(0).game!.publicState.ballot!;
    const voter = table.view(0).game!.viewer.privateState.controlledCharacters![0]!.characterId;
    const [first, second] = ballot.candidates.filter((entry) => entry !== voter) as [string, string];

    table.send(0, "game:cast-vote", { voterCharacterId: voter, targetCharacterId: first });
    table.send(0, "game:cast-vote", { voterCharacterId: voter, targetCharacterId: second });
    const after = table.view(0).game!.publicState.ballot!;
    expect(after.castVoterIds).toEqual([voter]);
    expect(after.notCastVoterIds).toHaveLength(5);

    // Everyone else piles onto the same candidate; the last vote settles the round.
    // The candidate itself cannot vote against itself, so it picks someone else.
    for (let index = 0; index < 3; index += 1) {
      for (const hand of table.view(index).game!.viewer.privateState.controlledCharacters!) {
        if (hand.characterId === voter) continue;
        const target = hand.characterId === second ? first : second;
        table.send(index, "game:cast-vote", { voterCharacterId: hand.characterId, targetCharacterId: target });
      }
    }

    const settled = table.view(0).game!.publicState;
    expect(settled.ballot).toBeNull();
    expect(settled.baseRound).toBe(4);
    expect(settled.phase).toBe("round-selection");
    expect(settled.characters.find((entry) => entry.characterId === second)?.status).toBe("exiled");
  });

  test("refuses a self-vote and reports each character its own recorded choice", () => {
    const table = startedTable();
    for (let round = 1; round <= 2; round += 1) { reachDiscussion(table); table.send(0, "game:end-discussion"); }
    reachDiscussion(table);

    const mine = table.view(0).game!.viewer.privateState.controlledCharacters!;
    const voter = mine[0]!.characterId;
    const other = table.view(0).game!.publicState.ballot!.candidates.find((entry) => entry !== voter) as string;

    expect(() => table.send(0, "game:cast-vote", { voterCharacterId: voter, targetCharacterId: voter }))
      .toThrowError(expect.objectContaining({ code: "INVALID_TARGET" }));
    expect(table.view(0).game!.viewer.privateState.controlledCharacters![0]!.votedForCharacterId).toBeNull();

    table.send(0, "game:cast-vote", { voterCharacterId: voter, targetCharacterId: other });
    const recorded = table.view(0).game!.viewer.privateState.controlledCharacters!;
    expect(recorded.find((entry) => entry.characterId === voter)?.votedForCharacterId).toBe(other);
    // The viewer's other character is untouched, and nobody else sees this vote.
    expect(recorded.find((entry) => entry.characterId !== voter)?.votedForCharacterId).toBeNull();
    expect(table.view(1).game!.viewer.privateState.controlledCharacters!.every((entry) => entry.votedForCharacterId === null)).toBe(true);

    const moved = table.view(0).game!.publicState.ballot!.candidates.find((entry) => entry !== voter && entry !== other) as string;
    table.send(0, "game:cast-vote", { voterCharacterId: voter, targetCharacterId: moved });
    expect(table.view(0).game!.viewer.privateState.controlledCharacters!.find((entry) => entry.characterId === voter)?.votedForCharacterId).toBe(moved);
  });

  test("lets a host open round one to any card without touching the default", () => {
    const forced = startedTable();
    const forcedActive = forced.view(0).game!.publicState.activeCharacterId!;
    const forcedOffers = forced.view(forced.ownerOf(forcedActive)).game!.viewer.privateState.legalActions!
      .filter((action) => action.startsWith("game:reveal-card:"));
    expect(forcedOffers).toHaveLength(1);

    const open = startedTable(settings(false, false));
    const active = open.view(0).game!.publicState.activeCharacterId!;
    const index = open.ownerOf(active);
    const offers = open.view(index).game!.viewer.privateState.legalActions!
      .filter((action) => action.startsWith("game:reveal-card:"))
      .map((action) => action.slice("game:reveal-card:".length));
    const hand = open.view(index).game!.viewer.privateState.controlledCharacters!.find((entry) => entry.characterId === active)!.cards;

    expect(offers).toHaveLength(6);
    const hobby = hand.find((card) => card.category === "hobby")!;
    expect(offers).toContain(hobby.id);
    open.send(index, "game:reveal-card", { characterId: active, cardId: hobby.id });
    expect(open.view(0).game?.publicState.phase).toBe("round-speech");
  });

  test("removes empty rooms and their scheduled work after the configured TTL", () => {
    const { service, clock } = make();
    const session = service.createSession(profile(1)) as { sessionId: string };
    service.createRoom(session.sessionId, { name: "Temporary", settings: settings(), customPacks: [], adultContentConfirmed: false });
    service.leaveRoom(session.sessionId);
    expect(service.stats.rooms).toBe(1);
    clock.advance(60_001);
    expect(service.stats).toMatchObject({ rooms: 0, jobs: 0 });
  });
});
