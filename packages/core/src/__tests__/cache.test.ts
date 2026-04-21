import { describe, it, expect } from "vitest";
import { FileContextCache } from "../cache/file-cache.js";

describe("FileContextCache", () => {
  it("should store and retrieve values", () => {
    const cache = new FileContextCache(10, 60000);
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("should return undefined for missing keys", () => {
    const cache = new FileContextCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("should respect TTL", () => {
    const cache = new FileContextCache(10, 1000); // 1s TTL for test reliability
    cache.set("key1", "value1", 100); // 100ms TTL
    // Expect it to still be there immediately
    expect(cache.get("key1")).toBe("value1");
    // Wait a tiny bit
    const start = Date.now();
    while (Date.now() - start < 150) {
      // busy wait 150ms
    }
    expect(cache.get("key1")).toBeUndefined();
  });

  it("should evict oldest entries when over maxSize", () => {
    const cache = new FileContextCache(2, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.stats().size).toBeLessThanOrEqual(2);
  });

  it("should invalidate specific keys", () => {
    const cache = new FileContextCache();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.invalidate("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
  });

  it("should invalidate by pattern", () => {
    const cache = new FileContextCache();
    cache.set("file:a", 1);
    cache.set("file:b", 2);
    cache.set("other:c", 3);
    cache.invalidatePattern(/^file:/);
    expect(cache.get("file:a")).toBeUndefined();
    expect(cache.get("file:b")).toBeUndefined();
    expect(cache.get("other:c")).toBe(3);
  });

  it("should track stats", () => {
    const cache = new FileContextCache();
    cache.set("a", 1);
    cache.get("a"); // hit
    cache.get("b"); // miss
    const stats = cache.stats();
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.size).toBe(1);
  });

  it("should evict least recently used entry when maxSize exceeded", () => {
    const cache = new FileContextCache(3, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.stats().size).toBe(3);

    // Access 'a' to make it more recently used
    cache.get("a");

    // Add 'd', should evict 'b' (least recently used)
    cache.set("d", 4);
    expect(cache.stats().size).toBe(3);
    expect(cache.get("a")).toBe(1); // Still present (accessed)
    expect(cache.get("b")).toBeUndefined(); // Evicted
    expect(cache.get("c")).toBe(3); // Still present
    expect(cache.get("d")).toBe(4); // New entry
  });

  it("should update access order on get", () => {
    const cache = new FileContextCache(3, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);

    // Access in order: a, b, c
    cache.get("a");
    cache.get("b");
    cache.get("c");

    // Add 'd', should evict 'a' (least recently used)
    cache.set("d", 4);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("should respect maxSize after clearing expired entries", () => {
    const cache = new FileContextCache(3, 60000);
    cache.set("a", 1, 50); // Short TTL
    cache.set("b", 2, 60000);
    cache.set("c", 3, 60000);

    // Wait for 'a' to expire
    const start = Date.now();
    while (Date.now() - start < 100) {
      // busy wait
    }

    // Clear expired - should remove 'a'
    const removed = cache.clearExpired();
    expect(removed).toBe(1);
    expect(cache.stats().size).toBe(2);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);

    // Now add more entries to test maxSize enforcement after clearExpired
    cache.set("d", 4, 60000);
    cache.set("e", 5, 60000); // This should trigger eviction due to maxSize=3
    expect(cache.stats().size).toBe(3);
  });

  it("should return maxSize in stats", () => {
    const cache = new FileContextCache(42, 60000);
    cache.set("a", 1);
    const stats = cache.stats();
    expect(stats.maxSize).toBe(42);
    expect(stats.size).toBe(1);
  });

  it("should default maxSize to 100", () => {
    const cache = new FileContextCache();
    const stats = cache.stats();
    expect(stats.maxSize).toBe(100);
  });
});
