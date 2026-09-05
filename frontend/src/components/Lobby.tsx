"use client";

import { useState } from "react";
import type { RoomSnapshot } from "@/lib/client-types";
import { avatarDataUrl } from "@/lib/avatar";
import { realtime } from "@/lib/realtime";
import { commandMeta, useAppStore } from "@/lib/store";

const timerNames = ["selection", "speech", "discussion", "voting"] as const;

export function Lobby({ room, reconcile }: { room: RoomSnapshot; reconcile: () => Promise<void> }) {
  const { locale, setNotice } = useAppStore();
  const viewerId = room.viewerProfile.participantId;
  const viewer = room.participants.find((participant) => participant.participantId === viewerId);
  const isHost = room.hostId === viewerId;
  const participants = room.participants.filter((participant) => participant.role !== "spectator");
  const spectators = room.participants.filter((participant) => participant.role === "spectator");
  const characterCount = participants.reduce((sum, participant) => sum + participant.controlledCharacterCount, 0);
  const quota = room.settings.fillToSix && participants.length >= 4 && participants.length <= 5 ? 6 : participants.length === 3 ? 6 : participants.length;
  const remaining = Math.max(0, quota - characterCount);
  const disconnected = participants.some((participant) => !participant.connected);
  const canStart = participants.length >= 3 && remaining === 0 && !disconnected && participants.every((participant) => participant.ready);
  const viewerExtraCharacterId = room.settings.fillToSix && participants.length >= 4 && participants.length <= 5
    ? room.viewerControlledCharacterIds[1]
    : undefined;
  const [pending, setPending] = useState(false);

  const command = async (name: Parameters<typeof realtime.command>[0], body: Record<string, unknown>, success: string) => {
    setPending(true);
    try {
      const ack = await realtime.command(name, { ...commandMeta(room), ...body });
      if (!ack.ok) throw new Error(ack.error.message);
      await reconcile();
      setNotice(success);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Command failed";
      setNotice(message.includes("CLAIM_UNAVAILABLE") ? (locale === "uk" ? "Додаткове місце вже зайняв інший гравець." : "Another player won this extra-character claim.") : message);
      return false;
    } finally { setPending(false); }
  };

  return (
    <div className="grid two">
      <section className="card stack">
        <div className="row between"><div><p className="eyebrow">Lobby</p><h1>{room.name}</h1></div><span className="badge live">{participants.length} / {room.settings.maxParticipants}</span></div>
        <div className="phase" role="status"><strong>{locale === "uk" ? `${remaining} персонажів ще потрібно` : `${remaining} more characters needed`}</strong><span className="muted">{room.settings.fillToSix ? (locale === "uk" ? "Режим добору до шести активний" : "Fill-to-six is active") : (locale === "uk" ? "Стандартний розподіл" : "Standard allocation")}</span></div>
        <ul className="room-list">{participants.map((participant) => <li key={participant.participantId}><div className="row"><img className="avatar" src={participant.avatar?.kind === "uploaded" ? participant.avatar.dataUrl : avatarDataUrl(participant.avatar?.seed ?? participant.nickname)} alt="" /><div><strong>{participant.nickname}</strong><p className="muted">{participant.participantId === room.hostId ? "Host · " : ""}{participant.controlledCharacterCount} {locale === "uk" ? "персонаж(і)" : "character(s)"}</p></div></div><span className={`badge ${participant.ready ? "live" : ""}`}>{!participant.connected ? (locale === "uk" ? "зв’язок…" : "reconnecting") : participant.ready ? (locale === "uk" ? "готовий" : "ready") : (locale === "uk" ? "очікує" : "waiting")}</span></li>)}</ul>
        {spectators.length > 0 && <p className="muted">{locale === "uk" ? "Спостерігачі" : "Spectators"}: {spectators.map((item) => item.nickname).join(", ")}</p>}
        <div className="row">
          <button className={viewer?.ready ? "" : "primary"} disabled={pending || viewer?.role === "spectator"} onClick={() => void command("room:set-ready", { ready: !viewer?.ready }, viewer?.ready ? "Readiness removed" : "Ready")}>{viewer?.ready ? (locale === "uk" ? "Не готовий" : "Not ready") : (locale === "uk" ? "Я готовий" : "I'm ready")}</button>
          {room.settings.fillToSix && viewer && viewer.controlledCharacterCount < 2 && <button disabled={pending || remaining === 0} onClick={() => void command("room:claim-extra-character", {}, locale === "uk" ? "Додаткового персонажа отримано" : "Extra character claimed")}>{locale === "uk" ? "Взяти додаткового" : "Claim extra"}</button>}
          {viewerExtraCharacterId && <button disabled={pending} onClick={() => void command("room:release-extra-character", { characterId: viewerExtraCharacterId }, locale === "uk" ? "Додаткового персонажа звільнено" : "Extra character released")}>{locale === "uk" ? "Відмовитись від додаткового" : "Release extra"}</button>}
        </div>
        {!canStart && <p className="status-warn" role="status">{locale === "uk" ? "Старт заблоковано: потрібна повна квота, готовність усіх і стабільний зв’язок." : "Start is blocked until quota is full, everyone is ready, and connections are stable."}</p>}
        {isHost && <button className="primary" disabled={!canStart || pending} onClick={() => void command("room:start-game", {}, locale === "uk" ? "Гру запущено" : "Game started")}>{locale === "uk" ? "Запустити зараз" : "Start now"}</button>}
      </section>
      <SettingsPanel room={room} editable={isHost} command={command} />
    </div>
  );
}

function SettingsPanel({ room, editable, command }: { room: RoomSnapshot; editable: boolean; command: (name: "room:update-settings", body: Record<string, unknown>, success: string) => Promise<boolean> }) {
  const locale = useAppStore((state) => state.locale);
  const [draft, setDraft] = useState(room.settings);
  const [dirty, setDirty] = useState(false);
  const settings = dirty ? draft : room.settings;
  return <aside className="card stack"><div className="row between"><h2>{locale === "uk" ? "Налаштування" : "Settings"}</h2>{!editable && <span className="badge">Host only</span>}</div>
    <label>{locale === "uk" ? "Максимум учасників" : "Maximum participants"}<input disabled={!editable} type="number" inputMode="numeric" min={3} max={15} value={settings.maxParticipants} onChange={(event) => { setDirty(true); setDraft({ ...settings, maxParticipants: Number(event.target.value) }); }} /></label>
    <label className="row"><input disabled={!editable} type="checkbox" checked={settings.fillToSix} onChange={(e) => { setDirty(true); setDraft({ ...settings, fillToSix: e.target.checked }); }} />Fill to six</label>
    <label className="row"><input disabled={!editable} type="checkbox" checked={settings.forceProfessionFirstRound} onChange={(e) => { setDirty(true); setDraft({ ...settings, forceProfessionFirstRound: e.target.checked }); }} />{locale === "uk" ? "Професія обов'язкова в 1-му раунді" : "Force Profession in round 1"}</label>
    <div className="grid two"><label>Final<select disabled={!editable} value={settings.mode} onChange={(e) => { setDirty(true); setDraft({ ...settings, mode: e.target.value as typeof settings.mode }); }}><option value="base">Base</option><option value="survival-story">Survival Story</option></select></label><label>Goal<select disabled={!editable} value={settings.finalGoal} onChange={(e) => { setDirty(true); setDraft({ ...settings, finalGoal: e.target.value as typeof settings.finalGoal }); }}><option value="salvation">Salvation</option><option value="revival">Revival</option></select></label></div>
    <div className="timer-grid">{timerNames.map((name) => <label key={name}>{name}<select disabled={!editable} value={settings.timers[name] ?? "off"} onChange={(e) => { setDirty(true); setDraft({ ...settings, timers: { ...settings.timers, [name]: e.target.value === "off" ? null : Number(e.target.value) } }); }}><option value="off">off</option><option value="30">30 s</option><option value="60">60 s</option><option value="120">120 s</option></select></label>)}</div>
    <p className="muted">{locale === "uk" ? "Зміна будь-якого правила скине готовність усіх." : "Changing any game rule resets everyone's readiness."}</p>
    {editable && <button onClick={() => void command("room:update-settings", { settings }, locale === "uk" ? "Збережено; готовність скинуто" : "Saved; readiness reset").then((saved) => { if (saved) setDirty(false); })}>{locale === "uk" ? "Зберегти правила" : "Save rules"}</button>}
  </aside>;
}
