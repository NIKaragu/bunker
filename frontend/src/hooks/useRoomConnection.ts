"use client";

import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { RealtimeClient, realtime } from "@/lib/realtime";
import { commandMeta, useAppStore } from "@/lib/store";

export function useRoomConnection(roomId: string) {
  const { session, room, setRoom, setConnection, clearSession, setNotice } = useAppStore();
  const clientRef = useRef<RealtimeClient | null>(null);
  const requestRef = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });
  if (clientRef.current == null) clientRef.current = new RealtimeClient();

  const fetchLatest = useCallback(async (reportFailure: boolean): Promise<boolean> => {
    if (!session) return false;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++requestRef.current.generation;
    requestRef.current.controller = controller;
    try {
      const current = await api.currentRoom(session.reconnectToken, controller.signal);
      if (generation !== requestRef.current.generation || useAppStore.getState().session?.reconnectToken !== session.reconnectToken) return false;
      if (current.roomId !== roomId) throw new Error("You are no longer in this room.");
      setRoom(current);
      return true;
    } catch (reason) {
      if (controller.signal.aborted || generation !== requestRef.current.generation) return false;
      if (reportFailure) setNotice(reason instanceof Error ? reason.message : "Could not restore room");
      return false;
    }
  }, [roomId, session, setNotice, setRoom]);

  const reload = useCallback(async () => { await fetchLatest(true); }, [fetchLatest]);

  const reconcile = useCallback(async () => {
    if (await fetchLatest(false)) return;
    const latest = useAppStore.getState().room;
    if (!latest || latest.roomId !== roomId) return;
    try { await clientRef.current?.command("room:resync", commandMeta(latest)); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Could not refresh room"); }
  }, [fetchLatest, roomId, setNotice]);

  useEffect(() => {
    if (!session) return;
    const requests = requestRef.current;
    void reload();
    const client = clientRef.current!;
    const unbind = realtime.bind(client);
    const dispose = client.connect(session.reconnectToken, roomId, () => {
      const current = useAppStore.getState().room;
      return current?.roomId === roomId ? current.version : 0;
    }, {
      snapshot: setRoom,
      gameSnapshot: (game) => {
        const latest = useAppStore.getState().room;
        if (latest) setRoom({ ...latest, game });
      },
      connection: setConnection,
      expired: clearSession,
      invalidEvent: (event) => setNotice(`Ignored invalid ${event} event`),
    });
    return () => {
      requests.generation += 1;
      requests.controller?.abort();
      dispose();
      unbind();
    };
  }, [clearSession, reload, roomId, session, setConnection, setNotice, setRoom]);

  return { room: room?.roomId === roomId ? room : null, reload, reconcile };
}
