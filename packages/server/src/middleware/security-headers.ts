import type { MiddlewareHandler } from "hono";

export const securityHeadersMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    c.header("X-Content-Type-Options", "nosniff");

    c.header("X-Frame-Options", "DENY");

    c.header("X-XSS-Protection", "0");

    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
    );

    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    await next();
  };
};
