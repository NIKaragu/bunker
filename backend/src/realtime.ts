import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  PROTOCOL_VERSION,
  clientCommandSchemas,
  socketHandshakeAuthSchema,
  type ClientCommandName
} from "../../packages/contracts/src/index.js";
import type { ServerConfig } from "./config.js";
import { BunkerError, BunkerService } from "./service.js";

const failure = (error: unknown) => {
  const bunker = error instanceof BunkerError ? error : new BunkerError("INVALID_PAYLOAD");
  return { ok: false as const, protocolVersion: PROTOCOL_VERSION, error: { code: bunker.code, message: bunker.message } };
};

const realtimeCleanup = new WeakMap<Server, () => void>();

export const detachRealtime = (io: Server): void => {
  realtimeCleanup.get(io)?.();
  realtimeCleanup.delete(io);
};

export const attachRealtime = (server: HttpServer, service: BunkerService, config: ServerConfig) => {
  const io = new Server(server, {
    maxHttpBufferSize: config.maxPayloadBytes,
    cors: { credentials: true, origin: [...config.corsOrigins] },
    transports: ["websocket", "polling"]
  });
  io.use((socket, next) => {
    try {
      const auth = socketHandshakeAuthSchema.parse(socket.handshake.auth);
      socket.data.sessionId = service.sessionIdForToken(auth.reconnectToken);
      next();
    } catch (error) { next(error instanceof Error ? error : new Error("AUTH_REQUIRED")); }
  });

  const pendingRooms = new Map<string, boolean>();
  let flushScheduled = false;
  const syncSocketRoom = (socket: { data: Record<string, unknown>; join(room: string): unknown; leave(room: string): unknown }) => {
    const sessionId = socket.data.sessionId as string;
    let desiredRoomId: string | undefined;
    try { desiredRoomId = service.roomIdForSession(sessionId); } catch { desiredRoomId = undefined; }
    const currentRoomId = socket.data.roomId as string | undefined;
    if (currentRoomId && currentRoomId !== desiredRoomId) void socket.leave(currentRoomId);
    if (desiredRoomId && currentRoomId !== desiredRoomId) void socket.join(desiredRoomId);
    socket.data.roomId = desiredRoomId;
    return desiredRoomId;
  };
  const flushRoomSnapshots = () => {
    flushScheduled = false;
    const changedRooms = new Map(pendingRooms);
    pendingRooms.clear();
    for (const socket of io.sockets.sockets.values()) {
      const previousRoomId = socket.data.roomId as string | undefined;
      const roomId = syncSocketRoom(socket);
      if (!roomId) {
        if (previousRoomId && changedRooms.get(previousRoomId)) socket.emit("protocol:error", failure(new BunkerError("NOT_FOUND")));
        continue;
      }
      if (!changedRooms.has(roomId)) continue;
      try {
        const snapshot = service.roomForToken(String(socket.handshake.auth.reconnectToken));
        if (snapshot) socket.emit("room:snapshot", snapshot);
      } catch { /* session or room was removed while synchronizing */ }
    }
  };
  const publishRoom = (roomId: string, invalidated = false) => {
    pendingRooms.set(roomId, invalidated || (pendingRooms.get(roomId) ?? false));
    if (flushScheduled) return;
    flushScheduled = true;
    queueMicrotask(flushRoomSnapshots);
  };
  const unsubscribe = service.onRoomChange(publishRoom);
  realtimeCleanup.set(io, unsubscribe);
  io.engine.once("close", () => detachRealtime(io));

  io.on("connection", (socket) => {
    const sessionId = socket.data.sessionId as string;
    const roomId = service.connectSocket(sessionId, socket.id);
    syncSocketRoom(socket);
    if (roomId) publishRoom(roomId);
    for (const name of Object.keys(clientCommandSchemas) as ClientCommandName[]) {
      socket.on(name, (raw: unknown, acknowledge?: (value: unknown) => void) => {
        try {
          const payload = clientCommandSchemas[name].parse(raw) as Record<string, unknown>;
          const data = service.command(sessionId, name, payload);
          const response = { ok: true, protocolVersion: PROTOCOL_VERSION, data };
          acknowledge?.(response);
          syncSocketRoom(socket);
          publishRoom(data.roomId);
        } catch (error) {
          const response = failure(error);
          acknowledge?.(response);
          socket.emit("protocol:error", response);
        }
      });
    }
    socket.on("disconnect", () => {
      try { service.disconnect(sessionId, socket.id); } catch { /* already expired */ }
    });
  });
  return io;
};
