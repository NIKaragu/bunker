// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import { readLocal, writeLocal } from "./storage";

describe("recoverable local storage", () => {
  afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

  test("round-trips JSON under a versioned key", () => {
    expect(writeLocal("profile", { nickname: "Nova" }).ok).toBe(true);
    expect(readLocal<{ nickname: string }>("profile")).toEqual({ ok: true, value: { nickname: "Nova" } });
  });

  test("returns a recoverable explanation when quota storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota"); });
    expect(writeLocal("profile", { nickname: "Nova" })).toEqual({ ok: false, reason: "Could not save locally. The app can continue for this session." });
  });
});
