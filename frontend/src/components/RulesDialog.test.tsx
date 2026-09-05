// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RulesDialog } from "./RulesDialog";

describe("RulesDialog", () => {
  test("is local, accessible and exposes the four approved rules", () => {
    const close = vi.fn();
    render(<RulesDialog locale="en" onClose={close} />);
    expect(screen.getByRole("dialog", { name: "Rules at a glance" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Our 4 rules")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Close rules" }));
    expect(close).toHaveBeenCalledOnce();
  });
});
