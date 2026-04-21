export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class FileContextCache {
  private cache: Map<string, CacheEntry<unknown>>;
  private maxSize: number;
  private defaultTtlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 100, defaultTtlMs = 300000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Mark as most recently used by deleting and re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };

    this.cache.set(key, entry);

    // Evict least recently used entry if over max size
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  clearExpired(): number {
    const now = Date.now();
    let removed = 0;
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
      removed++;
    }

    // Enforce maxSize after clearing expired entries
    const maxIterations = this.cache.size - this.maxSize + 1;
    let iterations = 0;
    while (this.cache.size > this.maxSize && iterations < maxIterations) {
      const prevSize = this.cache.size;
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
      iterations++;
      if (this.cache.size >= prevSize) {
        break;
      }
    }

    return removed;
  }

  stats(): { size: number; hits: number; misses: number; maxSize: number } {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      maxSize: this.maxSize,
    };
  }
}
