/**
 * Generic LRU cache with TTL support for GitHub API responses.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  /** Linked-list pointers for LRU ordering. */
  prev: string | null;
  next: string | null;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  evictions: number;
}

export interface LRUCacheOptions {
  /** Maximum number of entries before LRU eviction. Default: 100 */
  maxSize?: number;
  /** Default TTL in milliseconds. Default: 5 minutes */
  defaultTtlMs?: number;
}

export class LRUCache {
  private readonly map = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  /** Head of the doubly-linked list (most recently used). */
  private head: string | null = null;
  /** Tail of the doubly-linked list (least recently used). */
  private tail: string | null = null;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LRUCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.defaultTtlMs = options.defaultTtlMs ?? 5 * 60 * 1000;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  get<T>(key: string): T | undefined {
    const entry = this.map.get(key) as CacheEntry<T> | undefined;
    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL expiry.
    if (Date.now() > entry.expiresAt) {
      this.removeEntry(key);
      this.misses++;
      return undefined;
    }

    this.hits++;
    this.moveToHead(key);
    return entry.value;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    const existing = this.map.get(key);
    if (existing) {
      // Update existing entry in-place.
      existing.value = value;
      existing.expiresAt = Date.now() + (ttlMs ?? this.defaultTtlMs);
      this.moveToHead(key);
      return;
    }

    // Evict LRU if at capacity.
    if (this.map.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      prev: null,
      next: this.head,
    };

    this.map.set(key, entry as CacheEntry<unknown>);

    // Insert at head.
    if (this.head !== null) {
      const headEntry = this.map.get(this.head)!;
      headEntry.prev = key;
    }
    this.head = key;

    if (this.tail === null) {
      this.tail = key;
    }
  }

  /** Remove a single key. Returns true if the key existed. */
  invalidate(key: string): boolean {
    return this.removeEntry(key);
  }

  /**
   * Remove all keys matching a predicate.
   * Returns the number of entries removed.
   */
  invalidatePattern(predicate: (key: string) => boolean): number {
    const keysToRemove: string[] = [];
    for (const key of this.map.keys()) {
      if (predicate(key)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      this.removeEntry(key);
    }
    return keysToRemove.length;
  }

  /** Remove all entries and reset stats. */
  clear(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /** Return current cache statistics. */
  stats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      size: this.map.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
      evictions: this.evictions,
    };
  }

  /** Check whether a key exists and is not expired. */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  get size(): number {
    return this.map.size;
  }

  // ---------------------------------------------------------------------------
  // Cache key helpers (static)
  // ---------------------------------------------------------------------------

  static keyPR(owner: string, repo: string, number: number): string {
    return `pr:${owner}:${repo}:${number}`;
  }

  static keyPRFiles(owner: string, repo: string, number: number): string {
    return `files:${owner}:${repo}:${number}`;
  }

  static keyRepo(owner: string, repo: string): string {
    return `repo:${owner}:${repo}`;
  }

  static keyPRs(owner: string, repo: string, state: string): string {
    return `prs:${owner}:${repo}:${state}`;
  }

  // ---------------------------------------------------------------------------
  // Internal linked-list helpers
  // ---------------------------------------------------------------------------

  private moveToHead(key: string): void {
    if (this.head === key) return; // Already at head.

    const entry = this.map.get(key)!;

    // Unlink from current position.
    if (entry.prev !== null) {
      const prevEntry = this.map.get(entry.prev)!;
      prevEntry.next = entry.next;
    }
    if (entry.next !== null) {
      const nextEntry = this.map.get(entry.next)!;
      nextEntry.prev = entry.prev;
    }

    // If this was the tail, update tail.
    if (this.tail === key) {
      this.tail = entry.prev;
    }

    // Link at head.
    entry.prev = null;
    entry.next = this.head;

    if (this.head !== null) {
      const oldHead = this.map.get(this.head)!;
      oldHead.prev = key;
    }

    this.head = key;

    // Ensure tail is set when there is only one entry.
    if (this.tail === null) {
      this.tail = key;
    }
  }

  private evictLRU(): void {
    if (this.tail === null) return;

    const evictKey = this.tail;
    this.removeEntry(evictKey);
    this.evictions++;
  }

  private removeEntry(key: string): boolean {
    const entry = this.map.get(key);
    if (!entry) return false;

    // Unlink prev.
    if (entry.prev !== null) {
      const prevEntry = this.map.get(entry.prev)!;
      prevEntry.next = entry.next;
    }

    // Unlink next.
    if (entry.next !== null) {
      const nextEntry = this.map.get(entry.next)!;
      nextEntry.prev = entry.prev;
    }

    // Update head/tail if needed.
    if (this.head === key) {
      this.head = entry.next;
    }
    if (this.tail === key) {
      this.tail = entry.prev;
    }

    this.map.delete(key);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Singleton instance with project defaults
// ---------------------------------------------------------------------------

export const githubCache = new LRUCache({
  maxSize: 100,
  defaultTtlMs: 5 * 60 * 1000,
});

/** Factory for creating isolated cache instances (useful in tests). */
export function createCache(options?: LRUCacheOptions): LRUCache {
  return new LRUCache(options);
}
