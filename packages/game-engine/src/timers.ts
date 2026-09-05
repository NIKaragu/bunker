export type TimerKind = "selection" | "speech" | "discussion" | "voting";
export type TimerSettings = Readonly<Record<TimerKind, number | null>>;
export type Deadlines = Readonly<
  Record<TimerKind, string | null> & { tieDefense: string | null }
>;
export interface Clock {
  now(): Date;
}

export const DEFAULT_TIMERS: TimerSettings = Object.freeze({
  selection: null,
  speech: null,
  discussion: null,
  voting: null,
});

export const validateTimerSettings = (
  settings: TimerSettings,
): TimerSettings => {
  for (const value of Object.values(settings)) {
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 10 || value > 3_600)
    ) {
      throw new RangeError(
        "Timer duration must be null or 10 through 3600 seconds",
      );
    }
  }
  return { ...settings };
};

export const deadlinesAt = (
  settings: TimerSettings,
  clock: Clock,
  tieDefense = false,
): Deadlines => {
  const now = clock.now().getTime();
  const deadline = (seconds: number | null): string | null =>
    seconds === null ? null : new Date(now + seconds * 1_000).toISOString();
  return {
    selection: deadline(settings.selection),
    speech: deadline(settings.speech),
    discussion: deadline(settings.discussion),
    voting: deadline(settings.voting),
    tieDefense: tieDefense ? new Date(now + 60_000).toISOString() : null,
  };
};

export const updateTimer = (
  settings: TimerSettings,
  kind: TimerKind,
  seconds: number | null,
): TimerSettings => validateTimerSettings({ ...settings, [kind]: seconds });
