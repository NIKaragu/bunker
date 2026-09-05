import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, test } from "vitest";
import { BUNKER_PARTY_CHARACTER_DECKS, PROTOCOL_VERSION } from "../../packages/contracts/src/index.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { attachRealtime, detachRealtime } from "../src/realtime.js";
import { FakeScheduler } from "../src/scheduler.js";
import { BunkerError, BunkerService } from "../src/service.js";

const settings = {
  minParticipants: 3 as const,
  maxParticipants: 15 as const,
  fillToSix: false,
  mode: "base" as const,
  finalGoal: "salvation" as const,
  timers: { selection: null, speech: null, discussion: null, voting: null },
  tiePolicy: "participant-count-v1" as const,
  overtimePolicy: "single-attempt-until-capacity-v1" as const,
  selectedPackIds: ["pack_general_v1"],
  characterDecks: [...BUNKER_PARTY_CHARACTER_DECKS]
};
const profile = (index: number) => ({ nickname: `Realtime Player ${index}`, locale: "en" as const });

type Session = { sessionId: string; reconnectToken: string; profile: { participantId: string } };
type Snapshot = {
  roomId: string;
  version: number;
  status: string;
  participants: Array<{ participantId: string; ready: boolean; connected: boolean }>;
  viewerProfile: { participantId: string };
};

const waitForSnapshot = (socket: ClientSocket, predicate: (snapshot: Snapshot) => boolean): Promise<Snapshot> => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => {
    socket.off("room:snapshot", listener);
    reject(new Error("Timed out waiting for room snapshot"));
  }, 2_000);
  const listener = (snapshot: Snapshot) => {
    if (!predicate(snapshot)) return;
    clearTimeout(timeout);
    socket.off("room:snapshot", listener);
    resolve(snapshot);
  };
  socket.on("room:snapshot", listener);
});

const waitUntil = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

describe("realtime room synchronization", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.();
  });

  const setup = async () => {
    const clock = new FakeScheduler();
    const config = loadConfig({ CORS_ORIGINS: "http://127.0.0.1", SESSION_GRACE_MS: "60000" });
    const service = new BunkerService(config, clock);
    const server: HttpServer = createServer(createApp(service, config));
    const io = attachRealtime(server, service, config);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const sockets: ClientSocket[] = [];
    cleanups.push(async () => {
      for (const socket of sockets) socket.disconnect();
      detachRealtime(io);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
      service.shutdown();
    });
    const connect = async (token: string) => {
      const socket = createClient(`http://127.0.0.1:${port}`, {
        auth: { protocolVersion: PROTOCOL_VERSION, reconnectToken: token },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false
      });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("connect_error", reject);
      });
      return socket;
    };
    return { service, clock, connect };
  };

  test("broadcasts viewer-safe join and readiness snapshots to both players", async () => {
    const { service, connect } = await setup();
    const host = service.createSession(profile(1)) as Session;
    const room = service.createRoom(host.sessionId, { name: "Realtime Room", settings, customPacks: [], adultContentConfirmed: false }) as Snapshot;
    const hostSocket = await connect(host.reconnectToken);
    const resyncedHost = waitForSnapshot(hostSocket, (snapshot) => snapshot.roomId === room.roomId && snapshot.participants.length === 1);
    const resyncAck = await hostSocket.emitWithAck("room:resync", {
      protocolVersion: PROTOCOL_VERSION,
      commandId: "host_resync_command_0001",
      roomId: room.roomId,
      expectedVersion: 999_999
    }) as { ok: boolean };
    const initialHost = await resyncedHost;
    expect(resyncAck.ok).toBe(true);

    const guest = service.createSession(profile(2)) as Session;
    const guestSocket = await connect(guest.reconnectToken);
    const hostJoined = waitForSnapshot(hostSocket, (snapshot) => snapshot.participants.length === 2);
    const guestJoined = waitForSnapshot(guestSocket, (snapshot) => snapshot.participants.length === 2);
    service.joinRoom(guest.sessionId, room.roomId);
    const [hostView, guestView] = await Promise.all([hostJoined, guestJoined]);

    expect(hostView.viewerProfile.participantId).toBe(host.profile.participantId);
    expect(guestView.viewerProfile.participantId).toBe(guest.profile.participantId);
    const hostReady = waitForSnapshot(hostSocket, (snapshot) => snapshot.participants.some((participant) => participant.participantId === guest.profile.participantId && participant.ready));
    const guestReady = waitForSnapshot(guestSocket, (snapshot) => snapshot.participants.some((participant) => participant.participantId === guest.profile.participantId && participant.ready));
    const ack = await guestSocket.emitWithAck("room:set-ready", {
      protocolVersion: PROTOCOL_VERSION,
      commandId: "guest_ready_command_0001",
      roomId: room.roomId,
      expectedVersion: guestView.version,
      ready: true
    }) as { ok: boolean };
    expect(ack.ok).toBe(true);
    expect((await hostReady).participants).toHaveLength(2);
    expect((await guestReady).participants).toHaveLength(2);
    expect(initialHost.participants).toHaveLength(1);
  });

  test("acknowledges the last readiness and deals the table to every client", async () => {
    const { service, connect } = await setup();
    const players = [4, 5, 6].map((index) => service.createSession(profile(index)) as Session);
    const room = service.createRoom(players[0]!.sessionId, { name: "Auto Start Room", settings, customPacks: [], adultContentConfirmed: false }) as Snapshot;
    for (const player of players.slice(1)) service.joinRoom(player.sessionId, room.roomId);
    const sockets: ClientSocket[] = [];
    for (const player of players) sockets.push(await connect(player.reconnectToken));

    const dealt = sockets.map((socket) => waitForSnapshot(socket, (snapshot) => snapshot.status === "in-game"));
    for (const [index, socket] of sockets.entries()) {
      const view = service.currentRoom(players[index]!.sessionId) as Snapshot;
      const ack = await socket.emitWithAck("room:set-ready", {
        protocolVersion: PROTOCOL_VERSION,
        commandId: `auto_start_ready_${index}`,
        roomId: room.roomId,
        expectedVersion: view.version,
        ready: true
      }) as { ok: boolean; error?: { code: string } };
      expect(ack.error?.code).toBeUndefined();
      expect(ack.ok).toBe(true);
    }

    for (const snapshot of await Promise.all(dealt)) expect(snapshot.status).toBe("in-game");
  });

  test("keeps a reloaded session alive until its last overlapping socket disconnects", async () => {
    const { service, clock, connect } = await setup();
    const session = service.createSession(profile(3)) as Session;
    service.createRoom(session.sessionId, { name: "Reload Room", settings, customPacks: [], adultContentConfirmed: false });
    const oldSocket = await connect(session.reconnectToken);
    const replacementSocket = await connect(session.reconnectToken);

    oldSocket.disconnect();
    await waitUntil(() => (service.currentRoom(session.sessionId) as Snapshot).participants[0]?.connected === true);
    clock.advance(60_001);
    expect(() => service.currentRoom(session.sessionId)).not.toThrow();

    replacementSocket.disconnect();
    await waitUntil(() => (service.currentRoom(session.sessionId) as Snapshot).participants[0]?.connected === false);
    clock.advance(60_001);
    expect(() => service.currentRoom(session.sessionId)).toThrowError(BunkerError);
  });
});
