// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomSnapshot, Session } from "./client-types";

const { restoreSession } = vi.hoisted(() => ({ restoreSession: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, api: { ...actual.api, restoreSession } };
});

import { useAppStore } from "./store";

const session = (token: string): Session => ({
  sessionId: "session-1",
  reconnectToken: token,
  profile: { participantId: "participant-1", nickname: "Tester", locale: "en" },
  expiresAt: "2027-01-01T00:00:00.000Z",
}) as unknown as Session;

describe("app session bootstrap", () => {
  beforeEach(() => {
    window.localStorage.clear();
    restoreSession.mockReset();
    useAppStore.setState({ hydrated: false, bootstrap: "idle", session: null, room: null, connection: "idle", notice: null });
  });

  it("does not expose a persisted session until restore succeeds", async () => {
    window.localStorage.setItem("bunker:v1:session", JSON.stringify(session("persisted-token-that-is-long-enough-123")));
    let finish!: (value: Session) => void;
    restoreSession.mockReturnValue(new Promise<Session>((resolve) => { finish = resolve; }));

    const restoring = useAppStore.getState().hydrate();
    expect(restoreSession).toHaveBeenCalledWith("persisted-token-that-is-long-enough-123");
    expect(useAppStore.getState()).toMatchObject({ bootstrap: "restoring", hydrated: false, session: null });

    finish(session("rotated-token-that-is-long-enough-12345"));
    await restoring;
    expect(useAppStore.getState()).toMatchObject({ bootstrap: "ready", hydrated: true, session: { reconnectToken: "rotated-token-that-is-long-enough-12345" } });
    expect(JSON.parse(window.localStorage.getItem("bunker:v1:session") ?? "null")).toMatchObject({ reconnectToken: "rotated-token-that-is-long-enough-12345" });
  });
});

describe("room snapshot ordering", () => {
  it("applies newer readiness and rejects a stale snapshot", () => {
    const room = (version: number, ready: boolean) => ({
      roomId: "room-1",
      version,
      participants: [{ participantId: "participant-1", ready }],
      game: null,
    }) as unknown as RoomSnapshot;

    useAppStore.setState({ room: null, selectedCharacterId: null });
    useAppStore.getState().setRoom(room(1, false));
    useAppStore.getState().setRoom(room(2, true));
    useAppStore.getState().setRoom(room(1, false));

    expect(useAppStore.getState().room?.version).toBe(2);
    expect(useAppStore.getState().room?.participants[0]?.ready).toBe(true);
  });
});
