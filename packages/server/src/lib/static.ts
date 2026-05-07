import type { MiddlewareHandler } from "hono";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function mimeFor(p: string): string {
  const dot = p.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[p.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

function safeJoin(root: string, requested: string): string | null {
  const decoded = decodeURIComponent(requested);
  const joined = normalize(join(root, decoded));
  if (!joined.startsWith(normalize(root))) return null;
  return joined;
}

export interface ServeStaticOptions {
  spaFallback?: boolean;
}

export function serveStatic(
  dir: string,
  opts: ServeStaticOptions = { spaFallback: true },
): MiddlewareHandler {
  const spaFallback = opts.spaFallback ?? true;
  return async (c, next) => {
    if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
    const p = c.req.path;
    if (p.startsWith("/api/")) return next();
    if (!existsSync(dir)) return next();

    const target = safeJoin(dir, p === "/" ? "/index.html" : p);
    if (target && existsSync(target) && statSync(target).isFile()) {
      const buf = readFileSync(target);
      return c.body(buf, 200, { "content-type": mimeFor(target) });
    }

    if (!spaFallback) return next();

    const indexPath = join(dir, "index.html");
    if (!existsSync(indexPath)) return next();
    const html = readFileSync(indexPath);
    return c.body(html, 200, { "content-type": "text/html; charset=utf-8" });
  };
}
