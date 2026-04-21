import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeadersMiddleware } from "../middleware/security-headers.js";

describe("securityHeadersMiddleware", () => {
  it("should set X-Content-Type-Options header to nosniff", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("should set X-Frame-Options header to DENY", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("should set X-XSS-Protection header to 0", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  it("should set Referrer-Policy header to strict-origin-when-cross-origin", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("should set Content-Security-Policy header", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
    );
  });

  it("should set Permissions-Policy header", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("should call next() and pass through to the handler", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
