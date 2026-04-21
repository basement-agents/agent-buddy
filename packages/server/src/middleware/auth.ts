import type { MiddlewareHandler } from "hono";
import { loadConfig } from "@agent-buddy/core";
import { safeEqual } from "../lib/crypto.js";
import { apiError } from "../lib/api-response.js";

type Env = {
  Variables: {
    apiKey?: string;
  };
};

const authMiddleware: MiddlewareHandler<Env> = async (c, next) => {
  const apiKey = c.req.header("x-api-key");
  const config = await loadConfig();

  if (!config.server?.apiKey) {
    return next();
  }

  if (!apiKey || !safeEqual(apiKey, config.server.apiKey)) {
    const status = apiKey ? 403 : 401;
    return c.json(apiError("Unauthorized"), status);
  }

  return next();
};

export { authMiddleware };
