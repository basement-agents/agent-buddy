import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { securityHeadersMiddleware } from "../middleware/security-headers.js";

describe("securityHeadersMiddleware", () => {
  it("should set all security headers and pass through to handler", async () => {
    const app = new Hono();
    app.use("/*", securityHeadersMiddleware());
    app.get("/test", (c) => c.json({ ok: true }));

    const res = await app.request("/test");

    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Content-Security-Policy")).toBe(
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'"
    );
    expect(res.headers.get("Permissions-Policy")).toBe("camera=(), microphone=(), geolocation=()");

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ok: true });
  });
});
