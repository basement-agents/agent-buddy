import { describe, it, expect, afterEach } from "vitest";
import { createServer, type Server } from "node:http";
import { isPortAvailable } from "../daemon/port-utils.js";

describe("isPortAvailable", () => {
  let server: Server | null = null;
  afterEach(() => {
    if (server) server.close();
    server = null;
  });

  it("returns true for a likely-free port", async () => {
    expect(await isPortAvailable(0)).toBe(true);
  });

  it("returns false when port is in use", async () => {
    server = createServer();
    const port: number = await new Promise((resolve) => {
      server!.listen(0, () => {
        const addr = server!.address();
        if (addr && typeof addr === "object") resolve(addr.port);
      });
    });
    expect(await isPortAvailable(port)).toBe(false);
  });
});
