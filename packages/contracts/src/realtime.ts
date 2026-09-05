import { z } from "zod";
import { castVoteIntentSchema, gameSettingsSchema, revealCardIntentSchema, specialConditionIntentSchema, usefulnessVoteIntentSchema, viewerGameSnapshotSchema } from "./game.js";
import { characterIdSchema, commandMetaSchema, failureEnvelopeSchema, gameIdSchema, participantIdSchema, responseEnvelopeSchema, roomIdSchema, stateVersionSchema } from "./primitives.js";
import { roomSnapshotSchema } from "./room.js";

const command = <T extends z.ZodRawShape>(shape: T) => commandMetaSchema.extend(shape).strict();
const gameCommand = <T extends z.ZodRawShape>(shape: T) => commandMetaSchema.extend({ gameId: gameIdSchema, ...shape }).strict();
const noPayloadCommandSchema = command({});

export const clientCommandSchemas = {
  "room:subscribe": command({ roomId: roomIdSchema }),
  "room:resync": noPayloadCommandSchema,
  "room:set-ready": command({ ready: z.boolean() }),
  "room:update-settings": command({ settings: gameSettingsSchema }),
  "room:claim-extra-character": noPayloadCommandSchema,
  "room:release-extra-character": command({ characterId: characterIdSchema }),
  "room:start-game": noPayloadCommandSchema,
  "room:leave": noPayloadCommandSchema,
  "game:reveal-card": gameCommand(revealCardIntentSchema.shape),
  "game:end-speech": gameCommand({ characterId: characterIdSchema }),
  "game:end-discussion": gameCommand({}),
  "game:cast-vote": gameCommand(castVoteIntentSchema.shape),
  "game:close-vote": gameCommand({}),
  "game:play-special-condition": gameCommand(specialConditionIntentSchema.shape),
  "game:vote-usefulness": gameCommand(usefulnessVoteIntentSchema.shape),
  "postgame:set-ready": gameCommand({ ready: z.boolean() }),
  "postgame:start-rematch": gameCommand({})
} as const;
export type ClientCommandName = keyof typeof clientCommandSchemas;

export const clientCommandAuthorization = {
  "room:subscribe": "room-member",
  "room:resync": "room-member",
  "room:set-ready": "lobby-participant",
  "room:update-settings": "host",
  "room:claim-extra-character": "lobby-participant",
  "room:release-extra-character": "character-controller",
  "room:start-game": "host",
  "room:leave": "room-member",
  "game:reveal-card": "character-controller",
  "game:end-speech": "active-character-controller",
  "game:end-discussion": "host",
  "game:cast-vote": "character-controller",
  "game:close-vote": "host",
  "game:play-special-condition": "character-controller",
  "game:vote-usefulness": "room-participant",
  "postgame:set-ready": "room-participant",
  "postgame:start-rematch": "host"
} as const satisfies Record<ClientCommandName, string>;

export const commandAckDataSchema = z.object({ roomId: roomIdSchema, version: stateVersionSchema, duplicate: z.boolean().default(false) }).strict();
export const commandAckSchema = responseEnvelopeSchema(commandAckDataSchema);

export const serverEventSchemas = {
  "room:snapshot": roomSnapshotSchema,
  "game:snapshot": viewerGameSnapshotSchema,
  "room:participant-joined": z.object({ participantId: participantIdSchema, version: stateVersionSchema }).strict(),
  "room:participant-left": z.object({ participantId: participantIdSchema, version: stateVersionSchema }).strict(),
  "room:host-transferred": z.object({ participantId: participantIdSchema, version: stateVersionSchema }).strict(),
  "session:reconnect-grace": z.object({ participantId: participantIdSchema, deadline: z.string().datetime({ offset: true }) }).strict(),
  "session:restored": roomSnapshotSchema,
  "protocol:error": failureEnvelopeSchema,
  "server:shutdown": z.object({ reconnectAfterMs: z.number().int().nonnegative().max(300_000) }).strict()
} as const;
export type ServerEventName = keyof typeof serverEventSchemas;

export const socketHandshakeAuthSchema = z.object({ protocolVersion: z.literal("bunker-party-v1"), reconnectToken: z.string().min(32).max(512) }).strict();

export type InferClientCommand<N extends ClientCommandName> = z.infer<(typeof clientCommandSchemas)[N]>;
export type InferServerEvent<N extends ServerEventName> = z.infer<(typeof serverEventSchemas)[N]>;
export type CommandAck = z.infer<typeof commandAckSchema>;
