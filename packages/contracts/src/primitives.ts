import { z } from "zod";

export const PROTOCOL_VERSION = "bunker-party-v1" as const;
export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const SCHEMA_VERSION = 1 as const;

const brandedId = <T extends string>() =>
  z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/).brand<T>();

export const sessionIdSchema = brandedId<"SessionId">();
export const roomIdSchema = brandedId<"RoomId">();
export const participantIdSchema = brandedId<"ParticipantId">();
export const characterIdSchema = brandedId<"CharacterId">();
export const gameIdSchema = brandedId<"GameId">();
export const cardIdSchema = brandedId<"CardId">();
export const packIdSchema = brandedId<"PackId">();
export const commandIdSchema = brandedId<"CommandId">();
export const reconnectTokenSchema = z.string().min(32).max(512);

export type SessionId = z.infer<typeof sessionIdSchema>;
export type RoomId = z.infer<typeof roomIdSchema>;
export type ParticipantId = z.infer<typeof participantIdSchema>;
export type CharacterId = z.infer<typeof characterIdSchema>;
export type GameId = z.infer<typeof gameIdSchema>;
export type CardId = z.infer<typeof cardIdSchema>;
export type PackId = z.infer<typeof packIdSchema>;
export type CommandId = z.infer<typeof commandIdSchema>;

export const localeSchema = z.enum(["uk", "en"]);
export type Locale = z.infer<typeof localeSchema>;

export const nicknameSchema = z.string().trim().min(2).max(32).regex(/^[^<>\u0000-\u001F\u007F]+$/);
export const roomNameSchema = z.string().trim().min(2).max(60).regex(/^[^<>\u0000-\u001F\u007F]+$/);
export const boundedPlainTextSchema = z.string().trim().min(1).max(500).regex(/^[^<>\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]+$/);
export const isoTimestampSchema = z.string().datetime({ offset: true });
export const stateVersionSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const errorCodeSchema = z.enum([
  "AUTH_REQUIRED", "SESSION_EXPIRED", "RECONNECT_TOKEN_INVALID", "FORBIDDEN", "NOT_HOST",
  "NOT_FOUND", "ROOM_CLOSED", "ROOM_FULL", "ALREADY_IN_ROOM", "NICKNAME_TAKEN",
  "INVALID_PAYLOAD", "PAYLOAD_TOO_LARGE", "UNSUPPORTED_PROTOCOL", "STALE_STATE",
  "DUPLICATE_COMMAND", "INVALID_PHASE", "INVALID_TARGET", "INVALID_CARD", "CARD_ALREADY_REVEALED",
  "NOT_READY", "CLAIM_UNAVAILABLE", "SPECTATOR_FORBIDDEN", "TIMER_EXPIRED", "VOTE_CLOSED",
  "PACK_INVALID", "PACK_UNSUPPORTED", "RATE_LIMITED", "BACKEND_UNAVAILABLE", "INTERNAL_ERROR"
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])).max(16),
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(300)
}).strict();

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1).max(300),
  requestId: z.string().min(8).max(128).optional(),
  issues: z.array(validationIssueSchema).max(100).optional(),
  retryAfterMs: z.number().int().positive().max(3_600_000).optional()
}).strict();

export const successEnvelopeSchema = <T extends z.ZodType>(data: T) => z.object({
  ok: z.literal(true), protocolVersion: protocolVersionSchema, data
}).strict();
export const failureEnvelopeSchema = z.object({
  ok: z.literal(false), protocolVersion: protocolVersionSchema, error: apiErrorSchema
}).strict();
export const responseEnvelopeSchema = <T extends z.ZodType>(data: T) => z.discriminatedUnion("ok", [successEnvelopeSchema(data), failureEnvelopeSchema]);

export const commandMetaSchema = z.object({
  protocolVersion: protocolVersionSchema,
  commandId: commandIdSchema,
  roomId: roomIdSchema,
  gameId: gameIdSchema.optional(),
  expectedVersion: stateVersionSchema
}).strict();
