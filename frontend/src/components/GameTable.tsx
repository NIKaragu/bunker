"use client";

import { useEffect, useMemo, useState } from "react";
import type { Card } from "@bunker/contracts";
import type { RoomSnapshot } from "@/lib/client-types";
import { pickLocalized } from "@/lib/i18n";
import { realtime } from "@/lib/realtime";
import { commandMeta, useAppStore } from "@/lib/store";

const phaseLabels: Record<string, { uk: string; en: string }> = {
  dealing: { uk: "Роздача", en: "Dealing" },
  "round-selection": { uk: "Вибір карти", en: "Choose a card" },
  "round-speech": { uk: "Виступ", en: "Speech" },
  "round-discussion": { uk: "Обговорення", en: "Discussion" },
  "round-voting": { uk: "Таємне голосування", en: "Secret ballot" },
  "tie-defense": { uk: "Захист кандидатів", en: "Candidate defense" },
  "runoff-voting": { uk: "Переголосування", en: "Runoff vote" },
  "lot-resolution": { uk: "Жереб", en: "Random lot" },
  "overtime-selection": { uk: "Овертайм: вибір карти", en: "Overtime: choose" },
  "overtime-speech": { uk: "Овертайм: виступ", en: "Overtime: speech" },
  "overtime-discussion": { uk: "Овертайм: обговорення", en: "Overtime: discussion" },
  "overtime-voting": { uk: "Овертайм: голосування", en: "Overtime: vote" },
  "final-usefulness-vote": { uk: "Фінал: корисність", en: "Final: usefulness" },
  "final-threat": { uk: "Фінал: загроза", en: "Final: threat" },
  "final-catastrophe": { uk: "Фінал: катастрофа", en: "Final: catastrophe" },
  complete: { uk: "Результат", en: "Result" },
};

function useCountdown(deadline: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (!deadline) return "off";
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000));
  return seconds === 0 ? "0:00 · syncing" : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function CardDetail({ card, onClose }: { card: Card; onClose: () => void }) {
  const locale = useAppStore((state) => state.locale);
  return <div className="dialog-backdrop" role="presentation"><section className="dialog stack" role="dialog" aria-modal="true" aria-labelledby="card-title"><div className="row between"><div><p className="eyebrow">{card.type}{"category" in card ? ` · ${card.category}` : ""}</p><h2 id="card-title">{pickLocalized(card.title, locale)}</h2></div><button autoFocus onClick={onClose}>×</button></div>{card.details && <p>{pickLocalized(card.details, locale)}</p>}<button onClick={onClose}>{locale === "uk" ? "Закрити" : "Close"}</button></section></div>;
}

export function GameTable({ room }: { room: RoomSnapshot }) {
  if (!room.game) return null;
  return <ActiveGameTable room={room} game={room.game} />;
}

function ActiveGameTable({ room, game }: { room: RoomSnapshot; game: NonNullable<RoomSnapshot["game"]> }) {
  const { locale, selectedCharacterId, selectCharacter, setNotice } = useAppStore();
  const [detail, setDetail] = useState<Card | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);
  const { publicState, viewer } = game;
  const privateState = viewer.role === "participant" ? viewer.privateState : null;
  const selectedHand = privateState?.controlledCharacters.find((hand) => hand.characterId === selectedCharacterId) ?? privateState?.controlledCharacters[0];
  const selectedPublic = publicState.characters.find((character) => character.characterId === selectedHand?.characterId);
  const legal = (name: string) => privateState?.legalActions.some((action) => action === name || action.endsWith(name)) ?? false;
  const phase = phaseLabels[publicState.phase]?.[locale] ?? publicState.phase;
  const relevantDeadline = publicState.phase.includes("selection") ? publicState.deadlines.selection : publicState.phase.includes("speech") ? publicState.deadlines.speech : publicState.phase.includes("discussion") ? publicState.deadlines.discussion : publicState.phase.includes("voting") ? publicState.deadlines.voting : publicState.phase === "tie-defense" ? publicState.deadlines.tieDefense : null;
  const countdown = useCountdown(relevantDeadline);
  const candidates = useMemo(() => publicState.characters.filter((character) => game.publicState.ballot?.candidates.includes(character.characterId)), [game.publicState.ballot?.candidates, publicState.characters]);

  const command = async (name: Parameters<typeof realtime.command>[0], body: Record<string, unknown>, message: string) => {
    try {
      const ack = await realtime.command(name, { ...commandMeta(room), ...body });
      if (!ack.ok) throw new Error(ack.error.message);
      setNotice(message);
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "Command failed"); }
  };

  if (publicState.phase === "post-game" || publicState.phase === "complete") return <PostGame room={room} command={command} />;

  return (
    <div className="stack">
      <header className="phase">
        <div className="row between"><span className="eyebrow">{publicState.baseRound > 0 ? `${locale === "uk" ? "Раунд" : "Round"} ${publicState.baseRound}/5` : locale === "uk" ? "Фінал" : "Final"}{publicState.overtimeAttempt > 0 ? ` · OT ${publicState.overtimeAttempt}` : ""}</span><strong aria-live="polite">{countdown}</strong></div>
        <h1>{phase}</h1>
        {countdown.startsWith("0:00") && <span className="muted">{locale === "uk" ? "Чекаємо підтвердження сервера" : "Waiting for server confirmation"}</span>}
      </header>

      <section aria-label={locale === "uk" ? "Порядок персонажів" : "Character order"}>
        <div className="seat-strip">{publicState.characters.map((character) => <article className={`seat ${character.characterId === publicState.activeCharacterId ? "active" : ""} ${character.status === "exiled" ? "exiled" : ""}`} key={character.characterId}><div className="row between"><strong>#{character.seat + 1}</strong><span className="badge">{character.status}</span></div><p>{character.controller?.nickname ?? (locale === "uk" ? "Передано" : "Transferred")}</p><small className="muted">{character.revealedCards.length} {locale === "uk" ? "відкрито" : "revealed"} · {character.concealedCardCount} {locale === "uk" ? "приховано" : "hidden"}</small></article>)}</div>
      </section>

      <div className="game-layout">
        <div className="stack">
          <section className="card stack">
            <div className="row between"><h2>{locale === "uk" ? "Ваші персонажі" : "Your characters"}</h2><span className="badge">{viewer.role === "spectator" ? (locale === "uk" ? "Спостерігач" : "Spectator") : selectedPublic?.status ?? "active"}</span></div>
            {viewer.role === "spectator" ? <p className="muted">{locale === "uk" ? "Ви приєдналися після старту. Приховані карти й голосування недоступні." : "You joined after the start. Hidden cards and voting are unavailable."}</p> : <>
              <div className="hand-tabs" role="tablist">{privateState?.controlledCharacters.map((hand, index) => <button role="tab" aria-selected={hand.characterId === selectedHand?.characterId} key={hand.characterId} onClick={() => selectCharacter(hand.characterId)}>{locale === "uk" ? "Персонаж" : "Character"} {index + 1}<br /><small>{publicState.characters.find((item) => item.characterId === hand.characterId)?.status}</small></button>)}</div>
              <div className="cards">{selectedHand?.cards.map((card) => {
                const revealed = selectedPublic?.revealedCards.some((item) => item.id === card.id);
                return <article className="game-card button" key={card.id}><button className="ghost" onClick={() => setDetail(card)}><small>{"category" in card ? card.category : card.type}</small><strong>{pickLocalized(card.title, locale)}</strong></button><span className={revealed ? "status-good" : "muted"}>{revealed ? (locale === "uk" ? "Відкрито" : "Revealed") : (locale === "uk" ? "Приватна" : "Private")}</span>{!revealed && legal("reveal-card") && <button className="primary" onClick={() => void command("game:reveal-card", { characterId: selectedHand.characterId, cardId: card.id }, locale === "uk" ? "Карту відкрито" : "Card revealed")}>{locale === "uk" ? "Відкрити" : "Reveal"}</button>}</article>;
              })}</div>
            </>}
          </section>

          {publicState.finalState && <FinalProgress room={room} command={command} legal={legal("vote-usefulness")} />}

          {publicState.ballot && viewer.role === "participant" && <section className="card stack"><h2>{publicState.phase === "runoff-voting" ? (locale === "uk" ? "Переголосування" : "Runoff") : locale === "uk" ? "Ваш таємний бюлетень" : "Your secret ballot"}</h2><p className="muted">{locale === "uk" ? "Вибір можна змінити до закриття. Утриматися не можна." : "You can change your choice before lock. Abstention is unavailable."}</p><div className="vote-list">{candidates.map((candidate) => <button aria-pressed={voteTarget === candidate.characterId} key={candidate.characterId} onClick={() => setVoteTarget(candidate.characterId)}>#{candidate.seat + 1} · {candidate.controller?.nickname}</button>)}</div><button className="primary" disabled={!voteTarget || !selectedHand || !legal("cast-vote")} onClick={() => selectedHand && voteTarget && void command("game:cast-vote", { voterCharacterId: selectedHand.characterId, targetCharacterId: voteTarget }, locale === "uk" ? "Голос збережено приватно" : "Vote saved privately")}>{locale === "uk" ? "Зберегти голос" : "Save vote"}</button></section>}
        </div>

        <aside className="stack sticky">
          <ContextPanel room={room} />
          {viewer.role === "participant" && <section className="card stack"><h2>{locale === "uk" ? "Дія фази" : "Phase action"}</h2><button disabled={!selectedHand || !legal("play-special-condition")}>{locale === "uk" ? "Зіграти Особливу умову" : "Play Special Condition"}</button>{publicState.phase.includes("speech") && <button className="primary" disabled={!selectedHand || !legal("end-speech")} onClick={() => selectedHand && void command("game:end-speech", { characterId: selectedHand.characterId }, locale === "uk" ? "Виступ завершено" : "Speech ended")}>{locale === "uk" ? "Завершити виступ" : "End speech"}</button>}<p className="muted">{selectedPublic?.status === "exiled" ? (locale === "uk" ? "Вигнаний: без ходу відкриття, але голос і Особлива умова доступні." : "Exiled: no reveal turn, but ballot and Special Condition remain.") : locale === "uk" ? "Кнопки активуються лише у дозволеній фазі." : "Actions enable only in their legal phase."}</p></section>}
        </aside>
      </div>
      {detail && <CardDetail card={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function FinalProgress({ room, command, legal }: { room: RoomSnapshot; command: (name: Parameters<typeof realtime.command>[0], body: Record<string, unknown>, message: string) => Promise<void>; legal: boolean }) {
  const locale = useAppStore((state) => state.locale);
  const state = room.game?.publicState;
  const finalState = state?.finalState;
  if (!state || !finalState) return null;
  const publicCards = [
    ...state.revealedBunkerCards,
    ...state.revealedThreatCards,
    ...(state.revealedCatastrophe ? [state.revealedCatastrophe] : []),
    ...state.characters.flatMap((character) => character.revealedCards),
  ];
  const subject = finalState.currentSubjectCardId
    ? publicCards.find((card) => card.id === finalState.currentSubjectCardId)
    : undefined;
  const vote = finalState.utilityVote;
  const canVote = room.game?.viewer.role === "participant" && legal && Boolean(vote?.subjectCardId);
  return <section className="card stack" aria-labelledby="final-progress-title">
    <div className="row between"><div><p className="eyebrow">Survival Story</p><h2 id="final-progress-title">{locale === "uk" ? "Перевірка виживання" : "Survival check"}</h2></div><span className="badge">{finalState.stage}</span></div>
    <p><strong>{locale === "uk" ? "Група" : "Group"}:</strong> {finalState.currentGroup ?? "—"}</p>
    <div className="phase"><span className="muted">{locale === "uk" ? "Поточний предмет оцінки" : "Current subject"}</span><strong>{subject ? pickLocalized(subject.title, locale) : (finalState.currentSubjectCardId ?? "—")}</strong></div>
    <div className="stack">{finalState.groupProgress.map((progress) => <div className="row between" key={`${progress.group}-${progress.attempt}`}><span>{progress.group} · {locale === "uk" ? "спроба" : "attempt"} {progress.attempt}</span><span className="badge">{progress.usefulCardIds.length}/{progress.requiredUsefulCards} {locale === "uk" ? "корисні" : "useful"}</span></div>)}</div>
    {vote && <><p className="muted" role="status" aria-live="polite">{locale === "uk" ? "Голосів" : "Votes"}: {vote.castParticipantIds.length}/{vote.eligibleParticipantIds.length} · 👍 {vote.usefulVotes} · 👎 {vote.notUsefulVotes}</p><div className="vote-list"><button aria-label={locale === "uk" ? "Позначити карту корисною" : "Mark card useful"} className="primary" disabled={!canVote} onClick={() => void command("game:vote-usefulness", { voterParticipantId: room.viewerProfile.participantId, subjectCardId: vote.subjectCardId, useful: true }, locale === "uk" ? "Голос «корисна» збережено" : "Useful vote saved")}>👍 {locale === "uk" ? "Корисна" : "Useful"}</button><button aria-label={locale === "uk" ? "Позначити карту некорисною" : "Mark card not useful"} disabled={!canVote} onClick={() => void command("game:vote-usefulness", { voterParticipantId: room.viewerProfile.participantId, subjectCardId: vote.subjectCardId, useful: false }, locale === "uk" ? "Голос «не корисна» збережено" : "Not useful vote saved")}>👎 {locale === "uk" ? "Не корисна" : "Not useful"}</button></div></>}
    {!vote && finalState.stage !== "resolved" && <p className="muted">{locale === "uk" ? "Очікуємо наступний публічний крок сервера." : "Waiting for the server's next public step."}</p>}
  </section>;
}

function ContextPanel({ room }: { room: RoomSnapshot }) {
  const locale = useAppStore((state) => state.locale);
  const state = room.game?.publicState;
  if (!state) return null;
  return <section className="card stack"><h2>{locale === "uk" ? "Контекст виживання" : "Survival context"}</h2>{state.revealedCatastrophe ? <button className="game-card"><small>catastrophe</small><strong>{pickLocalized(state.revealedCatastrophe.title, locale)}</strong></button> : <p className="muted">{locale === "uk" ? "Катастрофа ще прихована" : "Catastrophe is concealed"}</p>}<div className="row"><span className="badge">{locale === "uk" ? "Місткість" : "Capacity"}: {state.capacity}</span><span className="badge">{locale === "uk" ? "Ще вигнати" : "Exiles left"}: {state.remainingExiles}</span></div><div className="table-scroll"><table><thead><tr><th>{locale === "uk" ? "Раунд" : "Round"}</th><th>Bunker</th><th>Threat</th></tr></thead><tbody>{[0,1,2,3,4].map((index) => <tr key={index}><td>{index + 1}</td><td>{state.revealedBunkerCards[index] ? "✓" : "—"}</td><td>{state.revealedThreatCards[index] ? "✓" : "—"}</td></tr>)}</tbody></table></div>{state.tiedCharacterIds.length > 0 && <div className="notice"><strong>{locale === "uk" ? "Нічия" : "Tie"}</strong><p>{room.participants.filter((participant) => participant.role !== "spectator").length >= 6 ? (locale === "uk" ? "Захист → переголосування → жереб" : "Defense → runoff → lot") : (locale === "uk" ? "Нікого не вигнано; гра продовжується" : "Nobody is exiled; play continues")}</p></div>}</section>;
}

function PostGame({ room, command }: { room: RoomSnapshot; command: (name: Parameters<typeof realtime.command>[0], body: Record<string, unknown>, message: string) => Promise<void> }) {
  const locale = useAppStore((state) => state.locale);
  const state = room.game?.publicState;
  if (!state) return null;
  const names = state.outcome?.winningCharacterIds.map((id) => state.characters.find((character) => character.characterId === id)?.controller?.nickname ?? `#${state.characters.find((character) => character.characterId === id)?.seat ?? "?"}`) ?? [];
  const viewer = room.participants.find((participant) => participant.participantId === room.viewerProfile.participantId);
  return <section className="grid two"><div className="card stack"><p className="eyebrow">After action report</p><h1>{locale === "uk" ? "Бункер сформовано" : "The shelter is sealed"}</h1><div role="status" aria-live="assertive"><h2>{locale === "uk" ? "Переможці" : "Winners"}</h2><p>{names.join(", ") || (locale === "uk" ? "Результат формується…" : "Finalizing result…")}</p></div><p className="muted">{state.outcome?.summaryKey}</p></div><div className="card stack"><h2>{locale === "uk" ? "Реванш у цій кімнаті" : "Rematch in this room"}</h2><p className="muted">{locale === "uk" ? "Склад і правила можна змінити. Готовність скинуто; нова гра матиме інші карти та gameId." : "Roster and settings can change. Readiness is reset; the new game gets fresh cards and a new gameId."}</p><button className={viewer?.ready ? "" : "primary"} disabled={viewer?.role === "spectator"} onClick={() => void command("postgame:set-ready", { ready: !viewer?.ready }, locale === "uk" ? "Готовність до реваншу оновлено" : "Rematch readiness updated")}>{viewer?.ready ? (locale === "uk" ? "Скасувати готовність" : "Cancel ready") : (locale === "uk" ? "Готовий до реваншу" : "Ready for rematch")}</button></div></section>;
}
