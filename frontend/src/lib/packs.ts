import { customPackSchema, PACK_LIMITS } from "@bunker/contracts";
import type { CustomPack } from "./client-types";
import { readLocal, writeLocal, type StorageResult } from "./storage";

const PACKS_KEY = "custom-packs";

export type PackImportResult =
  | { ok: true; pack: CustomPack }
  | { ok: false; issues: string[] };

export const loadPacks = (): StorageResult<CustomPack[]> => {
  const result = readLocal<unknown>(PACKS_KEY);
  if (!result.ok) return { ok: false, reason: result.reason, value: [] };
  if (result.value === null) return { ok: true, value: [] };
  const parsed = customPackSchema.array().safeParse(result.value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, reason: "Saved packs are invalid and were left untouched.", value: [] };
};

export const savePacks = (packs: CustomPack[]): StorageResult<undefined> => writeLocal(PACKS_KEY, packs);

export const importPack = (serialized: string): PackImportResult => {
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > PACK_LIMITS.maxJsonBytes) return { ok: false, issues: [`$: file exceeds ${PACK_LIMITS.maxJsonBytes} bytes`] };
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return { ok: false, issues: ["$: invalid JSON"] };
  }
  const parsed = customPackSchema.safeParse(value);
  if (parsed.success) return { ok: true, pack: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => `${issue.path.length ? issue.path.join(".") : "$"}: ${issue.message}`),
  };
};

export const duplicatePack = (pack: CustomPack): CustomPack => {
  const id = `pack_${crypto.randomUUID().replaceAll("-", "")}`;
  return {
    ...structuredClone(pack),
    id: id as CustomPack["id"],
    name: `${pack.name} copy`.slice(0, PACK_LIMITS.maxNameLength),
    cards: pack.cards.map((card, index) => ({
      ...card,
      id: `card_${index}_${crypto.randomUUID().replaceAll("-", "")}` as typeof card.id,
      sourcePackId: id as typeof card.sourcePackId,
    })),
  };
};

export const downloadPack = (pack: CustomPack): void => {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${pack.name.replace(/[^a-z0-9_-]+/gi, "-").toLowerCase() || "bunker-pack"}.json`;
  link.click();
  URL.revokeObjectURL(url);
};

export const createDraftPack = (): CustomPack => {
  const id = `pack_${crypto.randomUUID().replaceAll("-", "")}`;
  const cardId = `card_${crypto.randomUUID().replaceAll("-", "")}`;
  return customPackSchema.parse({
    schemaVersion: 1,
    id,
    rulesProfileId: "bunker-party-v1",
    kind: "addon",
    name: "New pack",
    adultContent: false,
    cards: [{ id: cardId, sourcePackId: id, type: "character", category: "profession", title: { en: "New profession" } }],
  });
};
