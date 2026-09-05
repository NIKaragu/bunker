"use client";

import { create } from "zustand";
import type { ProfileInput, RoomSnapshot, RoomSummary, Session } from "./client-types";
import type { UiLocale } from "./i18n";
import { readLocal, removeLocal, writeLocal } from "./storage";
import { api, isTerminalSessionFailure } from "./api";

export type ConnectionState = "idle" | "connected" | "reconnecting" | "offline" | "expired";

type AppState = {
  hydrated: boolean;
  bootstrap: "idle" | "restoring" | "ready" | "error";
  locale: UiLocale;
  profile: ProfileInput | null;
  session: Session | null;
  rooms: RoomSummary[];
  room: RoomSnapshot | null;
  connection: ConnectionState;
  notice: string | null;
  selectedCharacterId: string | null;
  hydrate: () => Promise<void>;
  setLocale: (locale: UiLocale) => void;
  setProfile: (profile: ProfileInput) => void;
  setSession: (session: Session | null) => void;
  setRooms: (rooms: RoomSummary[]) => void;
  setRoom: (room: RoomSnapshot | null) => void;
  setConnection: (connection: ConnectionState) => void;
  setNotice: (notice: string | null) => void;
  selectCharacter: (characterId: string) => void;
  clearSession: () => void;
};

let bootstrapGeneration = 0;

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  bootstrap: "idle",
  locale: "uk",
  profile: null,
  session: null,
  rooms: [],
  room: null,
  connection: "idle",
  notice: null,
  selectedCharacterId: null,
  hydrate: async () => {
    const current = get().bootstrap;
    if (current === "restoring" || current === "ready") return;
    const generation = ++bootstrapGeneration;
    const profile = readLocal<ProfileInput>("profile");
    const persisted = readLocal<Session>("session");
    const locale = profile.value?.locale ?? "uk";
    const storageNotice = !profile.ok || !persisted.ok ? "Local storage is unavailable; changes will last for this tab." : null;
    set({ hydrated: false, bootstrap: "restoring", profile: profile.value ?? null, session: null, locale, notice: storageNotice });
    if (!persisted.value) {
      if (generation === bootstrapGeneration) set({ hydrated: true, bootstrap: "ready" });
      return;
    }
    try {
      const restored = await api.restoreSession(persisted.value.reconnectToken);
      if (generation !== bootstrapGeneration) return;
      const stored = writeLocal("session", restored);
      set({ hydrated: true, bootstrap: "ready", session: restored, profile: restored.profile, locale: restored.profile.locale, notice: stored.ok ? storageNotice : stored.reason });
    } catch (reason) {
      if (generation !== bootstrapGeneration) return;
      if (isTerminalSessionFailure(reason)) {
        removeLocal("session");
        set({ hydrated: true, bootstrap: "ready", session: null, room: null, connection: "expired", notice: reason instanceof Error ? reason.message : "Session expired" });
      } else {
        set({ hydrated: false, bootstrap: "error", notice: reason instanceof Error ? reason.message : "Could not restore session" });
      }
    }
  },
  setLocale: (locale) => {
    const profile = get().profile;
    if (profile) writeLocal("profile", { ...profile, locale });
    set({ locale, profile: profile ? { ...profile, locale } : null });
  },
  setProfile: (profile) => {
    const stored = writeLocal("profile", profile);
    set({ profile, locale: profile.locale, notice: stored.ok ? null : stored.reason });
  },
  setSession: (session) => {
    if (session) writeLocal("session", session);
    else removeLocal("session");
    set({ session });
  },
  setRooms: (rooms) => set({ rooms }),
  setRoom: (room) => set((state) => {
    if (room && state.room?.roomId === room.roomId && room.version < state.room.version) return state;
    const controlled = room?.game?.viewer.role === "participant" ? room.game.viewer.privateState.controlledCharacters : [];
    const selectedCharacterId = state.selectedCharacterId && controlled.some((item) => item.characterId === state.selectedCharacterId)
      ? state.selectedCharacterId
      : controlled[0]?.characterId ?? null;
    return { room, selectedCharacterId };
  }),
  setConnection: (connection) => set({ connection }),
  setNotice: (notice) => set({ notice }),
  selectCharacter: (selectedCharacterId) => set({ selectedCharacterId }),
  clearSession: () => {
    bootstrapGeneration += 1;
    removeLocal("session");
    set({ hydrated: true, bootstrap: "ready", session: null, room: null, connection: "expired" });
  },
}));

export const commandMeta = (room: RoomSnapshot, commandId = crypto.randomUUID().replaceAll("-", "")) => ({
  protocolVersion: "bunker-party-v1" as const,
  commandId,
  roomId: room.roomId,
  gameId: room.game?.publicState.gameId,
  expectedVersion: room.game?.publicState.version ?? room.version,
});
