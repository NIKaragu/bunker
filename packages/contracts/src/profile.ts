import { z } from "zod";
import { boundedPlainTextSchema, localeSchema, nicknameSchema, participantIdSchema, sessionIdSchema } from "./primitives.js";

export const diceBearAvatarSchema = z.object({
  kind: z.literal("dicebear"),
  style: z.enum(["adventurer", "bottts", "identicon", "initials", "lorelei"]),
  seed: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9 _-]+$/)
}).strict();

export const uploadedAvatarSchema = z.object({
  kind: z.literal("uploaded"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  bytes: z.number().int().positive().max(256_000),
  dataUrl: z.string().max(350_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/)
}).strict();

export const avatarSchema = z.discriminatedUnion("kind", [diceBearAvatarSchema, uploadedAvatarSchema]);
export const profileInputSchema = z.object({ nickname: nicknameSchema, locale: localeSchema, avatar: avatarSchema.optional() }).strict();
export const profileSchema = profileInputSchema.extend({ participantId: participantIdSchema }).strict();
export const sessionSchema = z.object({
  sessionId: sessionIdSchema,
  reconnectToken: z.string().min(32).max(512),
  profile: profileSchema,
  expiresAt: z.string().datetime({ offset: true })
}).strict();

export const profilePatchSchema = z.object({
  nickname: nicknameSchema.optional(), locale: localeSchema.optional(), avatar: avatarSchema.optional(),
  accessibilityLabel: boundedPlainTextSchema.max(100).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one profile field is required");
