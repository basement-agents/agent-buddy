// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "../components/ErrorBoundary.js";

describe("ErrorBoundary", () => {
  const ThrowError = ({ shouldThrow = false }: { shouldThrow?: boolean }) => {
    if (shouldThrow) {
      throw new Error("Test error");
    }
    return <div>Normal content</div>;
  };

  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Normal content")).toBeInTheDocument();
  });

  it("shows error UI when a child component throws", async () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("Test error")).toBeInTheDocument();
    });
  });

  it("retry button resets error state and re-renders children", async () => {
    const TestComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
      if (shouldThrow) {
        throw new Error("Initial error");
      }
      return <div>Recovered content</div>;
    };

    // Create a wrapper that controls whether to throw
    let throwState = true;
    const Wrapper = () => <TestComponent shouldThrow={throwState} />;

    const { container } = render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>
    );

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    throwState = false;
    const retryButton = screen.getByRole("button", { name: /Try Again/i });
    await userEvent.click(retryButton);

    // Should show recovered content
    await waitFor(() => {
      expect(screen.getByText("Recovered content")).toBeInTheDocument();
    });
  });

  it("custom fallback prop renders instead of default error UI", async () => {
    const customFallback = <div>Custom error message</div>;

    render(
      <ErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText("Custom error message")).toBeInTheDocument();
      // Check that default error UI is not present
      expect(screen.queryByText("An unexpected error occurred")).not.toBeInTheDocument();
    });
  });

  it("displays error message from error", async () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText("Test error")).toBeInTheDocument();
    });
  });

  it("shows generic message when error has no message", async () => {
    const ErrorNoMessage = () => {
      throw new Error("");
    };

    render(
      <ErrorBoundary>
        <ErrorNoMessage />
      </ErrorBoundary>
    );

    await waitFor(() => {
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
      expect(screen.getByText("An unexpected error occurred")).toBeInTheDocument();
    });
  });
});
