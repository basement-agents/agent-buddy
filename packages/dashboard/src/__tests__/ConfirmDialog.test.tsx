// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConfirmDialog } from "../components/ui/confirm-dialog.js";

describe("ConfirmDialog", () => {
  it("renders with title and description text", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item"
        description="This action cannot be undone."
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByText("Delete Item")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm Action"
        description="Are you sure?"
        onConfirm={onConfirm}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    await userEvent.click(confirmButton);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const onOpenChange = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Confirm Action"
        description="Are you sure?"
        onConfirm={onConfirm}
      />
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("uses custom button labels when provided", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item"
        description="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep" })).toBeInTheDocument();
  });

  it("applies destructive variant when destructive prop is true", () => {
    const { rerender } = render(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item"
        description="This cannot be undone."
        destructive={false}
        onConfirm={vi.fn()}
      />
    );

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton.className).toContain("bg-primary");

    rerender(
      <ConfirmDialog
        open={true}
        onOpenChange={vi.fn()}
        title="Delete Item"
        description="This cannot be undone."
        destructive={true}
        onConfirm={vi.fn()}
      />
    );

    const destructiveButton = screen.getByRole("button", { name: "Confirm" });
    expect(destructiveButton.className).toContain("bg-destructive");
  });

  it("does not render when open is false", () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        onOpenChange={vi.fn()}
        title="Hidden Dialog"
        description="Should not be visible."
        onConfirm={vi.fn()}
      />
    );

    expect(screen.queryByText("Hidden Dialog")).not.toBeInTheDocument();
    expect(container.querySelector("[data-open]")).not.toBeInTheDocument();
  });
});
