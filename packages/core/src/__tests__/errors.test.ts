import { describe, it, expect } from "vitest";
import { ConfigError, getErrorMessage } from "../utils/errors.js";

describe("ConfigError", () => {
  it("should create error with message", () => {
    const error = new ConfigError("Configuration invalid");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Configuration invalid");
    expect(error.name).toBe("ConfigError");
  });

  it("should create error with message and field", () => {
    const error = new ConfigError("Missing required field", "apiKey");
    expect(error.message).toBe("Missing required field");
    expect(error.field).toBe("apiKey");
    expect(error.name).toBe("ConfigError");
  });

  it("should have correct inheritance chain", () => {
    const error = new ConfigError("test");
    expect(error instanceof ConfigError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });
});

describe("getErrorMessage", () => {
  it("should return message from Error instance", () => {
    expect(getErrorMessage(new Error("oops"))).toBe("oops");
  });

  it("should return message from Error subclass", () => {
    expect(getErrorMessage(new ConfigError("bad config"))).toBe("bad config");
  });

  it("should stringify non-Error values", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
    expect(getErrorMessage(null)).toBe("null");
    expect(getErrorMessage(undefined)).toBe("undefined");
  });
});
