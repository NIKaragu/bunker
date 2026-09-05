// @vitest-environment jsdom
import { BUNKER_PARTY_CHARACTER_DECKS } from "@bunker/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { api } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { CreateRoom } from "./CreateRoom";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("CreateRoom", () => {
  test("requests only the decks the shipped packs can deal", async () => {
    useAppStore.setState({ locale: "en", session: { sessionId: "session_12345678", reconnectToken: "t".repeat(32), profile: { participantId: "participant_12345678", nickname: "Host", locale: "en" }, expiresAt: new Date(Date.now() + 60_000).toISOString() } as never });
    const createRoom = vi.spyOn(api, "createRoom").mockRejectedValue(new Error("stop after the request"));

    render(<CreateRoom onCancel={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Deck Room" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(createRoom).toHaveBeenCalledOnce());
    const [, input] = createRoom.mock.calls[0]!;
    expect((input as { settings: { characterDecks: string[] } }).settings.characterDecks).toEqual([...BUNKER_PARTY_CHARACTER_DECKS]);
  });
});
