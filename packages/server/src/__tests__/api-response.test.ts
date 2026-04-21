import { describe, it, expect } from "vitest";
import { apiError, notFound, validationError } from "../lib/api-response.js";

describe("api-response", () => {
  describe("apiError", () => {
    it("returns object with error field and optional details field", () => {
      const result = apiError("Something went wrong", "Additional context");
      expect(result.error).toBe("Something went wrong");
      expect(result.details).toBe("Additional context");
    });

    it("omits details field when not provided", () => {
      const result = apiError("Error message");
      expect(result.error).toBe("Error message");
      expect(result.details).toBeUndefined();
    });
  });

  describe("notFound", () => {
    it("returns correct error structure with resource and id in message", () => {
      const result = notFound("User", "123");
      expect(result.error).toBe("Not found");
      expect(result.message).toBe("User '123' does not exist");
    });
  });

  describe("validationError", () => {
    it("returns error with 'Validation error' and details", () => {
      const result = validationError("Invalid email format");
      expect(result.error).toBe("Validation error");
      expect(result.message).toBe("Request validation failed");
      expect(result.details).toBe("Invalid email format");
    });
  });
});
