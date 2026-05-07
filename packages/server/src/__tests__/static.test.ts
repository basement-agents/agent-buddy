import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { serveStatic } from "../lib/static.js";

describe("serveStatic", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agent-buddy-static-"));
    writeFileSync(join(dir, "index.html"), "<html><body>spa</body></html>");
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "main.js"), "console.log('hi')");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns index.html for /", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("spa");
  });

  it("returns asset file when path matches", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/assets/main.js");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("console.log");
  });

  it("falls back to index.html for SPA routes", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    const res = await app.request("/buddy/abc/show");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("spa");
  });

  it("does not handle /api/* paths (passes to next)", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    app.get("/api/health", (c) => c.json({ status: "ok" }));
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 404 when directory missing", async () => {
    const app = new Hono();
    app.use("*", serveStatic("/nonexistent/path"));
    const res = await app.request("/");
    expect(res.status).toBe(404);
  });

  it("does not serve POST requests", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir));
    app.post("/api/x", (c) => c.json({ ok: true }));
    const res = await app.request("/api/x", { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("does not fall back when spaFallback=false and asset missing", async () => {
    const app = new Hono();
    app.use("*", serveStatic(dir, { spaFallback: false }));
    app.get("*", (c) => c.text("not-found", 404));
    const res = await app.request("/buddy/abc/show");
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toBe("not-found");
  });
});
