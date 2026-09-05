import {
  PROTOCOL_VERSION,
  clientCommandSchemas,
  commandAckSchema,
  serverEventSchemas,
  type ClientCommandName,
  type CommandAck,
} from "@bunker/contracts";
import { io, type Socket } from "socket.io-client";
import type { RoomSnapshot } from "./client-types";
import { isTerminalSessionCode } from "./api";

type Listeners = {
  snapshot: (snapshot: RoomSnapshot) => void;
  gameSnapshot?: (snapshot: NonNullable<RoomSnapshot["game"]>) => void;
  connection: (state: "connected" | "reconnecting" | "offline") => void;
  expired: () => void;
  invalidEvent?: (event: string) => void;
};

const commandId = () => crypto.randomUUID().replaceAll("-", "");

export class RealtimeClient {
  private socket: Socket | undefined;

  connect(reconnectToken: string, roomId: string, getVersion: () => number, listeners: Listeners): () => void {
    this.close();
    const url = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!url) {
      listeners.connection("offline");
      return () => undefined;
    }

    const socket = io(url, {
      auth: { protocolVersion: PROTOCOL_VERSION, reconnectToken },
      transports: ["websocket", "polling"],
      reconnectionDelayMax: 4_000,
    });
    this.socket = socket;

    const meta = () => ({ protocolVersion: PROTOCOL_VERSION, commandId: commandId(), roomId, expectedVersion: getVersion() });
    socket.on("connect", () => {
      listeners.connection("connected");
      void this.emit(socket, "room:subscribe", meta())
        .then((ack) => {
          if (!ack.ok) throw new Error(ack.error.code);
          return this.emit(socket, "room:resync", meta());
        })
        .then((ack) => { if (!ack.ok) throw new Error(ack.error.code); })
        .catch(() => listeners.connection("offline"));
    });
    socket.io.on("reconnect_attempt", () => listeners.connection("reconnecting"));
    socket.on("disconnect", () => listeners.connection("reconnecting"));
    socket.on("connect_error", (error) => {
      if (isTerminalSessionCode(error.message)) listeners.expired();
      else listeners.connection("offline");
    });

    this.onValidated(socket, "room:snapshot", serverEventSchemas["room:snapshot"], listeners.snapshot, listeners.invalidEvent);
    this.onValidated(socket, "session:restored", serverEventSchemas["session:restored"], listeners.snapshot, listeners.invalidEvent);
    this.onValidated(socket, "game:snapshot", serverEventSchemas["game:snapshot"], (snapshot) => listeners.gameSnapshot?.(snapshot), listeners.invalidEvent);
    this.onValidated(socket, "protocol:error", serverEventSchemas["protocol:error"], (failure) => {
      if (isTerminalSessionCode(failure.error.code)) listeners.expired();
    }, listeners.invalidEvent);

    return () => {
      socket.disconnect();
      if (this.socket === socket) this.socket = undefined;
    };
  }

  command(name: ClientCommandName, payload: unknown): Promise<CommandAck> {
    if (!this.socket) return Promise.reject(new Error("BACKEND_UNAVAILABLE"));
    return this.emit(this.socket, name, payload);
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.disconnect();
  }

  private emit(socket: Socket, name: ClientCommandName, payload: unknown): Promise<CommandAck> {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error("BACKEND_UNAVAILABLE"));
      const validated = clientCommandSchemas[name].parse(payload);
      socket.timeout(10_000).emit(name, validated, (error: Error | null, ack: unknown) => {
        if (error) reject(error);
        else {
          try { resolve(commandAckSchema.parse(ack)); }
          catch { reject(new Error("INVALID_SERVER_RESPONSE")); }
        }
      });
    });
  }

  private onValidated<T>(socket: Socket, event: string, schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, listener: (value: T) => void, invalid?: (event: string) => void): void {
    socket.on(event, (payload: unknown) => {
      const parsed = schema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
      else invalid?.(event);
    });
  }
}

let activeClient: RealtimeClient | undefined;

export const realtime = {
  bind(client: RealtimeClient): () => void {
    activeClient = client;
    return () => { if (activeClient === client) activeClient = undefined; };
  },
  command(name: ClientCommandName, payload: unknown): Promise<CommandAck> {
    return activeClient?.command(name, payload) ?? Promise.reject(new Error("BACKEND_UNAVAILABLE"));
  },
};
