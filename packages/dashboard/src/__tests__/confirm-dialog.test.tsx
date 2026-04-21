// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../components/ui/confirm-dialog";

describe("ConfirmDialog", () => {
  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete item"
        description="Are you sure?"
        onConfirm={onConfirm}
      />
    );
    const confirmButton = await screen.findByRole("button", { name: "Confirm" });
    await userEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when cancel button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete item"
        description="Are you sure?"
        onConfirm={onConfirm}
      />
    );
    const cancelButton = await screen.findByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButton);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses custom labels when provided", async () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Remove"
        description="Confirm removal"
        confirmLabel="Remove"
        cancelLabel="Keep"
        onConfirm={vi.fn()}
      />
    );
    expect(await screen.findByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Keep" })).toBeInTheDocument();
  });
});
