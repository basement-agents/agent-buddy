import type { MiddlewareHandler } from "hono";

export const securityHeadersMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    // Prevent MIME type sniffing
    c.header("X-Content-Type-Options", "nosniff");

    // Prevent clickjacking
    c.header("X-Frame-Options", "DENY");

    // Disable legacy XSS filter (modern browsers use CSP)
    c.header("X-XSS-Protection", "0");

    // Control referrer information
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");

    // Content Security Policy
    c.header(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    );

    // Permissions Policy (restrict browser features)
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

    await next();
  };
};
