/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import { requestIdMiddleware } from "../middleware/request-id.js";

describe("Request ID Middleware", () => {
  let app: Hono<any>;

  beforeEach(() => {
    app = new Hono();
    app.use("*", requestIdMiddleware());
    app.get("/test", (c) => {
      return c.json({ requestId: c.get("requestId") });
    });
  });

  it("sets X-Request-Id header on responses", async () => {
    const res = await app.request("/test");
    expect(res.status).toBe(200);
    const requestId = res.headers.get("X-Request-Id");
    expect(requestId).toBeTruthy();
    expect(requestId!.length).toBeGreaterThan(0);
  });

  it("generates a valid UUID format", async () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    const res = await app.request("/test");
    const requestId = res.headers.get("X-Request-Id")!;
    expect(requestId).toMatch(uuidRegex);
  });

  it("makes request ID available in context via c.get('requestId')", async () => {
    const res = await app.request("/test");
    const data = await res.json() as { requestId: string };
    expect(data.requestId).toBeTruthy();
    expect(data.requestId).toBe(res.headers.get("X-Request-Id"));
  });

  it("generates unique IDs for each request", async () => {
    const res1 = await app.request("/test");
    const res2 = await app.request("/test");
    const id1 = res1.headers.get("X-Request-Id");
    const id2 = res2.headers.get("X-Request-Id");
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it("uses existing X-Request-Id header if provided", async () => {
    const customId = "my-custom-request-id-123";
    const res = await app.request("/test", {
      headers: { "X-Request-Id": customId },
    });

    expect(res.headers.get("X-Request-Id")).toBe(customId);
    const data = await res.json() as { requestId: string };
    expect(data.requestId).toBe(customId);
  });
});
