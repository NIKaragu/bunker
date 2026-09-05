import { z } from "zod";
import { gameSettingsSchema, viewerGameSnapshotSchema } from "./game.js";
import { customPackSchema } from "./content.js";
import { characterIdSchema, isoTimestampSchema, participantIdSchema, roomIdSchema, roomNameSchema, stateVersionSchema } from "./primitives.js";
import { avatarSchema, profileSchema } from "./profile.js";

export const roomStatusSchema = z.enum(["lobby", "in-game", "post-game", "closed"]);
export const roomParticipantSchema = z.object({
  participantId: participantIdSchema, nickname: z.string().min(2).max(32), avatar: avatarSchema.optional(),
  role: z.enum(["host", "participant", "spectator"]), ready: z.boolean(), connected: z.boolean(),
  reconnectDeadline: isoTimestampSchema.nullable(), controlledCharacterCount: z.number().int().min(0).max(2)
}).strict();
export const publicRoomSummarySchema = z.object({
  roomId: roomIdSchema, name: roomNameSchema, status: roomStatusSchema,
  participantCount: z.number().int().min(0).max(15), spectatorCount: z.number().int().nonnegative().max(100),
  maxParticipants: z.number().int().min(3).max(15), hostNickname: z.string().min(2).max(32),
  adultContent: z.boolean(), createdAt: isoTimestampSchema
}).strict();
export const roomSnapshotSchema = z.object({
  roomId: roomIdSchema, version: stateVersionSchema, name: roomNameSchema, status: roomStatusSchema,
  hostId: participantIdSchema, settings: gameSettingsSchema, participants: z.array(roomParticipantSchema).max(115),
  viewerProfile: profileSchema,
  viewerControlledCharacterIds: z.array(characterIdSchema).max(2).default([]),
  game: viewerGameSnapshotSchema.nullable(), updatedAt: isoTimestampSchema
}).strict();

export const createRoomInputSchema = z.object({
  name: roomNameSchema, settings: gameSettingsSchema,
  customPacks: z.array(customPackSchema).max(10).default([]), adultContentConfirmed: z.boolean().default(false)
}).strict();
export const joinRoomInputSchema = z.object({ roomId: roomIdSchema }).strict();
export const roomListQuerySchema = z.object({
  cursor: z.string().max(256).optional(), limit: z.coerce.number().int().min(1).max(100).default(30),
  status: z.enum(["lobby", "in-game", "post-game"]).optional()
}).strict();
export const roomListSchema = z.object({ rooms: z.array(publicRoomSummarySchema).max(100), nextCursor: z.string().max(256).nullable() }).strict();
