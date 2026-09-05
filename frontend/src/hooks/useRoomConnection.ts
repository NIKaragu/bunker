"use client";

import { useCallback, useEffect } from "react";
import { api } from "@/lib/api";
import { realtime } from "@/lib/realtime";
import { useAppStore } from "@/lib/store";

export function useRoomConnection(roomId: string) {
  const { session, room, setRoom, setConnection, clearSession, setNotice } = useAppStore();

  const reload = useCallback(async () => {
    if (!session) return;
    try {
      const current = await api.currentRoom(session.reconnectToken);
      if (current.roomId !== roomId) throw new Error("You are no longer in this room.");
      setRoom(current);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not restore room");
    }
  }, [roomId, session, setNotice, setRoom]);

  useEffect(() => {
    if (!session) return;
    void reload();
    realtime.connect(session.reconnectToken, {
      snapshot: setRoom,
      gameSnapshot: (game) => {
        const latest = useAppStore.getState().room;
        if (latest) setRoom({ ...latest, game });
      },
      connection: setConnection,
      expired: clearSession,
    });
    return () => realtime.close();
  }, [clearSession, reload, session, setConnection, setRoom]);

  return { room, reload };
}
