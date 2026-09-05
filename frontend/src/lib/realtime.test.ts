import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (...args: never[]) => void;
const sockets: Array<ReturnType<typeof fakeSocket>> = [];

function fakeSocket() {
  const handlers = new Map<string, Handler>();
  return {
    connected: true,
    disconnect: vi.fn(),
    on: vi.fn((event: string, handler: Handler) => { handlers.set(event, handler); }),
    emit: vi.fn(),
    timeout: vi.fn().mockReturnThis(),
    io: { on: vi.fn() },
  };
}

vi.mock("socket.io-client", () => ({
  io: vi.fn(() => {
    const socket = fakeSocket();
    sockets.push(socket);
    return socket;
  }),
}));

import { RealtimeClient } from "./realtime";

describe("RealtimeClient cleanup", () => {
  beforeEach(() => {
    sockets.length = 0;
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  });

  it("an old disposer cannot close the newer socket", () => {
    const client = new RealtimeClient();
    const listeners = { snapshot: vi.fn(), connection: vi.fn(), expired: vi.fn() };
    const disposeOld = client.connect("old-token", "room-1", () => 1, listeners);
    const oldSocket = sockets[0]!;
    const disposeNew = client.connect("new-token", "room-1", () => 2, listeners);
    const newSocket = sockets[1]!;

    expect(oldSocket.disconnect).toHaveBeenCalledTimes(1);
    disposeOld();
    expect(newSocket.disconnect).not.toHaveBeenCalled();
    disposeNew();
    expect(newSocket.disconnect).toHaveBeenCalledTimes(1);
  });
});
