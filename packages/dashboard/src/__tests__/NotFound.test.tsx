// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotFoundPage } from "../pages/NotFound";
import * as hooksModule from "../lib/hooks";

vi.mock("../lib/hooks", () => ({
  useNavigate: vi.fn(() => vi.fn()),
}));

describe("NotFoundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 404 heading", () => {
    render(<NotFoundPage />);
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText("Page not found")).toBeInTheDocument();
  });

  it("renders descriptive text", () => {
    render(<NotFoundPage />);
    expect(screen.getByText("The page you're looking for doesn't exist.")).toBeInTheDocument();
  });

  it("renders Go Home button", () => {
    const mockNavigate = vi.fn();
    vi.mocked(hooksModule.useNavigate).mockReturnValue(mockNavigate);
    render(<NotFoundPage />);
    const button = screen.getByText("Go Home");
    expect(button).toBeInTheDocument();
    button.click();
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });
});
