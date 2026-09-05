# Realtime protocol `bunker-party-v1`

Socket handshake auth: `{ protocolVersion: "bunker-party-v1", reconnectToken }`. Інша version отримує stable protocol error. Token не broadcast-иться.

Кожний command містить `commandId`, `protocolVersion`, `roomId`, `expectedVersion`; game/post-game commands також `gameId`. Success ack: `{ ok: true, protocolVersion, data: { roomId, version, duplicate } }`. Failure: `{ ok: false, protocolVersion, error: { code, message, requestId } }`. Повтор того самого commandId повертає стабільний ack/error без другого transition; stale room/game version — `STALE_STATE`.

## Client commands і authorization

| Command                                                             | Хто може виконати                  |
| ------------------------------------------------------------------- | ---------------------------------- |
| `room:subscribe`, `room:resync`, `room:leave`                       | room member                        |
| `room:set-ready`, `room:claim-extra-character`                      | lobby participant                  |
| `room:update-settings`, `room:start-game`                           | host                               |
| `room:release-extra-character`                                      | character controller               |
| `game:reveal-card`, `game:cast-vote`, `game:play-special-condition` | character controller у legal phase |
| `game:end-speech`                                                   | controller active character        |
| `game:end-discussion`, `game:close-vote`                            | host                               |
| `game:vote-usefulness`                                              | participant                        |
| `postgame:set-ready`                                                | participant                        |
| `postgame:start-rematch`                                            | host                               |

Schemas у `packages/contracts/src/realtime.ts` є executable source of truth для payload fields.

## Server events

- `room:snapshot` — повний room snapshot для конкретного session;
- `game:snapshot` — public state + discriminated viewer private/spectator state;
- `room:participant-joined`, `room:participant-left`, `room:host-transferred` — delta з version;
- `session:reconnect-grace` — participant і абсолютний deadline;
- `session:restored` — відновлений viewer room snapshot;
- `protocol:error` — stable failure envelope;
- `server:shutdown` — `reconnectAfterMs` перед graceful shutdown.

## Resync і timers

Після connect/reconnect client надсилає `room:subscribe` або `room:resync`; server повертає актуальну viewer projection. Client відкидає старі version і не merge-ить private data іншого viewer. Після offline/unknown ack client resync-иться перед повторною дією.

Deadlines `selection`, `speech`, `discussion`, `voting` незалежні, абсолютні ISO timestamps або `null`. UI лише обчислює display countdown; expiry transition робить server. Tie-defense має окремий fixed 60-second deadline.

## Stable errors

Клієнт повинен обробляти щонайменше `AUTH_REQUIRED`, `RECONNECT_TOKEN_INVALID`, `SESSION_EXPIRED`, `UNSUPPORTED_PROTOCOL`, `STALE_STATE`, `DUPLICATE_COMMAND`, `FORBIDDEN`, `NOT_HOST`, `SPECTATOR_FORBIDDEN`, `INVALID_PHASE`, `INVALID_TARGET`, `INVALID_CARD`, `VOTE_CLOSED`, `NOT_READY`, `CLAIM_UNAVAILABLE`, `ROOM_FULL`, `PACK_INVALID`, `INVALID_PAYLOAD`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`, `NOT_FOUND`, `BACKEND_UNAVAILABLE`, `INTERNAL_ERROR`. Message є human-readable detail; branching робиться за code.
