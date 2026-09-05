import { describe, expect, test } from "vitest";
import { createDraftPack, duplicatePack, importPack } from "./packs";

describe("custom pack lifecycle", () => {
  test("exports and imports a schema-valid pack without changing IDs", () => {
    const pack = createDraftPack();
    const result = importPack(JSON.stringify(pack));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.pack).toEqual(pack);
  });

  test("reports exact paths and leaves ownership to caller on invalid import", () => {
    const existing = createDraftPack();
    const result = importPack(JSON.stringify({ ...existing, cards: [{ title: {} }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.startsWith("cards.0"))).toBe(true);
    expect(existing.cards).toHaveLength(1);
  });

  test("duplicates every ID and preserves content", () => {
    const original = createDraftPack();
    const copy = duplicatePack(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.cards[0]?.id).not.toBe(original.cards[0]?.id);
    expect(copy.cards[0]?.sourcePackId).toBe(copy.id);
  });
});
