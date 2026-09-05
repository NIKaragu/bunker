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
  io.on("connection", (socket) => {
    const sessionId = socket.data.sessionId as string;
    for (const name of Object.keys(clientCommandSchemas) as ClientCommandName[]) {
      socket.on(name, (raw: unknown, acknowledge?: (value: unknown) => void) => {
        try {
          const payload = clientCommandSchemas[name].parse(raw) as Record<string, unknown>;
          const data = service.command(sessionId, name, payload);
          const response = { ok: true, protocolVersion: PROTOCOL_VERSION, data };
          acknowledge?.(response);
          const snapshot = service.roomForToken(String(socket.handshake.auth.reconnectToken));
          if (snapshot) socket.emit("room:snapshot", snapshot);
        } catch (error) {
          const response = failure(error);
          acknowledge?.(response);
          socket.emit("protocol:error", response);
        }
      });
    }
    socket.on("disconnect", () => {
      try { service.disconnect(sessionId); } catch { /* already expired */ }
    });
  });
  return io;
};
