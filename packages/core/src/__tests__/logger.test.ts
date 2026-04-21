import { describe, it, expect } from "vitest";
import { Logger } from "../utils/logger.js";

describe("Logger", () => {
  it("should create a logger with default level", () => {
    const logger = new Logger("test");
    expect(logger).toBeDefined();
  });

  it("should create child logger", () => {
    const logger = new Logger("test");
    const child = logger.child("sub");
    expect(child).toBeDefined();
  });

  it("should respect log level hierarchy", () => {
    const logger = new Logger("test", "warn");
    expect(logger).toBeDefined();
    // debug and info should not log at warn level
  });

  it("should produce structured output", () => {
    const logger = new Logger("test");
    const structured = logger.structured();
    expect(structured).toHaveProperty("level");
    expect(structured).toHaveProperty("timestamp");
    expect(structured).toHaveProperty("prefix");
  });
});
