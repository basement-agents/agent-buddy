import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("@agent-buddy/core", () => ({
  loadConfig: vi.fn(),
}));

import { loadConfig } from "@agent-buddy/core";
import { rateLimitMiddleware, getRateLimitStatus } from "../middleware/rate-limit.js";

describe("rateLimitMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadConfig).mockResolvedValue({
      version: "1.0.0",
      repos: [],
      server: {
        port: 3000,
        host: "localhost",
        webhookSecret: "test-secret",
        apiKey: "test-api-key",
      },
    });
  });

  describe("Basic rate limiting", () => {
    it("should pass through when under the limit", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.1",
        },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ ok: true });
    });

    it("should return 429 when limit exceeded", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.2";

      // Make 31 requests (exceeds public limit of 30)
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": ip,
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // First 30 should succeed
      for (let i = 0; i < 30; i++) {
        expect(responses[i].status).toBe(200);
      }

      // 31st should be rate limited
      expect(responses[30].status).toBe(429);
      const data = await responses[30].json();
      expect(data).toEqual({
        error: "Rate limit exceeded",
        retryAfter: expect.any(Number),
      });
    });
  });

  describe("Rate limit headers", () => {
    it("should set X-RateLimit-Limit header", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.3",
        },
      });

      expect(res.headers.get("X-RateLimit-Limit")).toBe("30");
    });

    it("should set X-RateLimit-Remaining header", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.4",
        },
      });

      expect(res.headers.get("X-RateLimit-Remaining")).toBe("29");
    });

    it("should decrement X-RateLimit-Remaining with each request", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.5";

      const res1 = await app.request("/test", {
        headers: {
          "x-forwarded-for": ip,
        },
      });

      const res2 = await app.request("/test", {
        headers: {
          "x-forwarded-for": ip,
        },
      });

      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("29");
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("28");
    });

    it("should set X-RateLimit-Reset header", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.6",
        },
      });

      const reset = res.headers.get("X-RateLimit-Reset");
      expect(reset).not.toBeNull();
      const resetTime = parseInt(reset!, 10);
      expect(resetTime).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe("Retry-After header", () => {
    it("should set Retry-After header on 429 response", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.7";

      // Make 31 requests to exceed limit
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": ip,
            },
          })
        );
      }

      const responses = await Promise.all(requests);
      const rateLimitedResponse = responses[30];

      expect(rateLimitedResponse.status).toBe(429);
      const retryAfter = rateLimitedResponse.headers.get("Retry-After");
      expect(retryAfter).not.toBeNull();
      const retryAfterSeconds = parseInt(retryAfter!, 10);
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(60);
    });
  });

  describe("Authenticated requests", () => {
    it("should allow more requests with valid API key", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.8";

      // Make 100 requests with valid API key
      const requests = [];
      for (let i = 0; i < 100; i++) {
        requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": ip,
              "x-api-key": "test-api-key",
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // All 100 should succeed
      for (let i = 0; i < 100; i++) {
        expect(responses[i].status).toBe(200);
      }

      // Check that limit header reflects authenticated limit
      expect(responses[0].headers.get("X-RateLimit-Limit")).toBe("100");
    });

    it("should return 429 when authenticated limit exceeded", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.9";

      // Make 101 requests with valid API key (exceeds limit of 100)
      const requests = [];
      for (let i = 0; i < 101; i++) {
        requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": ip,
              "x-api-key": "test-api-key",
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // First 100 should succeed
      for (let i = 0; i < 100; i++) {
        expect(responses[i].status).toBe(200);
      }

      // 101st should be rate limited
      expect(responses[100].status).toBe(429);
    });

    it("should use public limit with invalid API key", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.10";

      // Make 31 requests with invalid API key
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": ip,
              "x-api-key": "wrong-api-key",
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // Should be limited to 30 (public limit)
      for (let i = 0; i < 30; i++) {
        expect(responses[i].status).toBe(200);
      }
      expect(responses[30].status).toBe(429);

      // Check that limit header reflects public limit
      expect(responses[0].headers.get("X-RateLimit-Limit")).toBe("30");
    });
  });

  describe("Webhook endpoints", () => {
    it("should enforce public limit on webhook endpoints even with valid API key", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/api/webhooks/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.11";

      // Make 31 requests with valid API key to webhook endpoint
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.request("/api/webhooks/test", {
            headers: {
              "x-forwarded-for": ip,
              "x-api-key": "test-api-key",
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // Should be limited to 30 (public limit for webhooks)
      for (let i = 0; i < 30; i++) {
        expect(responses[i].status).toBe(200);
      }
      expect(responses[30].status).toBe(429);

      // Check that limit header reflects public limit
      expect(responses[0].headers.get("X-RateLimit-Limit")).toBe("30");
    });

    it("should enforce public limit on webhook endpoints without API key", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/api/webhooks/test", (c) => c.json({ ok: true }));

      const ip = "192.168.1.12";

      // Make 31 requests without API key to webhook endpoint
      const requests = [];
      for (let i = 0; i < 31; i++) {
        requests.push(
          app.request("/api/webhooks/test", {
            headers: {
              "x-forwarded-for": ip,
            },
          })
        );
      }

      const responses = await Promise.all(requests);

      // Should be limited to 30
      for (let i = 0; i < 30; i++) {
        expect(responses[i].status).toBe(200);
      }
      expect(responses[30].status).toBe(429);
    });
  });

  describe("Independent rate limits per IP", () => {
    it("should track rate limits independently for different IPs", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      // IP1 makes 30 requests (at limit)
      const ip1Requests = [];
      for (let i = 0; i < 30; i++) {
        ip1Requests.push(
          app.request("/test", {
            headers: {
              "x-forwarded-for": "192.168.1.13",
            },
          })
        );
      }

      const ip1Responses = await Promise.all(ip1Requests);
      for (const res of ip1Responses) {
        expect(res.status).toBe(200);
      }

      // IP2 should still be able to make requests
      const ip2Response = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.14",
        },
      });
      expect(ip2Response.status).toBe(200);
      expect(ip2Response.headers.get("X-RateLimit-Remaining")).toBe("29");
    });

    it("should use x-real-ip header when x-forwarded-for is not present", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test", {
        headers: {
          "x-real-ip": "192.168.1.15",
        },
      });

      expect(res.status).toBe(200);
    });

    it("should use 'unknown' when no IP headers are present", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const res = await app.request("/test");

      expect(res.status).toBe(200);
    });

    it("should extract first IP from x-forwarded-for comma-separated list", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      const ip1 = "192.168.1.16";
      const ip2 = "192.168.1.17";

      // Make request with multiple IPs
      const res1 = await app.request("/test", {
        headers: {
          "x-forwarded-for": `${ip1}, ${ip2}`,
        },
      });

      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-RateLimit-Remaining")).toBe("29");

      // Make request with only first IP - should be tracked separately
      const res2 = await app.request("/test", {
        headers: {
          "x-forwarded-for": ip2,
        },
      });

      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-RateLimit-Remaining")).toBe("29");
    });
  });

  describe("getRateLimitStatus", () => {
    it("should return correct stats about rate limit store", async () => {
      const app = new Hono();
      app.use("/*", rateLimitMiddleware());
      app.get("/test", (c) => c.json({ ok: true }));

      // Get initial count
      const initialStatus = getRateLimitStatus();
      const initialCount = initialStatus.totalEntries;

      // Make some requests to populate the store
      await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.18",
        },
      });

      await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.19",
        },
      });

      const status = getRateLimitStatus();

      expect(status).toEqual({
        totalEntries: initialCount + 2,
        windowMs: 60000,
        publicLimit: 30,
        authenticatedLimit: 100,
      });
    });

  });
});

