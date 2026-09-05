const integer = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid operational integer: ${raw ?? "unset"}`);
  return value;
};

export type ServerConfig = Readonly<{
  port: number;
  corsOrigins: ReadonlySet<string>;
  maxRooms: number;
  maxSpectatorsPerRoom: number;
  maxPayloadBytes: number;
  maxCommandsPerMinute: number;
  sessionGraceMs: number;
  emptyRoomTtlMs: number;
  sessionTtlMs: number;
  trustProxy: boolean;
}>;

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const origins = ("http://localhost:3000,http://localhost:3001,http://localhost:3002").split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes("*")) throw new Error("CORS_ORIGINS must be an explicit allowlist");
  return {
    port: integer(env.PORT, 4000, 1, 65_535),
    corsOrigins: new Set(origins),
    maxRooms: integer(env.MAX_ROOMS, 100, 1, 10_000),
    maxSpectatorsPerRoom: integer(env.MAX_SPECTATORS_PER_ROOM, 40, 1, 1_000),
    maxPayloadBytes: integer(env.MAX_PAYLOAD_BYTES, 1_048_576, 16_384, 2_000_000),
    maxCommandsPerMinute: integer(env.MAX_COMMANDS_PER_MINUTE, 180, 10, 10_000),
    sessionGraceMs: integer(env.SESSION_GRACE_MS, 60_000, 1_000, 300_000),
    emptyRoomTtlMs: integer(env.EMPTY_ROOM_TTL_MS, 60_000, 1_000, 3_600_000),
    sessionTtlMs: integer(env.SESSION_TTL_MS, 86_400_000, 60_000, 604_800_000),
    trustProxy: env.TRUST_PROXY === "true"
  };
};
