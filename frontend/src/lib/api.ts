import {
  packValidationResponseSchema,
  profileResponseSchema,
  roomResponseSchema,
  roomsResponseSchema,
  sessionResponseSchema,
  type CustomPack,
} from "@bunker/contracts";
import type { ProfileInput, RoomSnapshot, RoomSummary, Session } from "./client-types";

const baseUrl = (): string => (process.env.NEXT_PUBLIC_BACKEND_URL ?? "").replace(/\/$/, "");

export class ApiFailure extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

const request = async <T>(path: string, init: RequestInit, parse: (value: unknown) => T, token?: string): Promise<T> => {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  return parse(payload);
};

const unwrap = <T>(result: { ok: boolean; data?: T; error?: { code: string; message: string } }): T => {
  if (result.ok && result.data !== undefined) return result.data;
  throw new ApiFailure(result.error?.code ?? "BACKEND_UNAVAILABLE", result.error?.message ?? "Unexpected server response");
};

export const api = {
  createSession: (profile: ProfileInput): Promise<Session> => request("/api/v1/sessions", { method: "POST", body: JSON.stringify({ profile }) }, (v) => unwrap(sessionResponseSchema.parse(v))),
  restoreSession: (reconnectToken: string): Promise<Session> => request("/api/v1/sessions/restore", { method: "POST", body: JSON.stringify({ reconnectToken }) }, (v) => unwrap(sessionResponseSchema.parse(v))),
  updateProfile: (token: string, patch: Partial<ProfileInput>) => request("/api/v1/profile", { method: "PATCH", body: JSON.stringify(patch) }, (v) => unwrap(profileResponseSchema.parse(v)), token),
  listRooms: (token: string): Promise<RoomSummary[]> => request("/api/v1/rooms", { method: "GET" }, (v) => unwrap(roomsResponseSchema.parse(v)).rooms, token),
  createRoom: (token: string, input: unknown): Promise<RoomSnapshot> => request("/api/v1/rooms", { method: "POST", body: JSON.stringify(input) }, (v) => unwrap(roomResponseSchema.parse(v)), token),
  joinRoom: (token: string, roomId: string): Promise<RoomSnapshot> => request("/api/v1/rooms/join", { method: "POST", body: JSON.stringify({ roomId }) }, (v) => unwrap(roomResponseSchema.parse(v)), token),
  currentRoom: (token: string): Promise<RoomSnapshot> => request("/api/v1/rooms/current", { method: "GET" }, (v) => unwrap(roomResponseSchema.parse(v)), token),
  validatePack: (token: string, pack: CustomPack) => request("/api/v1/packs/validate", { method: "POST", body: JSON.stringify({ pack, serializedBytes: new Blob([JSON.stringify(pack)]).size }) }, (v) => unwrap(packValidationResponseSchema.parse(v)), token),
};
