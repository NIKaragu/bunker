import { z } from "zod";
import { customPackImportSchema, packValidationResultSchema } from "./content.js";
import { profileInputSchema, profilePatchSchema, sessionSchema } from "./profile.js";
import { createRoomInputSchema, joinRoomInputSchema, roomListQuerySchema, roomListSchema, roomSnapshotSchema } from "./room.js";
import { protocolVersionSchema, reconnectTokenSchema, responseEnvelopeSchema, roomIdSchema } from "./primitives.js";

export const emptySchema = z.object({}).strict();
export const healthSchema = z.object({ status: z.literal("ok"), protocolVersion: protocolVersionSchema }).strict();
export const createSessionRequestSchema = z.object({ profile: profileInputSchema }).strict();
export const restoreSessionRequestSchema = z.object({ reconnectToken: reconnectTokenSchema }).strict();
export const sessionResponseSchema = responseEnvelopeSchema(sessionSchema);
export const profileResponseSchema = responseEnvelopeSchema(sessionSchema.pick({ profile: true }));
export const roomsResponseSchema = responseEnvelopeSchema(roomListSchema);
export const roomResponseSchema = responseEnvelopeSchema(roomSnapshotSchema);
export const closeRoomRequestSchema = z.object({ roomId: roomIdSchema }).strict();
export const packValidationResponseSchema = responseEnvelopeSchema(packValidationResultSchema);

export const httpRouteCatalog = {
  "GET /health/live": { request: emptySchema, response: healthSchema, auth: "public" },
  "GET /health/ready": { request: emptySchema, response: healthSchema, auth: "public" },
  "POST /api/v1/sessions": { request: createSessionRequestSchema, response: sessionResponseSchema, auth: "public" },
  "POST /api/v1/sessions/restore": { request: restoreSessionRequestSchema, response: sessionResponseSchema, auth: "token" },
  "PATCH /api/v1/profile": { request: profilePatchSchema, response: profileResponseSchema, auth: "session" },
  "GET /api/v1/rooms": { request: roomListQuerySchema, response: roomsResponseSchema, auth: "session" },
  "POST /api/v1/rooms": { request: createRoomInputSchema, response: roomResponseSchema, auth: "session" },
  "POST /api/v1/rooms/join": { request: joinRoomInputSchema, response: roomResponseSchema, auth: "session" },
  "POST /api/v1/rooms/leave": { request: emptySchema, response: responseEnvelopeSchema(emptySchema), auth: "session" },
  "POST /api/v1/rooms/close": { request: closeRoomRequestSchema, response: responseEnvelopeSchema(emptySchema), auth: "host" },
  "GET /api/v1/rooms/current": { request: emptySchema, response: roomResponseSchema, auth: "session" },
  "POST /api/v1/packs/validate": { request: customPackImportSchema, response: packValidationResponseSchema, auth: "session" }
} as const;

export type HttpRoute = keyof typeof httpRouteCatalog;
