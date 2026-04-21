// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "../components/ui/pagination";

describe("Pagination", () => {
  describe("Renders nothing for 0 or 1 pages", () => {
    it("returns null when totalPages is 0", () => {
      const { container } = render(
        <Pagination page={1} totalPages={0} onPageChange={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });

    it("returns null when totalPages is 1", () => {
      const { container } = render(
        <Pagination page={1} totalPages={1} onPageChange={vi.fn()} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("Previous/Next boundary behavior", () => {
    it("disables Previous button on page 1", () => {
      render(<Pagination page={1} totalPages={5} onPageChange={vi.fn()} />);
      const prevButton = screen.getByLabelText("Previous page");
      expect(prevButton).toBeDisabled();
    });

    it("disables Next button on last page", () => {
      render(<Pagination page={5} totalPages={5} onPageChange={vi.fn()} />);
      const nextButton = screen.getByLabelText("Next page");
      expect(nextButton).toBeDisabled();
    });

    it("enables both buttons on middle page", () => {
      render(<Pagination page={3} totalPages={5} onPageChange={vi.fn()} />);
      const prevButton = screen.getByLabelText("Previous page");
      const nextButton = screen.getByLabelText("Next page");
      expect(prevButton).not.toBeDisabled();
      expect(nextButton).not.toBeDisabled();
    });
  });

  describe("Page number click calls onPageChange", () => {
    it("calls onPageChange with page number when clicking page 3", async () => {
      const handleChange = vi.fn();
      render(<Pagination page={1} totalPages={5} onPageChange={handleChange} />);
      const page3Button = screen.getAllByText("3")[0];
      await userEvent.click(page3Button);
      expect(handleChange).toHaveBeenCalledWith(3);
    });

    it("calls onPageChange with previous page when clicking Previous on page 3", async () => {
      const handleChange = vi.fn();
      render(<Pagination page={3} totalPages={5} onPageChange={handleChange} />);
      const prevButton = screen.getByLabelText("Previous page");
      await userEvent.click(prevButton);
      expect(handleChange).toHaveBeenCalledWith(2);
    });

    it("calls onPageChange with next page when clicking Next on page 3", async () => {
      const handleChange = vi.fn();
      render(<Pagination page={3} totalPages={5} onPageChange={handleChange} />);
      const nextButton = screen.getByLabelText("Next page");
      await userEvent.click(nextButton);
      expect(handleChange).toHaveBeenCalledWith(4);
    });
  });

  describe("Correct page numbers displayed", () => {
    it("shows all pages when total is 3", () => {
      render(<Pagination page={1} totalPages={3} onPageChange={vi.fn()} />);
      const pages = screen.getAllByText(/^[1-3]$/);
      expect(pages).toHaveLength(3);
      expect(screen.getByText("1")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });

    it("shows all pages when total is 7", () => {
      render(<Pagination page={1} totalPages={7} onPageChange={vi.fn()} />);
      const pages = screen.getAllByText(/^[1-7]$/);
      expect(pages).toHaveLength(7);
      for (let i = 1; i <= 7; i++) {
        expect(screen.getByText(i.toString())).toBeInTheDocument();
      }
    });

    it("shows ellipsis for 10 pages on page 1", () => {
      const { container } = render(
        <Pagination page={1} totalPages={10} onPageChange={vi.fn()} />
      );
      expect(container.textContent).toContain("1");
      expect(container.textContent).toContain("2");
      expect(container.textContent).toContain("...");
      expect(container.textContent).toContain("10");
      expect(container.textContent).not.toContain("3");
    });

    it("shows ellipsis for 10 pages on page 5", () => {
      const { container } = render(
        <Pagination page={5} totalPages={10} onPageChange={vi.fn()} />
      );
      expect(container.textContent).toContain("1");
      expect(container.textContent).toContain("...");
      expect(container.textContent).toContain("4");
      expect(container.textContent).toContain("5");
      expect(container.textContent).toContain("6");
      expect(container.textContent).toContain("10");
    });

    it("shows ellipsis for 10 pages on page 10", () => {
      const { container } = render(
        <Pagination page={10} totalPages={10} onPageChange={vi.fn()} />
      );
      expect(container.textContent).toContain("1");
      expect(container.textContent).toContain("...");
      expect(container.textContent).toContain("9");
      expect(container.textContent).toContain("10");
    });

    it("shows ellipsis correctly for very large page count (100 pages)", () => {
      const { container } = render(
        <Pagination page={50} totalPages={100} onPageChange={vi.fn()} />
      );
      expect(container.textContent).toContain("1");
      expect(container.textContent).toContain("...");
      expect(container.textContent).toContain("49");
      expect(container.textContent).toContain("50");
      expect(container.textContent).toContain("51");
      expect(container.textContent).toContain("100");
    });
  });

  describe("Current page highlighted", () => {
    it("marks current page with aria-current='page'", () => {
      render(<Pagination page={3} totalPages={5} onPageChange={vi.fn()} />);
      const page3Button = screen.getAllByText("3")[0];
      expect(page3Button).toHaveAttribute("aria-current", "page");
    });

    it("does not mark other pages with aria-current", () => {
      render(<Pagination page={3} totalPages={5} onPageChange={vi.fn()} />);
      const page2Button = screen.getAllByText("2")[0];
      const page4Button = screen.getAllByText("4")[0];
      expect(page2Button).not.toHaveAttribute("aria-current");
      expect(page4Button).not.toHaveAttribute("aria-current");
    });
  });
});
