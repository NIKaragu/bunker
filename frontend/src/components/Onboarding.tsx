"use client";

import { profileInputSchema } from "@bunker/contracts";
import { useState } from "react";
import { api } from "@/lib/api";
import { avatarDataUrl, compressAvatar } from "@/lib/avatar";
import type { ProfileInput } from "@/lib/client-types";
import { useAppStore } from "@/lib/store";

export function Onboarding() {
  const { locale, setLocale, setProfile, setSession, setNotice } = useAppStore();
  const [nickname, setNickname] = useState("");
  const [uploaded, setUploaded] = useState<Extract<ProfileInput["avatar"], { kind: "uploaded" }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const result = profileInputSchema.safeParse({
      nickname,
      locale,
      ...(uploaded ? { avatar: uploaded } : {}),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Check the profile fields.");
      return;
    }
    setBusy(true);
    setProfile(result.data);
    try {
      const session = await api.createSession(result.data);
      setSession(session);
      setNotice(locale === "uk" ? "Профіль створено" : "Profile created");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Server unavailable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid two" aria-labelledby="welcome-title">
      <div className="hero">
        <p className="eyebrow">Bunker party · 3–15</p>
        <h1 id="welcome-title">{locale === "uk" ? "Хто вартий місця в бункері?" : "Who deserves a place in the bunker?"}</h1>
        <p className="muted">{locale === "uk" ? "Жива гра для друзів: аргументуйте, голосуйте й переживіть катастрофу." : "A live party game: make your case, vote, and survive the catastrophe."}</p>
      </div>
      <form className="card stack" onSubmit={submit} noValidate>
        <div className="row between">
          <div><p className="eyebrow">01 / profile</p><h2>{locale === "uk" ? "Ваш позивний" : "Your callsign"}</h2></div>
          <img className="avatar" src={uploaded?.dataUrl ?? avatarDataUrl(nickname)} alt="" />
        </div>
        <label>{locale === "uk" ? "Нікнейм" : "Nickname"}<input autoFocus minLength={2} maxLength={32} value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" /></label>
        <fieldset className="card flat">
          <legend>{locale === "uk" ? "Мова цього пристрою" : "Language on this device"}</legend>
          <div className="row">
            {(["uk", "en"] as const).map((value) => <label className="row" key={value}><input type="radio" name="locale" checked={locale === value} onChange={() => setLocale(value)} />{value === "uk" ? "Українська" : "English"}</label>)}
          </div>
        </fieldset>
        <label>{locale === "uk" ? "Власне фото — необов’язково (PNG, JPEG, WebP; до 256 КБ після стиснення)" : "Custom image — optional (PNG, JPEG, WebP; 256 KB after compression)"}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try { setUploaded({ kind: "uploaded", ...(await compressAvatar(file)) }); setError(null); }
            catch (reason) { setError(reason instanceof Error ? reason.message : "Image could not be processed"); }
          }} />
        </label>
        {error && <p role="alert" className="status-bad">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? "…" : locale === "uk" ? "Увійти до сховища" : "Enter the shelter"}</button>
        <p className="muted">{locale === "uk" ? "Без акаунта. Дані профілю залишаються у цьому браузері." : "No account. Profile preferences stay in this browser."}</p>
      </form>
    </section>
  );
}
