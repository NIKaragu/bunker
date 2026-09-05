"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { CreateRoom } from "./CreateRoom";

export function RoomBrowser() {
  const router = useRouter();
  const { locale, session, rooms, setRooms, setRoom } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const requestRef = useRef<{ generation: number; controller?: AbortController }>({ generation: 0 });

  const load = useCallback(async (foreground = false) => {
    if (!session) return;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    const generation = ++requestRef.current.generation;
    requestRef.current.controller = controller;
    if (foreground) setState("loading");
    try {
      const nextRooms = await api.listRooms(session.reconnectToken, controller.signal);
      if (generation !== requestRef.current.generation || useAppStore.getState().session?.reconnectToken !== session.reconnectToken) return;
      setRooms(nextRooms);
      setState("ready");
    } catch {
      if (!controller.signal.aborted && generation === requestRef.current.generation) setState("error");
    }
  }, [session, setRooms]);
  useEffect(() => {
    const requests = requestRef.current;
    const refresh = () => void load(false);
    const refreshVisible = () => { if (document.visibilityState === "visible") refresh(); };
    const kickoff = window.setTimeout(() => void load(true), 0);
    const id = window.setInterval(refreshVisible, 5_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      requests.generation += 1;
      requests.controller?.abort();
      window.clearTimeout(kickoff);
      window.clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [load]);

  if (creating) return <CreateRoom onCancel={() => setCreating(false)} />;
  return (
    <section className="stack">
      <div className="hero row between"><div><p className="eyebrow">Live directory</p><h1>{locale === "uk" ? "Знайдіть свою команду" : "Find your crew"}</h1></div><button className="primary" onClick={() => setCreating(true)}>＋ {locale === "uk" ? "Створити" : "Create"}</button></div>
      <section className="card stack" aria-busy={state === "loading"}>
        <div className="row between"><h2>{locale === "uk" ? "Відкриті кімнати" : "Open rooms"}</h2><button className="ghost" onClick={() => void load(true)}>{locale === "uk" ? "Оновити" : "Refresh"}</button></div>
        {state === "loading" && <p role="status" className="muted">{locale === "uk" ? "Шукаємо сигнал…" : "Scanning for rooms…"}</p>}
        {state === "error" && <div className="notice"><p>{locale === "uk" ? "Не вдалося завантажити кімнати." : "Rooms could not be loaded."}</p><button onClick={() => void load(true)}>{locale === "uk" ? "Спробувати ще" : "Try again"}</button></div>}
        {state === "ready" && rooms.length === 0 && <p className="muted">{locale === "uk" ? "Поки тихо. Створіть першу кімнату." : "It's quiet. Create the first room."}</p>}
        <ul className="room-list">{rooms.map((room) => <li key={room.roomId}><div><strong>{room.name}</strong><p className="muted">{room.hostNickname} · {room.participantCount}/{room.maxParticipants} · {room.status}</p></div><button onClick={async () => { if (!session) return; const joined = await api.joinRoom(session.reconnectToken, room.roomId); setRoom(joined); router.push(`/room/${room.roomId}`); }}>{room.status === "lobby" ? (locale === "uk" ? "Увійти" : "Join") : (locale === "uk" ? "Дивитися" : "Watch")}</button></li>)}</ul>
      </section>
    </section>
  );
}
