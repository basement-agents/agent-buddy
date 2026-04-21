import type { MiddlewareHandler } from "hono";
import { randomUUID } from "node:crypto";

const REQUEST_ID_HEADER = "X-Request-Id";
const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_RE = /^[a-zA-Z0-9._-]+$/;

function isValidRequestId(id: string): boolean {
  return id.length <= MAX_REQUEST_ID_LENGTH && REQUEST_ID_RE.test(id);
}

export const requestIdMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const externalId = c.req.header(REQUEST_ID_HEADER);
    const requestId = externalId && isValidRequestId(externalId) ? externalId : randomUUID();

    c.set("requestId", requestId);
    c.header(REQUEST_ID_HEADER, requestId);

    await next();
  };
};
