"use client";

import { createRoomInputSchema } from "@bunker/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";

const timerNames = ["selection", "speech", "discussion", "voting"] as const;
type TimerName = (typeof timerNames)[number];

export function CreateRoom({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { locale, session, setRoom } = useAppStore();
  const [name, setName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(10);
  const [fillToSix, setFillToSix] = useState(false);
  const [mode, setMode] = useState<"base" | "survival-story">("base");
  const [goal, setGoal] = useState<"salvation" | "revival">("salvation");
  const [timers, setTimers] = useState<Record<TimerName, number | null>>({ selection: null, speech: null, discussion: null, voting: null });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session) return;
    const payload = {
      name,
      settings: {
        minParticipants: 3,
        maxParticipants,
        fillToSix,
        mode,
        finalGoal: goal,
        timers,
        tiePolicy: "participant-count-v1",
        overtimePolicy: "single-attempt-until-capacity-v1",
        selectedPackIds: ["pack_general_v1"],
        characterDecks: ["profession", "biology", "health", "hobby", "baggage", "fact", "superpower", "phobia", "personality"],
      },
      customPacks: [],
      adultContentConfirmed: false,
    };
    const parsed = createRoomInputSchema.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues.map((issue) => issue.message).join(" · ")); return; }
    try {
      const room = await api.createRoom(session.reconnectToken, parsed.data);
      setRoom(room);
      router.push(`/room/${room.roomId}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create room"); }
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <div className="row between"><h2>{locale === "uk" ? "Нова кімната" : "New room"}</h2><button type="button" className="ghost" onClick={onCancel}>×</button></div>
      <label>{locale === "uk" ? "Назва" : "Name"}<input minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label>{locale === "uk" ? "Максимум учасників" : "Maximum participants"}<input type="number" inputMode="numeric" min={3} max={15} value={maxParticipants} onChange={(event) => setMaxParticipants(Number(event.target.value))} /><span className="muted">{locale === "uk" ? "Від 3 до 15" : "From 3 to 15"}</span></label>
      <label className="row"><input type="checkbox" checked={fillToSix} onChange={(e) => setFillToSix(e.target.checked)} />{locale === "uk" ? "Добрати персонажів до шести для 4–5 гравців" : "Fill to six characters with 4–5 players"}</label>
      <div className="grid two">
        <label>{locale === "uk" ? "Фінал" : "Final"}<select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="base">Base</option><option value="survival-story">Survival Story</option></select></label>
        <label>{locale === "uk" ? "Мета" : "Goal"}<select value={goal} onChange={(e) => setGoal(e.target.value as typeof goal)}><option value="salvation">Salvation</option><option value="revival">Revival</option></select></label>
      </div>
      <fieldset className="card flat stack"><legend>{locale === "uk" ? "Незалежні таймери" : "Independent timers"}</legend><p className="muted">{locale === "uk" ? "Усі типово вимкнені." : "All are off by default."}</p><div className="timer-grid">
        {timerNames.map((timer) => <label key={timer}>{timer}<select value={timers[timer] ?? "off"} onChange={(e) => setTimers((current) => ({ ...current, [timer]: e.target.value === "off" ? null : Number(e.target.value) }))}><option value="off">off</option><option value="30">30 s</option><option value="60">60 s</option><option value="120">120 s</option></select></label>)}
      </div></fieldset>
      {error && <p role="alert" className="status-bad">{error}</p>}
      <button className="primary">{locale === "uk" ? "Створити" : "Create"}</button>
    </form>
  );
}
