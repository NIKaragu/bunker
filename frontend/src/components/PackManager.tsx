"use client";

import { customPackSchema } from "@bunker/contracts";
import { useEffect, useState } from "react";
import type { CustomPack } from "@/lib/client-types";
import { useAppStore } from "@/lib/store";
import { createDraftPack, downloadPack, duplicatePack, importPack, loadPacks, savePacks } from "@/lib/packs";

export function PackManager() {
  const locale = useAppStore((state) => state.locale);
  const [packs, setPacks] = useState<CustomPack[]>([]);
  const [selected, setSelected] = useState<CustomPack | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => {
    const task = window.setTimeout(() => {
      const loaded = loadPacks();
      setPacks(loaded.value ?? []);
      if (!loaded.ok) setStatus(loaded.reason);
    }, 0);
    return () => window.clearTimeout(task);
  }, []);

  const persist = (next: CustomPack[]) => {
    const result = savePacks(next);
    if (result.ok) { setPacks(next); setStatus(locale === "uk" ? "Збережено локально" : "Saved locally"); }
    else setStatus(result.reason);
  };
  const saveSelected = () => {
    if (!selected) return;
    const parsed = customPackSchema.safeParse(selected);
    if (!parsed.success) { setIssues(parsed.error.issues.map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)); return; }
    setIssues([]);
    persist([...packs.filter((pack) => pack.id !== selected.id), parsed.data]);
  };

  return <div className="grid two">
    <section className="card stack"><div className="row between"><div><p className="eyebrow">Local workshop</p><h1>{locale === "uk" ? "Власні паки" : "Custom packs"}</h1></div><button className="primary" onClick={() => setSelected(createDraftPack())}>＋</button></div><p className="muted">{locale === "uk" ? "Паki живуть лише у цьому браузері. У кімнату надсилається перевірена копія." : "Packs live only in this browser. A validated snapshot is sent to the room."}</p>
      <label>{locale === "uk" ? "Імпортувати JSON" : "Import JSON"}<input type="file" accept="application/json,.json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const result = importPack(await file.text()); if (!result.ok) { setIssues(result.issues); setStatus(locale === "uk" ? "Імпорт відхилено; наявні паки не змінено." : "Import rejected; existing packs were preserved."); return; } setIssues([]); persist([...packs.filter((pack) => pack.id !== result.pack.id), result.pack]); setSelected(result.pack); }} /></label>
      {packs.length === 0 && <p className="muted">{locale === "uk" ? "Створіть перший оригінальний пак — ліцензовані combined-набори не вбудовано." : "Create an original pack; licensed combined-edition data is not bundled."}</p>}
      <ul className="room-list">{packs.map((pack) => <li key={pack.id}><button className="ghost" onClick={() => setSelected(structuredClone(pack))}>{pack.name}<br /><small>{pack.kind} · {pack.cards.length}</small></button><div className="pack-actions"><button aria-label={`Duplicate ${pack.name}`} onClick={() => { const copy = duplicatePack(pack); persist([...packs, copy]); setSelected(copy); }}>⧉</button><button aria-label={`Export ${pack.name}`} onClick={() => downloadPack(pack)}>⇩</button><button className="danger" aria-label={`Delete ${pack.name}`} onClick={() => { persist(packs.filter((item) => item.id !== pack.id)); if (selected?.id === pack.id) setSelected(null); }}>×</button></div></li>)}</ul>
      {status && <p className="notice" role="status" aria-live="polite">{status}</p>}{issues.length > 0 && <div className="notice status-bad" role="alert"><strong>{locale === "uk" ? "Точні помилки" : "Validation issues"}</strong><ul>{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div>}
    </section>
    {selected ? <PackEditor pack={selected} onChange={setSelected} onSave={saveSelected} /> : <section className="card"><h2>{locale === "uk" ? "Оберіть пак" : "Choose a pack"}</h2><p className="muted">{locale === "uk" ? "Редактор покаже покриття, сумісність і шлях кожної помилки." : "The editor shows coverage, compatibility, and each error path."}</p></section>}
  </div>;
}

function PackEditor({ pack, onChange, onSave }: { pack: CustomPack; onChange: (pack: CustomPack) => void; onSave: () => void }) {
  const locale = useAppStore((state) => state.locale);
  const coverage = pack.cards.reduce<Record<string, number>>((result, card) => { const key = "category" in card ? card.category : card.type; result[key] = (result[key] ?? 0) + 1; return result; }, {});
  return <section className="card stack"><div className="row between"><h2>{locale === "uk" ? "Редактор" : "Editor"}</h2><span className="badge">schema v{pack.schemaVersion}</span></div><label>{locale === "uk" ? "Назва пака" : "Pack name"}<input maxLength={80} value={pack.name} onChange={(e) => onChange({ ...pack, name: e.target.value })} /></label><div className="grid two"><label>Profile<select value={pack.rulesProfileId} onChange={(e) => onChange({ ...pack, rulesProfileId: e.target.value as CustomPack["rulesProfileId"] })}><option value="bunker-party-v1">Classic</option><option value="combined-editions-v1">Combined</option></select></label><label>Kind<select value={pack.kind} onChange={(e) => onChange({ ...pack, kind: e.target.value as CustomPack["kind"] })}><option value="addon">Add-on</option><option value="base">Base</option></select></label></div>
    <label className="row"><input type="checkbox" checked={pack.adultContent} onChange={(e) => onChange({ ...pack, adultContent: e.target.checked })} />18+</label>
    <section className="card flat"><h3>{locale === "uk" ? "Покриття" : "Coverage"}</h3><div className="row">{Object.entries(coverage).map(([key, count]) => <span className="badge" key={key}>{key}: {count}</span>)}</div></section>
    <div className="stack">{pack.cards.map((card, index) => <section className="card flat stack" key={card.id}><div className="row between"><strong>{index + 1}. {card.type}</strong><button className="danger" onClick={() => onChange({ ...pack, cards: pack.cards.filter((item) => item.id !== card.id) })}>×</button></div><label>Title · UK<input value={card.title.uk ?? ""} onChange={(e) => onChange({ ...pack, cards: pack.cards.map((item) => item.id === card.id ? { ...item, title: { ...item.title, uk: e.target.value || undefined } } : item) })} /></label><label>Title · EN<input value={card.title.en ?? ""} onChange={(e) => onChange({ ...pack, cards: pack.cards.map((item) => item.id === card.id ? { ...item, title: { ...item.title, en: e.target.value || undefined } } : item) })} /></label></section>)}</div>
    <div className="row"><button onClick={() => { const id = `card_${crypto.randomUUID().replaceAll("-", "")}`; onChange({ ...pack, cards: [...pack.cards, { id: id as CustomPack["cards"][number]["id"], sourcePackId: pack.id, type: "character", category: "profession", title: { en: "New profession" } }] }); }}>＋ {locale === "uk" ? "Картка" : "Card"}</button><button className="primary" onClick={onSave}>{locale === "uk" ? "Перевірити й зберегти" : "Validate & save"}</button></div>
  </section>;
}
