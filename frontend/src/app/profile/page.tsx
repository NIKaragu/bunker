"use client";

import { profileInputSchema } from "@bunker/contracts";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { avatarDataUrl } from "@/lib/avatar";
import { useAppStore } from "@/lib/store";

export default function ProfilePage() {
  const hydrated = useAppStore((state) => state.hydrated);
  return <AppShell>{hydrated ? <ProfileEditor /> : null}</AppShell>;
}

function ProfileEditor() {
  const { locale, profile, setProfile, clearSession } = useAppStore();
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [status, setStatus] = useState<string | null>(null);
  return <section className="card stack" style={{ maxWidth: 620, marginInline: "auto" }}><div className="row between"><div><p className="eyebrow">Identity</p><h1>{locale === "uk" ? "Профіль" : "Profile"}</h1></div><img className="avatar" alt="" src={profile?.avatar.kind === "uploaded" ? profile.avatar.dataUrl : avatarDataUrl(nickname)} /></div>{profile ? <><label>{locale === "uk" ? "Нікнейм" : "Nickname"}<input value={nickname} minLength={2} maxLength={32} onChange={(e) => setNickname(e.target.value)} /></label><button className="primary" onClick={() => { const result = profileInputSchema.safeParse({ ...profile, nickname }); if (!result.success) { setStatus(result.error.issues[0]?.message ?? "Invalid profile"); return; } setProfile(result.data); setStatus(locale === "uk" ? "Збережено на цьому пристрої" : "Saved on this device"); }}>{locale === "uk" ? "Зберегти" : "Save"}</button><button className="danger" onClick={clearSession}>{locale === "uk" ? "Завершити локальну сесію" : "End local session"}</button></> : <p className="muted">{locale === "uk" ? "Спочатку створіть профіль на стартовій сторінці." : "Create a profile on the home page first."}</p>}{status && <p role="status" className="notice">{status}</p>}</section>;
}
