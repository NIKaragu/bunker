"use client";

import { create } from "zustand";
import type { ProfileInput, RoomSnapshot, RoomSummary, Session } from "./client-types";
import type { UiLocale } from "./i18n";
import { readLocal, removeLocal, writeLocal } from "./storage";

export type ConnectionState = "idle" | "connected" | "reconnecting" | "offline" | "expired";

type AppState = {
  hydrated: boolean;
  locale: UiLocale;
  profile: ProfileInput | null;
  session: Session | null;
  rooms: RoomSummary[];
  room: RoomSnapshot | null;
  connection: ConnectionState;
  notice: string | null;
  selectedCharacterId: string | null;
  hydrate: () => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  hydrated: false,
  locale: "uk",
  profile: null,
  session: null,
  rooms: [],
  room: null,
  connection: "idle",
  notice: null,
  selectedCharacterId: null,
  hydrate: () => {
    const profile = readLocal<ProfileInput>("profile");
    const session = readLocal<Session>("session");
    const locale = profile.value?.locale ?? "uk";
    set({ hydrated: true, profile: profile.value ?? null, session: session.value ?? null, locale, notice: !profile.ok || !session.ok ? "Local storage is unavailable; changes will last for this tab." : null });
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
  setRoom: (room) => set({ room, selectedCharacterId: room?.game?.viewer.role === "participant" ? room.game.viewer.privateState.controlledCharacters[0]?.characterId ?? null : null }),
  setConnection: (connection) => set({ connection }),
  setNotice: (notice) => set({ notice }),
  selectCharacter: (selectedCharacterId) => set({ selectedCharacterId }),
  clearSession: () => {
    removeLocal("session");
    set({ session: null, room: null, connection: "expired" });
  },
}));

export const commandMeta = (room: RoomSnapshot, commandId = crypto.randomUUID().replaceAll("-", "")) => ({
  protocolVersion: "bunker-party-v1" as const,
  commandId,
  roomId: room.roomId,
  gameId: room.game?.publicState.gameId,
  expectedVersion: room.game?.publicState.version ?? room.version,
});
