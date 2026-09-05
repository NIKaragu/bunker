import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import { localeSchema, profileInputSchema, roomStatusSchema } from "../../../packages/contracts/src/index.js";
import {
  assertExecution,
  scenariosFor,
  type AcceptanceArea,
  type BrowserAcceptanceDriver,
} from "../../../packages/game-engine/tests/acceptance/acceptance-manifest.js";

const driverUrl = new URL("../../src/acceptance-driver.ts", import.meta.url);
const hasDriver = existsSync(fileURLToPath(driverUrl));
const behaviorTest = hasDriver ? test : test.todo;
let driver: BrowserAcceptanceDriver | undefined;

const getDriver = async (): Promise<BrowserAcceptanceDriver> => {
  if (!driver) {
    const module = (await import(driverUrl.href)) as { createBrowserAcceptanceDriver: () => Promise<BrowserAcceptanceDriver> };
    driver = await module.createBrowserAcceptanceDriver();
  }
  return driver;
};

afterAll(async () => driver?.close());

describe("contract-backed client fixtures", () => {
  test("supports per-client Ukrainian and English locales", () => {
    expect(localeSchema.options).toEqual(["uk", "en"]);
    expect(profileInputSchema.safeParse({ nickname: "Гравець", locale: "uk", avatar: { kind: "dicebear", style: "initials", seed: "player-1" } }).success).toBe(true);
    expect(profileInputSchema.safeParse({ nickname: "Player", locale: "en", avatar: { kind: "dicebear", style: "initials", seed: "player-2" } }).success).toBe(true);
  });

  test("exposes the complete visible room lifecycle", () => {
    expect(roomStatusSchema.options).toEqual(["lobby", "in-game", "post-game", "closed"]);
  });
});

for (const area of ["frontend", "e2e"] satisfies AcceptanceArea[]) {
  describe(`${area} behavior acceptance`, () => {
    for (const scenarioEntry of scenariosFor(area)) {
      behaviorTest(`${scenarioEntry.id}: ${scenarioEntry.behavior}`, async () => {
        const activeDriver = await getDriver();
        assertExecution(scenarioEntry, await activeDriver.execute(scenarioEntry));
      });
    }
  });
}
