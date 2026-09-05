import type { z } from "zod";
import type {
  roomSnapshotSchema,
  publicRoomSummarySchema,
  sessionSchema,
  customPackSchema,
  profileInputSchema,
} from "@bunker/contracts";

export type RoomSnapshot = z.infer<typeof roomSnapshotSchema>;
export type RoomSummary = z.infer<typeof publicRoomSummarySchema>;
export type Session = z.infer<typeof sessionSchema>;
export type CustomPack = z.infer<typeof customPackSchema>;
export type ProfileInput = z.infer<typeof profileInputSchema>;
