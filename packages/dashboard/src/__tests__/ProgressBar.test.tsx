// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "../components/ProgressBar.js";

describe("ProgressBar", () => {
  it("renders with correct percentage display", () => {
    render(<ProgressBar percentage={45} />);
    expect(screen.getByText("45%")).toBeInTheDocument();
  });

  it("applies correct width style based on progress value", () => {
    const { container } = render(<ProgressBar percentage={67} />);
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar).toBeInTheDocument();
    expect(progressBar?.getAttribute("style")).toContain("width: 67%");
  });

  it("handles 0% edge case", () => {
    const { container } = render(<ProgressBar percentage={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute("style")).toContain("width: 0%");
  });

  it("handles 100% edge case", () => {
    const { container } = render(<ProgressBar percentage={100} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute("style")).toContain("width: 100%");
  });

  it("clamps percentage above 100 to 100", () => {
    const { container } = render(<ProgressBar percentage={150} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute("style")).toContain("width: 100%");
  });

  it("clamps negative percentage to 0", () => {
    const { container } = render(<ProgressBar percentage={-10} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    const progressBar = container.querySelector('[style*="width"]');
    expect(progressBar?.getAttribute("style")).toContain("width: 0%");
  });

  it("shows status label if provided", () => {
    render(<ProgressBar percentage={50} statusText="Processing..." />);
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("shows label if provided", () => {
    render(<ProgressBar percentage={75} label="Upload Progress" />);
    expect(screen.getByText("Upload Progress")).toBeInTheDocument();
  });

  it("does not show percentage when indeterminate", () => {
    render(<ProgressBar indeterminate={true} />);
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("shows both label and percentage when provided", () => {
    render(<ProgressBar percentage={33} label="Downloading" />);
    expect(screen.getByText("Downloading")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("does not show percentage when percentage is undefined", () => {
    render(<ProgressBar />);
    expect(screen.queryByText("%")).not.toBeInTheDocument();
  });

  it("applies variant styles correctly", () => {
    const { container: defaultContainer } = render(<ProgressBar percentage={50} variant="default" />);
    const { container: successContainer } = render(<ProgressBar percentage={50} variant="success" />);
    const { container: errorContainer } = render(<ProgressBar percentage={50} variant="error" />);

    // Check that variant classes are applied
    expect(defaultContainer.querySelector(".bg-blue-500")).toBeInTheDocument();
    expect(successContainer.querySelector(".bg-green-500")).toBeInTheDocument();
    expect(errorContainer.querySelector(".bg-red-500")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<ProgressBar percentage={50} className="mt-4" />);
    const wrapper = container.firstElementChild;
    expect(wrapper?.classList.contains("mt-4")).toBe(true);
  });

  it("shows indeterminate animation when indeterminate prop is true", () => {
    const { container } = render(<ProgressBar indeterminate={true} />);
    const progressBar = container.querySelector(".animate-pulse");
    expect(progressBar).toBeInTheDocument();
  });
});
