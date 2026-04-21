// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "../components/ui/toast";

vi.stubGlobal("crypto", { randomUUID: () => "test-uuid" });

function TestConsumer() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast({ title: "Hello", variant: "success" })}>Show</button>
      <button onClick={() => showToast({ title: "With desc", description: "Details", variant: "error" })}>Show with desc</button>
    </div>
  );
}

describe("ToastProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders toast title when showToast is called", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("Show").click());
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders toast description when provided", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("Show with desc").click());
    expect(screen.getByText("With desc")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
  });

  it("toast has role alert and aria-live polite", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("Show").click());
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveAttribute("aria-live", "polite");
  });

  it("toast can be dismissed via dismiss button", () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>
    );
    act(() => screen.getByText("Show").click());
    const dismissButton = screen.getByLabelText("Dismiss notification");
    act(() => dismissButton.click());
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText("Hello")).not.toBeInTheDocument();
  });
});
