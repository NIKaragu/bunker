import { describe, expect, test } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  test("serves the deployment its configured CORS allowlist", () => {
    const config = loadConfig({ CORS_ORIGINS: "https://bunker.example, https://preview.bunker.example" });

    expect([...config.corsOrigins]).toEqual(["https://bunker.example", "https://preview.bunker.example"]);
  });

  test("falls back to the local development origins when unset", () => {
    expect([...loadConfig({}).corsOrigins]).toEqual(["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"]);
  });

  test("refuses a wildcard or an entry the Origin header can never match", () => {
    expect(() => loadConfig({ CORS_ORIGINS: "*" })).toThrowError("CORS_ORIGINS must be an explicit allowlist");
    expect(() => loadConfig({ CORS_ORIGINS: "https://bunker.example/" })).toThrowError("Invalid CORS origin: https://bunker.example/");
    expect(() => loadConfig({ CORS_ORIGINS: "https://bunker.example/app" })).toThrowError("Invalid CORS origin: https://bunker.example/app");
    expect(() => loadConfig({ CORS_ORIGINS: "bunker.example" })).toThrowError("Invalid CORS origin: bunker.example");
  });
});
