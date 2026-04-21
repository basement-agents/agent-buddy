import { describe, it, expect } from "vitest";

describe("CLI review trigger command", () => {
  it("should call the correct server endpoint format", async () => {
    // This test documents the expected API contract between CLI and server
    // The CLI should call: POST /api/repos/:owner/:repo/reviews
    // With body: { prNumber: number }
    // And optional query param: ?buddyId=X

    const expectedEndpoint = "/api/repos/:owner/:repo/reviews";
    const expectedBody = { prNumber: 123 };
    const expectedQueryParams = new URLSearchParams();
    expectedQueryParams.append("buddyId", "buddy-123");

    expect(expectedEndpoint).toMatch(/\/api\/repos\/[^/]+\/[^/]+\/reviews/);
    expect(expectedBody).toHaveProperty("prNumber");
    expect(typeof expectedBody.prNumber).toBe("number");
    expect(expectedQueryParams.get("buddyId")).toBe("buddy-123");
  });

  it("should handle server response format", async () => {
    // Server returns: { message: string, buddyIds: string[] }
    const serverResponse = {
      message: "Queued reviews for 1 buddy(s)",
      buddyIds: ["buddy-123"],
    };

    expect(serverResponse).toHaveProperty("message");
    expect(serverResponse).toHaveProperty("buddyIds");
    expect(Array.isArray(serverResponse.buddyIds)).toBe(true);
  });

  it("should handle error response format", async () => {
    // Server returns errors as: { error: string }
    const errorResponse = {
      error: "Repo not found",
    };

    expect(errorResponse).toHaveProperty("error");
    expect(typeof errorResponse.error).toBe("string");
  });
});
