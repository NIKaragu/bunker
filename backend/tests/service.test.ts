import { describe, expect, test } from "vitest";
import { PROTOCOL_VERSION } from "../../packages/contracts/src/index.js";
import { loadConfig } from "../src/config.js";
import { FakeScheduler } from "../src/scheduler.js";
import { BunkerError, BunkerService } from "../src/service.js";

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
const profile = (index: number) => ({ nickname: `Player ${index}`, locale: "en" as const, avatar: { kind: "dicebear" as const, style: "identicon" as const, seed: `player-${index}` } });
const make = () => {
  const clock = new FakeScheduler();
  const service = new BunkerService(loadConfig({ CORS_ORIGINS: "https://bunker.example", SESSION_GRACE_MS: "60000", EMPTY_ROOM_TTL_MS: "60000" }), clock);
  return { service, clock };
};

describe("BunkerService", () => {
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
