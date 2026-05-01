import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LRUCache, createCache, githubCache } from "./cache.js";

describe("LRUCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------------------------------------------------------------------------
  // Basic get / set
  // ---------------------------------------------------------------------------

  describe("get and set", () => {
    it("should store and retrieve a value", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "hello");
      expect(cache.get<string>("k1")).toBe("hello");
    });

    it("should return undefined for missing keys", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      expect(cache.get("missing")).toBeUndefined();
    });

    it("should overwrite an existing key", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "v1");
      cache.set("k1", "v2");
      expect(cache.get<string>("k1")).toBe("v2");
      expect(cache.size).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // TTL expiry
  // ---------------------------------------------------------------------------

  describe("TTL expiry", () => {
    it("should expire entries after default TTL", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 5_000 });
      cache.set("k1", "v1");

      expect(cache.get("k1")).toBe("v1");

      // Advance past TTL.
      vi.advanceTimersByTime(5_001);
      expect(cache.get("k1")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("should use per-entry TTL when provided", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "v1", 1_000); // 1 second TTL

      vi.advanceTimersByTime(1_001);
      expect(cache.get("k1")).toBeUndefined();
    });

    it("should keep entries that have not expired", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 10_000 });
      cache.set("k1", "v1");

      vi.advanceTimersByTime(9_999);
      expect(cache.get("k1")).toBe("v1");
    });
  });

  // ---------------------------------------------------------------------------
  // LRU eviction
  // ---------------------------------------------------------------------------

  describe("LRU eviction", () => {
    it("should evict the least recently used entry when at capacity", () => {
      const cache = new LRUCache({ maxSize: 3, defaultTtlMs: 60_000 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Adding a 4th entry should evict "a" (LRU).
      cache.set("d", 4);

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
      expect(cache.get("d")).toBe(4);
      expect(cache.size).toBe(3);
    });

    it("should promote accessed entries so they are not evicted", () => {
      const cache = new LRUCache({ maxSize: 3, defaultTtlMs: 60_000 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      // Access "a" to promote it above "b" in LRU order.
      cache.get("a");

      // Adding "d" should now evict "b" (oldest unused).
      cache.set("d", 4);

      expect(cache.get("a")).toBe(1);
      expect(cache.get("b")).toBeUndefined();
      expect(cache.get("d")).toBe(4);
    });

    it("should track eviction count", () => {
      const cache = new LRUCache({ maxSize: 2, defaultTtlMs: 60_000 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3); // evicts "a"
      cache.set("d", 4); // evicts "b"

      expect(cache.stats().evictions).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Invalidation
  // ---------------------------------------------------------------------------

  describe("invalidate", () => {
    it("should remove a specific key", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "v1");
      expect(cache.invalidate("k1")).toBe(true);
      expect(cache.get("k1")).toBeUndefined();
      expect(cache.size).toBe(0);
    });

    it("should return false when key does not exist", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      expect(cache.invalidate("nope")).toBe(false);
    });
  });

  describe("invalidatePattern", () => {
    it("should remove keys matching a predicate", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("pr:owner:repo:1", "a");
      cache.set("pr:owner:repo:2", "b");
      cache.set("files:owner:repo:1", "c");
      cache.set("repo:owner:repo", "d");

      const removed = cache.invalidatePattern((k) => k.startsWith("pr:"));

      expect(removed).toBe(2);
      expect(cache.get("pr:owner:repo:1")).toBeUndefined();
      expect(cache.get("pr:owner:repo:2")).toBeUndefined();
      expect(cache.get("files:owner:repo:1")).toBe("c");
      expect(cache.get("repo:owner:repo")).toBe("d");
    });

    it("should return 0 when no keys match", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "v1");
      expect(cache.invalidatePattern((k) => k.startsWith("zzz"))).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // clear
  // ---------------------------------------------------------------------------

  describe("clear", () => {
    it("should remove all entries and reset stats", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.get("a"); // hit
      cache.get("missing"); // miss

      cache.clear();

      expect(cache.size).toBe(0);
      const s = cache.stats();
      expect(s.hits).toBe(0);
      expect(s.misses).toBe(0);
      expect(s.evictions).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  describe("stats", () => {
    it("should track hits and misses correctly", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("a", 1);

      cache.get("a"); // hit
      cache.get("a"); // hit
      cache.get("b"); // miss
      cache.get("b"); // miss

      const s = cache.stats();
      expect(s.hits).toBe(2);
      expect(s.misses).toBe(2);
      expect(s.hitRate).toBe(0.5);
      expect(s.size).toBe(1);
    });

    it("should return 0 hit rate when no requests made", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      expect(cache.stats().hitRate).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // has
  // ---------------------------------------------------------------------------

  describe("has", () => {
    it("should return true for existing non-expired key", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      cache.set("k1", "v1");
      expect(cache.has("k1")).toBe(true);
    });

    it("should return false for missing key", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 60_000 });
      expect(cache.has("k1")).toBe(false);
    });

    it("should return false for expired key", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 1_000 });
      cache.set("k1", "v1");
      vi.advanceTimersByTime(1_001);
      expect(cache.has("k1")).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Cache key helpers
  // ---------------------------------------------------------------------------

  describe("key helpers", () => {
    it("should generate correct PR key", () => {
      expect(LRUCache.keyPR("octocat", "hello", 42)).toBe("pr:octocat:hello:42");
    });

    it("should generate correct PR files key", () => {
      expect(LRUCache.keyPRFiles("octocat", "hello", 7)).toBe("files:octocat:hello:7");
    });

    it("should generate correct repo key", () => {
      expect(LRUCache.keyRepo("octocat", "hello")).toBe("repo:octocat:hello");
    });

    it("should generate correct PRs list key", () => {
      expect(LRUCache.keyPRs("octocat", "hello", "open")).toBe("prs:octocat:hello:open");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle maxSize of 1", () => {
      const cache = new LRUCache({ maxSize: 1, defaultTtlMs: 60_000 });
      cache.set("a", 1);
      cache.set("b", 2);
      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.size).toBe(1);
    });

    it("should handle updating an entry's TTL", () => {
      const cache = new LRUCache({ maxSize: 10, defaultTtlMs: 1_000 });
      cache.set("k1", "v1");

      // Overwrite with a longer TTL.
      cache.set("k1", "v1", 60_000);

      vi.advanceTimersByTime(2_000);
      expect(cache.get("k1")).toBe("v1"); // still alive
    });
  });
});

// ---------------------------------------------------------------------------
// Factory / singleton
// ---------------------------------------------------------------------------

describe("createCache", () => {
  it("should create an independent cache instance", () => {
    const a = createCache({ maxSize: 5, defaultTtlMs: 10_000 });
    const b = createCache({ maxSize: 5, defaultTtlMs: 10_000 });

    a.set("x", 1);
    expect(b.get("x")).toBeUndefined();
  });
});

describe("githubCache singleton", () => {
  it("should be an LRUCache instance", () => {
    expect(githubCache).toBeInstanceOf(LRUCache);
  });

  it("should default to 100 max size", () => {
    expect(githubCache.stats().maxSize).toBe(100);
  });
});
