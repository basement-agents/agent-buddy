/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const mockListBuddies = vi.fn().mockResolvedValue([{ id: "buddy-1" }]);

vi.mock("@agent-buddy/core", () => ({
  BuddyFileSystemStorage: vi.fn().mockImplementation(function () {
    return { listBuddies: mockListBuddies };
  }),
  getErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
  Logger: class { error = vi.fn(); info = vi.fn(); warn = vi.fn(); },
}));

vi.mock("../jobs/state.js", () => ({
  reviewJobs: new Map(),
  analysisJobs: new Map(),
}));

describe("Health Routes", () => {
  let app: Hono<any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockListBuddies.mockResolvedValue([{ id: "buddy-1" }]);

    const { createHealthRoutes } = await import("../routes/health.js");
    app = new Hono<any>();
    app.route("/", createHealthRoutes());
  });

  it("returns status ok on /api/health", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const data = await res.json() as Record<string, unknown>;
    expect(data.status).toBe("ok");
  });

  it("includes uptime, version, and timestamp fields", async () => {
    const res = await app.request("/api/health");
    const data = await res.json() as Record<string, unknown>;
    const uptime = data.uptime as Record<string, unknown>;

    expect(uptime).toBeDefined();
    expect(Number(uptime.milliseconds)).toBeGreaterThan(0);
    expect(Number(uptime.seconds)).toBeGreaterThanOrEqual(0);
    expect(uptime.startTime).toBeTruthy();
    expect(data.version).toBeDefined();
    expect(typeof data.version).toBe("string");
    expect(data.timestamp).toBeTruthy();
  });

  it("includes systems.storage and systems.github fields", async () => {
    const res = await app.request("/api/health");
    const data = await res.json() as Record<string, unknown>;
    const systems = data.systems as Record<string, Record<string, unknown>>;

    expect(systems).toBeDefined();
    expect(systems.storage).toBeDefined();
    expect(systems.storage.accessible).toBe(true);
    expect(systems.storage.buddyDirectory).toBeTruthy();
    expect(systems.github).toBeDefined();
    expect(typeof systems.github.configured).toBe("boolean");
    expect(typeof systems.github.hasToken).toBe("boolean");
  });

  it("includes jobQueue with pending/running/completed/failed", async () => {
    const res = await app.request("/api/health");
    const data = await res.json() as Record<string, unknown>;
    const jobQueue = data.jobQueue as Record<string, unknown>;

    expect(jobQueue).toBeDefined();
    expect(typeof jobQueue.pending).toBe("number");
    expect(typeof jobQueue.running).toBe("number");
    expect(typeof jobQueue.completed).toBe("number");
    expect(typeof jobQueue.failed).toBe("number");
  });

  it("reports storage failure when BuddyFileSystemStorage throws", async () => {
    mockListBuddies.mockRejectedValueOnce(new Error("Permission denied"));

    const res = await app.request("/api/health");
    const data = await res.json() as Record<string, unknown>;
    const systems = data.systems as Record<string, Record<string, unknown>>;

    expect(systems.storage.accessible).toBe(false);
    expect(systems.storage.error).toBe("Permission denied");
  });
});
