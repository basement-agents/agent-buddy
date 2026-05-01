import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchBuddyVersions } from "../commands/buddy-handlers.js";

const mockListProfileVersions = vi.fn();

vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: class {
    listProfileVersions = mockListProfileVersions;
  },
}));

vi.mock("picocolors", () => ({
  default: {
    green: (s: string) => s,
    red: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    dim: (s: string) => s,
    bold: (s: string) => s,
  },
}));

describe("CLI buddy commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buddy versions command", () => {
    it("lists available versions sorted descending", async () => {
      mockListProfileVersions.mockResolvedValue([
        { version: 1, backedUpAt: "2026-04-10T10:00:00Z" },
        { version: 3, backedUpAt: "2026-04-20T10:00:00Z" },
        { version: 2, backedUpAt: "2026-04-15T10:00:00Z" },
      ]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions).toHaveLength(3);
      expect(versions[0].version).toBe(3);
      expect(versions[1].version).toBe(2);
      expect(versions[2].version).toBe(1);
      expect(mockListProfileVersions).toHaveBeenCalledWith("buddy-1");
    });

    it("handles non-existent buddy with no versions", async () => {
      mockListProfileVersions.mockResolvedValue([]);

      const versions = await fetchBuddyVersions("nonexistent-buddy");

      expect(versions).toHaveLength(0);
      expect(mockListProfileVersions).toHaveBeenCalledWith("nonexistent-buddy");
    });

    it("handles single version", async () => {
      mockListProfileVersions.mockResolvedValue([{ version: 1, backedUpAt: "2026-04-10T10:00:00Z" }]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
    });

    it("preserves version metadata from storage", async () => {
      mockListProfileVersions.mockResolvedValue([{ version: 2, backedUpAt: "2026-04-15T10:00:00Z" }]);

      const versions = await fetchBuddyVersions("buddy-1");

      expect(versions[0]).toEqual({ version: 2, backedUpAt: "2026-04-15T10:00:00Z" });
    });

    it("calls BuddyFileSystemStorage.listProfileVersions with buddy ID", async () => {
      mockListProfileVersions.mockResolvedValue([]);

      await fetchBuddyVersions("test-buddy-id");

      expect(mockListProfileVersions).toHaveBeenCalledExactlyOnceWith("test-buddy-id");
    });
  });

});
