"use client";

import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GameTable } from "@/components/GameTable";
import { Lobby } from "@/components/Lobby";
import { useRoomConnection } from "@/hooks/useRoomConnection";
import { useAppStore } from "@/lib/store";

export default function RoomPage() {
  const params = useParams<{ roomId: string }>();
  const { room, reload } = useRoomConnection(params.roomId);
  const locale = useAppStore((state) => state.locale);
  return <AppShell>{!room ? <section className="card stack"><h1>{locale === "uk" ? "Відновлюємо кімнату" : "Restoring room"}</h1><p className="muted">{locale === "uk" ? "Перевіряємо токен і актуальний стан…" : "Checking your token and latest state…"}</p><button onClick={() => void reload()}>{locale === "uk" ? "Повторити" : "Retry"}</button></section> : room.status === "lobby" ? <Lobby room={room} /> : <GameTable room={room} />}</AppShell>;
}
