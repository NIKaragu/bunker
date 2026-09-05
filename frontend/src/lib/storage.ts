const PREFIX = "bunker:v1:";

export type StorageResult<T> = { ok: true; value: T } | { ok: false; reason: string; value?: T };

export const readLocal = <T>(key: string): StorageResult<T | null> => {
  try {
    if (typeof window === "undefined") return { ok: true, value: null };
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    return { ok: true, value: raw === null ? null : (JSON.parse(raw) as T) };
  } catch {
    return { ok: false, reason: "Browser storage is unavailable", value: null };
  }
};

export const writeLocal = (key: string, value: unknown): StorageResult<undefined> => {
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, reason: "Could not save locally. The app can continue for this session." };
  }
};

export const removeLocal = (key: string): StorageResult<undefined> => {
  try {
    window.localStorage.removeItem(`${PREFIX}${key}`);
    return { ok: true, value: undefined };
  } catch {
    return { ok: false, reason: "Could not remove the local value" };
  }
};
