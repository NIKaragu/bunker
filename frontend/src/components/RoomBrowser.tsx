"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { CreateRoom } from "./CreateRoom";

export function RoomBrowser() {
  const router = useRouter();
  const { locale, session, rooms, setRooms, setRoom } = useAppStore();
  const [creating, setCreating] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    if (!session) return;
    setState("loading");
    try { setRooms(await api.listRooms(session.reconnectToken)); setState("ready"); }
    catch { setState("error"); }
  }, [session, setRooms]);
  useEffect(() => {
    const kickoff = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 10_000);
    return () => { window.clearTimeout(kickoff); window.clearInterval(id); };
  }, [load]);

  if (creating) return <CreateRoom onCancel={() => setCreating(false)} />;
  return (
    <section className="stack">
      <div className="hero row between"><div><p className="eyebrow">Live directory</p><h1>{locale === "uk" ? "Знайдіть свою команду" : "Find your crew"}</h1></div><button className="primary" onClick={() => setCreating(true)}>＋ {locale === "uk" ? "Створити" : "Create"}</button></div>
      <section className="card stack" aria-busy={state === "loading"}>
        <div className="row between"><h2>{locale === "uk" ? "Відкриті кімнати" : "Open rooms"}</h2><button className="ghost" onClick={() => void load()}>{locale === "uk" ? "Оновити" : "Refresh"}</button></div>
        {state === "loading" && <p role="status" className="muted">{locale === "uk" ? "Шукаємо сигнал…" : "Scanning for rooms…"}</p>}
        {state === "error" && <div className="notice"><p>{locale === "uk" ? "Не вдалося завантажити кімнати." : "Rooms could not be loaded."}</p><button onClick={() => void load()}>{locale === "uk" ? "Спробувати ще" : "Try again"}</button></div>}
        {state === "ready" && rooms.length === 0 && <p className="muted">{locale === "uk" ? "Поки тихо. Створіть першу кімнату." : "It's quiet. Create the first room."}</p>}
        <ul className="room-list">{rooms.map((room) => <li key={room.roomId}><div><strong>{room.name}</strong><p className="muted">{room.hostNickname} · {room.participantCount}/{room.maxParticipants} · {room.status}</p></div><button onClick={async () => { if (!session) return; const joined = await api.joinRoom(session.reconnectToken, room.roomId); setRoom(joined); router.push(`/room/${room.roomId}`); }}>{room.status === "lobby" ? (locale === "uk" ? "Увійти" : "Join") : (locale === "uk" ? "Дивитися" : "Watch")}</button></li>)}</ul>
      </section>
    </section>
  );
}
