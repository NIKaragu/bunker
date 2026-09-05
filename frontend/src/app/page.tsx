"use client";

import { AppShell } from "@/components/AppShell";
import { Onboarding } from "@/components/Onboarding";
import { RoomBrowser } from "@/components/RoomBrowser";
import { useAppStore } from "@/lib/store";

export default function HomePage() {
  const session = useAppStore((state) => state.session);
  return <AppShell>{session ? <RoomBrowser /> : <Onboarding />}</AppShell>;
}
