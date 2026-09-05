"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { RulesDialog } from "./RulesDialog";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const { hydrated, bootstrap, hydrate, clearSession, locale, setLocale, notice, connection } = useAppStore();
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  if (!hydrated) return <main className="shell"><section className="card stack">
    <p className="muted">{bootstrap === "error" ? (locale === "uk" ? "Не вдалося відновити сесію." : "Could not restore the session.") : (locale === "uk" ? "Відновлюємо сесію…" : "Restoring session…")}</p>
    {bootstrap === "error" && notice && <p className="status-bad" role="alert">{notice}</p>}
    {bootstrap === "error" && <div className="row">
      <button className="primary" onClick={() => void hydrate()}>{locale === "uk" ? "Спробувати ще раз" : "Retry"}</button>
      {/* Without this the stored token can wedge the app: restore keeps failing and nothing else renders. */}
      <button onClick={clearSession}>{locale === "uk" ? "Почати заново" : "Start over"}</button>
    </div>}
  </section></main>;
  return (
    <main className="shell">
      <header className="topbar">
        <Link className="brand" href="/">▰ {t(locale, "appName")}</Link>
        <nav className="toolbar" aria-label="Main navigation">
          <Link className="button ghost" href="/profile">{t(locale, "profile")}</Link>
          <Link className="button ghost" href="/packs">{t(locale, "packs")}</Link>
          <button className="ghost" type="button" onClick={() => setRulesOpen(true)}>{t(locale, "rules")}</button>
          <button className="ghost" type="button" onClick={() => setLocale(locale === "uk" ? "en" : "uk")} aria-label="Switch language">{locale.toUpperCase()}</button>
        </nav>
      </header>
      {children}
      {(notice || connection === "reconnecting" || connection === "expired") && (
        <div className="notice sr-status" role="status" aria-live="polite">
          {notice ?? (connection === "expired" ? t(locale, "expired") : t(locale, "reconnecting"))}
        </div>
      )}
      {rulesOpen && <RulesDialog locale={locale} onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
