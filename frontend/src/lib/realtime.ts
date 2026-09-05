import { PROTOCOL_VERSION, clientCommandSchemas, type ClientCommandName, type CommandAck } from "@bunker/contracts";
import { io, type Socket } from "socket.io-client";
import type { RoomSnapshot } from "./client-types";

type Listeners = {
  snapshot: (snapshot: RoomSnapshot) => void;
  gameSnapshot?: (snapshot: NonNullable<RoomSnapshot["game"]>) => void;
  connection: (state: "connected" | "reconnecting" | "offline") => void;
  expired: () => void;
};

export class RealtimeClient {
  private socket: Socket | undefined;

  connect(reconnectToken: string, listeners: Listeners): void {
    this.close();
    const url = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!url) {
      listeners.connection("offline");
      return;
    }
    const socket = io(url, { auth: { protocolVersion: PROTOCOL_VERSION, reconnectToken }, transports: ["websocket", "polling"], reconnectionDelayMax: 4_000 });
    this.socket = socket;
    socket.on("connect", () => listeners.connection("connected"));
    socket.io.on("reconnect_attempt", () => listeners.connection("reconnecting"));
    socket.on("disconnect", () => listeners.connection("reconnecting"));
    socket.on("connect_error", (error) => {
      if (error.message.includes("SESSION_EXPIRED")) listeners.expired();
      else listeners.connection("offline");
    });
    socket.on("room:snapshot", listeners.snapshot);
    socket.on("session:restored", listeners.snapshot);
    socket.on("game:snapshot", (snapshot: NonNullable<RoomSnapshot["game"]>) => listeners.gameSnapshot?.(snapshot));
  }

  command(name: ClientCommandName, payload: unknown): Promise<CommandAck> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) return reject(new Error("BACKEND_UNAVAILABLE"));
      const validated = clientCommandSchemas[name].parse(payload);
      this.socket.timeout(10_000).emit(name, validated, (error: Error | null, ack: CommandAck) => error ? reject(error) : resolve(ack));
    });
  }

  close(): void {
    this.socket?.disconnect();
    this.socket = undefined;
  }
}

export const realtime = new RealtimeClient();
