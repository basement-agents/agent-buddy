import { describe, it, expect, vi, beforeEach } from "vitest";
import { FileContextCache } from "../cache/file-cache.js";

describe("FileContextCache", () => {
  let cache: FileContextCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new FileContextCache(5, 10000);
  });

  describe("basic get/set", () => {
    it("stores and retrieves values", () => {
      cache.set("key1", "value1");
      expect(cache.get("key1")).toBe("value1");
    });

    it("returns undefined for missing keys", () => {
      expect(cache.get("missing")).toBeUndefined();
    });

    it("stores different types", () => {
      cache.set("string", "hello");
      cache.set("number", 42);
      cache.set("object", { foo: "bar" });
      cache.set("array", [1, 2, 3]);

      expect(cache.get("string")).toBe("hello");
      expect(cache.get("number")).toBe(42);
      expect(cache.get("object")).toEqual({ foo: "bar" });
      expect(cache.get("array")).toEqual([1, 2, 3]);
    });
  });

  describe("TTL expiration", () => {
    it("returns undefined for expired entries", () => {
      cache.set("ttl-key", "data", 100);
      expect(cache.get("ttl-key")).toBe("data");

      vi.advanceTimersByTime(150);
      expect(cache.get("ttl-key")).toBeUndefined();
    });

    it("uses default TTL when not specified", () => {
      const defaultCache = new FileContextCache(5, 5000);
      defaultCache.set("default-ttl", "data");
      expect(defaultCache.get("default-ttl")).toBe("data");

      vi.advanceTimersByTime(6000);
      expect(defaultCache.get("default-ttl")).toBeUndefined();
    });
  });

  describe("overwrite", () => {
    it("overwrites existing entry with same key", () => {
      cache.set("key", "original");
      expect(cache.get("key")).toBe("original");

      cache.set("key", "updated");
      expect(cache.get("key")).toBe("updated");
    });
  });

  describe("clear", () => {
    it("removes all entries and resets stats", () => {
      cache.set("a", 1);
      cache.set("b", 2);

      cache.clear();

      expect(cache.stats().size).toBe(0);
      expect(cache.stats().hits).toBe(0);
      expect(cache.stats().misses).toBe(0);
    });
  });

  describe("invalidate", () => {
    it("removes specific key", () => {
      cache.set("keep", "value");
      cache.set("remove", "value");

      cache.invalidate("remove");

      expect(cache.get("keep")).toBe("value");
      expect(cache.get("remove")).toBeUndefined();
    });
  });

  describe("invalidatePattern", () => {
    it("removes keys matching regex", () => {
      cache.set("fileTree:owner/repo", ["a.ts", "b.ts"]);
      cache.set("fileTree:other/repo", ["c.ts"]);
      cache.set("review:owner/repo", { data: "review" });

      cache.invalidatePattern(/^fileTree:/);

      expect(cache.get("fileTree:owner/repo")).toBeUndefined();
      expect(cache.get("fileTree:other/repo")).toBeUndefined();
      expect(cache.get("review:owner/repo")).toBeDefined();
    });
  });

  describe("LRU eviction", () => {
    it("evicts least recently used entry when maxSize exceeded", () => {
      const smallCache = new FileContextCache(3, 10000);

      smallCache.set("a", 1);
      smallCache.set("b", 2);
      smallCache.set("c", 3);

      expect(smallCache.get("a")).toBe(1);
      expect(smallCache.get("b")).toBe(2);
      expect(smallCache.get("c")).toBe(3);

      smallCache.set("d", 4);

      expect(smallCache.get("a")).toBeUndefined();
      expect(smallCache.get("b")).toBe(2);
      expect(smallCache.get("c")).toBe(3);
      expect(smallCache.get("d")).toBe(4);
    });
  });

  describe("stats", () => {
    it("tracks hits and misses accurately", () => {
      cache.set("key", "value");

      cache.get("key");
      cache.get("key");
      cache.get("missing");
      cache.get("missing");
      cache.get("missing");

      const stats = cache.stats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(3);
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(5);
    });
  });

  describe("clearExpired", () => {
    it("removes only expired entries and keeps valid ones", () => {
      cache.set("expired", "old", 100);
      cache.set("valid", "new", 10000);

      vi.advanceTimersByTime(200);

      const removed = cache.clearExpired();
      expect(removed).toBe(1);
      expect(cache.get("expired")).toBeUndefined();
      expect(cache.get("valid")).toBe("new");
    });
  });

  describe("concurrent set/get", () => {
    it("handles multiple keys correctly", () => {
      vi.useRealTimers();
      const bigCache = new FileContextCache(100, 10000);
      for (let i = 0; i < 20; i++) {
        bigCache.set(`key-${i}`, `value-${i}`);
      }

      for (let i = 0; i < 20; i++) {
        expect(bigCache.get(`key-${i}`)).toBe(`value-${i}`);
      }
      vi.useFakeTimers();
    });
  });
});
