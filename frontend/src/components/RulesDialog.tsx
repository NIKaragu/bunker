import type { UiLocale } from "@/lib/i18n";
import { useEffect } from "react";

const copy = {
  uk: {
    title: "Короткі правила",
    close: "Закрити правила",
    sections: [
      ["Мета", "Після п’яти раундів і потрібних овертаймів у бункері має залишитися рівно стільки персонажів, скільки вміщує укриття."],
      ["Раунди", "У першому раунді відкривається професія. У раундах 2–5 активний персонаж обирає одну приховану звичайну карту. Щораунду відкриваються карти бункера і загрози."],
      ["Голосування", "Вигнані зберігають голос і Особливу умову, але більше не мають ходу відкриття. Для 6+ учасників нічия веде до захисту, переголосування і жеребу; для малих груп нічию дозволено."],
      ["Наші 4 правила", "Чотири таймери незалежні й типово вимкнені; 3 гравці керують двома персонажами; 4–5 можуть добрати до шести; нічия залежить від кількості учасників; реванш проходить у тій самій кімнаті."],
    ],
  },
  en: {
    title: "Rules at a glance",
    close: "Close rules",
    sections: [
      ["Goal", "After five rounds and any required overtime, exactly the shelter capacity must remain."],
      ["Rounds", "Round one reveals Profession. In rounds 2–5, the active character chooses one hidden ordinary card. Each base round adds one Bunker and Threat card."],
      ["Voting", "Exiled characters keep their ballot and Special Condition, but lose reveal turns. With 6+ participants a tie enters defense, runoff and a lot; smaller groups may keep a tie."],
      ["Our 4 rules", "Four timers are independent and off by default; three players control two characters; four or five can fill to six; ties depend on participant count; rematches stay in the room."],
    ],
  },
} as const;

export function RulesDialog({ locale, onClose }: { locale: UiLocale; onClose: () => void }) {
  const content = copy[locale];
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="dialog stack" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <div className="row between"><h2 id="rules-title">{content.title}</h2><button autoFocus onClick={onClose}>{content.close}</button></div>
        {content.sections.map(([title, body]) => <section key={title}><h3>{title}</h3><p className="muted">{body}</p></section>)}
      </section>
    </div>
  );
}
