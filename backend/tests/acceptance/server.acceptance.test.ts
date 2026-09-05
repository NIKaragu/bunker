import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  clientCommandAuthorization,
  clientCommandSchemas,
  httpRouteCatalog,
  roomSnapshotSchema,
  socketHandshakeAuthSchema,
} from "../../../packages/contracts/src/index.js";
import {
  assertExecution,
  scenariosFor,
  type ServerAcceptanceDriver,
} from "../../../packages/game-engine/tests/acceptance/acceptance-manifest.js";

const driverUrl = new URL("../../src/acceptance-driver.ts", import.meta.url);
const hasDriver = existsSync(fileURLToPath(driverUrl));
const behaviorTest = hasDriver ? test : test.todo;
let driver: ServerAcceptanceDriver | undefined;

const getDriver = async (): Promise<ServerAcceptanceDriver> => {
  if (!driver) {
    const module = (await import(driverUrl.href)) as { createServerAcceptanceDriver: () => Promise<ServerAcceptanceDriver> };
    driver = await module.createServerAcceptanceDriver();
  }
  return driver;
};

afterAll(async () => driver?.close());

describe("contract-backed server surface", () => {
  test("assigns runtime schemas and authorization to every declared route and command", () => {
    expect(Object.keys(httpRouteCatalog).length).toBeGreaterThanOrEqual(11);
    expect(Object.keys(clientCommandSchemas).sort()).toEqual(Object.keys(clientCommandAuthorization).sort());
    for (const command of Object.values(clientCommandSchemas)) {
      expect(typeof command.safeParse).toBe("function");
    }
  });

  test("requires an opaque reconnect token and exact protocol version", () => {
    expect(socketHandshakeAuthSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, reconnectToken: "r".repeat(32) }).success).toBe(true);
    expect(socketHandshakeAuthSchema.safeParse({ protocolVersion: "v0", reconnectToken: "r".repeat(32) }).success).toBe(false);
    expect(socketHandshakeAuthSchema.safeParse({ protocolVersion: PROTOCOL_VERSION, reconnectToken: "short" }).success).toBe(false);
  });

  test("requires version and command identity for every state-changing command", () => {
    for (const [name, schema] of Object.entries(clientCommandSchemas)) {
      const result = schema.safeParse({ protocolVersion: PROTOCOL_VERSION });
      expect(result.success, name).toBe(false);
    }
  });

  test("limits viewer-controlled release IDs to the current viewer projection", () => {
    const controlledIds = roomSnapshotSchema.shape.viewerControlledCharacterIds;
    expect(controlledIds.safeParse(["character_own_001", "character_own_002"]).success).toBe(true);
    expect(controlledIds.safeParse(["character_own_001", "character_own_002", "character_other_003"]).success).toBe(false);
  });
});

describe("server behavior acceptance", () => {
  for (const scenarioEntry of scenariosFor("server")) {
    behaviorTest(`${scenarioEntry.id}: ${scenarioEntry.behavior}`, async () => {
      const activeDriver = await getDriver();
      assertExecution(scenarioEntry, await activeDriver.execute(scenarioEntry));
    });
  }
});
