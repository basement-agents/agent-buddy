import type { MiddlewareHandler } from "hono";
import type { Context } from "hono";
import { loadConfig } from "@agent-buddy/core";
import { safeEqual } from "../lib/crypto.js";

interface RateLimitEntry {
  requests: number[];
  windowMs: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const DEFAULT_WINDOW_MS = 60 * 1000;
const PUBLIC_LIMIT = 30;
const AUTHENTICATED_LIMIT = 100;

function extractClientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
         c.req.header("x-real-ip") ||
         "unknown";
}

function createStoreCleanup(store: Map<string, RateLimitEntry>, intervalMs = 60000): void {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (!entry.requests.some((ts) => now - ts < entry.windowMs)) {
        store.delete(key);
      }
    }
  }, intervalMs);
}

createStoreCleanup(rateLimitStore);

export function getRateLimitStatus(): {
  totalEntries: number;
  windowMs: number;
  publicLimit: number;
  authenticatedLimit: number;
} {
  return {
    totalEntries: rateLimitStore.size,
    windowMs: DEFAULT_WINDOW_MS,
    publicLimit: PUBLIC_LIMIT,
    authenticatedLimit: AUTHENTICATED_LIMIT,
  };
}

function createRateLimiter(
  store: Map<string, RateLimitEntry>,
  windowMs: number,
  resolveLimit: (c: Context) => Promise<number>
): MiddlewareHandler {
  return async (c, next) => {
    const ip = extractClientIp(c);
    const now = Date.now();
    const limit = await resolveLimit(c);

    let entry = store.get(ip);
    if (!entry) {
      entry = { requests: [], windowMs };
      store.set(ip, entry);
    }

    entry.requests = entry.requests.filter((ts) => now - ts < entry.windowMs);

    if (entry.requests.length >= limit) {
      const oldestRequest = entry.requests[0];
      const retryAfter = Math.ceil((oldestRequest + entry.windowMs - now) / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Rate limit exceeded", retryAfter }, 429);
    }

    entry.requests.push(now);

    const resetTime = entry.requests[0] + entry.windowMs;
    const remaining = limit - entry.requests.length;
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.floor(resetTime / 1000)));

    await next();
  };
}

export const rateLimitMiddleware = (): MiddlewareHandler =>
  createRateLimiter(rateLimitStore, DEFAULT_WINDOW_MS, async (c) => {
    const apiKey = c.req.header("x-api-key");
    const config = await loadConfig();
    let isAuthenticated = false;
    if (apiKey && config.server?.apiKey) {
      isAuthenticated = safeEqual(apiKey, config.server.apiKey);
    }
    if (c.req.path.startsWith("/api/webhooks")) return PUBLIC_LIMIT;
    return isAuthenticated ? AUTHENTICATED_LIMIT : PUBLIC_LIMIT;
  });

const REVIEW_RATE_LIMIT_REQUESTS = 10;
const REVIEW_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const reviewRateLimitStore = new Map<string, RateLimitEntry>();

createStoreCleanup(reviewRateLimitStore);

export const reviewRateLimitMiddleware = (): MiddlewareHandler =>
  createRateLimiter(reviewRateLimitStore, REVIEW_RATE_LIMIT_WINDOW_MS, () => Promise.resolve(REVIEW_RATE_LIMIT_REQUESTS));
