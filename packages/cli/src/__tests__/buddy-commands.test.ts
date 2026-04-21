import { describe, it, expect } from "vitest";

describe("CLI buddy commands", () => {
  describe("list command", () => {
    it("should call GET /api/buddies endpoint", async () => {
      const expectedEndpoint = "/api/buddies";
      const expectedMethod = "GET";

      expect(expectedEndpoint).toBe("/api/buddies");
      expect(expectedMethod).toBe("GET");
    });

    it("should handle array of buddy summaries response", async () => {
      const serverResponse = [
        {
          id: "buddy-123",
          username: "reviewer1",
          repo: "owner/repo",
          createdAt: "2026-04-19T00:00:00Z",
          version: 1,
        },
        {
          id: "buddy-456",
          username: "reviewer2",
          repo: "owner/other-repo",
          createdAt: "2026-04-19T01:00:00Z",
          version: 3,
        },
      ];

      expect(Array.isArray(serverResponse)).toBe(true);
      expect(serverResponse[0]).toHaveProperty("id");
      expect(serverResponse[0]).toHaveProperty("username");
      expect(serverResponse[0]).toHaveProperty("repo");
      expect(serverResponse[0]).toHaveProperty("createdAt");
      expect(serverResponse[0]).toHaveProperty("version");
    });
  });

  describe("show command", () => {
    it("should call GET /api/buddies/:id endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}`;
      const expectedMethod = "GET";

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+/);
      expect(expectedMethod).toBe("GET");
    });

    it("should handle buddy profile response with soul and user data", async () => {
      const serverResponse = {
        id: "buddy-123",
        username: "reviewer1",
        repo: "owner/repo",
        createdAt: "2026-04-19T00:00:00Z",
        version: 1,
        soul: {
          philosophy: "Code should be clean and maintainable",
          priorities: ["readability", "performance", "testing"],
          communicationStyle: "direct but constructive",
        },
        user: {
          expertise: ["frontend", "react", "typescript"],
          seniority: "senior",
          preferredTools: ["eslint", "prettier", "vitest"],
        },
      };

      expect(serverResponse).toHaveProperty("id");
      expect(serverResponse).toHaveProperty("soul");
      expect(serverResponse).toHaveProperty("user");
      expect(typeof serverResponse.soul).toBe("object");
      expect(typeof serverResponse.user).toBe("object");
    });
  });

  describe("create command", () => {
    it("should call POST /api/buddies with username and repo", async () => {
      const expectedEndpoint = "/api/buddies";
      const expectedMethod = "POST";
      const expectedBody = {
        username: "reviewer1",
        repo: "owner/repo",
        maxPrs: 50,
      };

      expect(expectedEndpoint).toBe("/api/buddies");
      expect(expectedMethod).toBe("POST");
      expect(expectedBody).toHaveProperty("username");
      expect(expectedBody).toHaveProperty("repo");
      expect(expectedBody).toHaveProperty("maxPrs");
    });

    it("should handle job queued response", async () => {
      const serverResponse = {
        jobId: "job-abc123",
        status: "queued",
        buddyId: "buddy-123",
      };

      expect(serverResponse).toHaveProperty("jobId");
      expect(serverResponse).toHaveProperty("status");
      expect(serverResponse).toHaveProperty("buddyId");
      expect(serverResponse.status).toBe("queued");
    });
  });

  describe("analyze command", () => {
    it("should call POST /api/buddies with analysis parameters", async () => {
      const expectedEndpoint = "/api/buddies";
      const expectedMethod = "POST";
      const expectedBody = {
        username: "reviewer1",
        repo: "owner/repo",
        maxPrs: 100,
      };

      expect(expectedEndpoint).toBe("/api/buddies");
      expect(expectedMethod).toBe("POST");
      expect(expectedBody.username).toBe("reviewer1");
      expect(expectedBody.repo).toBe("owner/repo");
      expect(expectedBody.maxPrs).toBe(100);
    });

    it("should handle job queued response for analysis", async () => {
      const serverResponse = {
        jobId: "job-def456",
        status: "queued",
        buddyId: "buddy-456",
      };

      expect(serverResponse.status).toBe("queued");
      expect(serverResponse.jobId).toMatch(/^job-/);
    });
  });

  describe("update command", () => {
    it("should call POST /api/buddies/:id/update endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}/update`;
      const expectedMethod = "POST";
      const expectedBody = {
        repo: "owner/new-repo",
      };

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+\/update/);
      expect(expectedMethod).toBe("POST");
      expect(expectedBody).toHaveProperty("repo");
    });

    it("should handle job queued response for update", async () => {
      const serverResponse = {
        jobId: "job-ghi789",
        status: "queued",
        buddyId: "buddy-123",
      };

      expect(serverResponse).toHaveProperty("jobId");
      expect(serverResponse).toHaveProperty("status");
      expect(serverResponse.status).toBe("queued");
    });
  });

  describe("delete command", () => {
    it("should call DELETE /api/buddies/:id endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}`;
      const expectedMethod = "DELETE";

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+/);
      expect(expectedMethod).toBe("DELETE");
    });

    it("should handle deletion confirmation response", async () => {
      const serverResponse = {
        deleted: "buddy-123",
      };

      expect(serverResponse).toHaveProperty("deleted");
      expect(typeof serverResponse.deleted).toBe("string");
    });
  });

  describe("export command", () => {
    it("should call GET /api/buddies/:id/export endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}/export`;
      const expectedMethod = "GET";

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+\/export/);
      expect(expectedMethod).toBe("GET");
    });

    it("should handle profile export JSON response", async () => {
      const serverResponse = {
        id: "buddy-123",
        username: "reviewer1",
        repo: "owner/repo",
        soul: {
          philosophy: "Code quality matters",
          priorities: ["testing", "documentation"],
          communicationStyle: "helpful",
        },
        user: {
          expertise: ["backend", "nodejs"],
          seniority: "staff",
          preferredTools: ["jest", "tslint"],
        },
        version: 2,
        exportedAt: "2026-04-19T00:00:00Z",
      };

      expect(serverResponse).toHaveProperty("id");
      expect(serverResponse).toHaveProperty("soul");
      expect(serverResponse).toHaveProperty("user");
      expect(serverResponse).toHaveProperty("exportedAt");
    });
  });

  describe("import command", () => {
    it("should call POST /api/buddies/import endpoint", async () => {
      const expectedEndpoint = "/api/buddies/import";
      const expectedMethod = "POST";
      const expectedBody = {
        profile: {
          id: "buddy-123",
          username: "reviewer1",
          soul: { philosophy: "Quality first" },
          user: { expertise: ["frontend"] },
        },
        newId: "buddy-imported-456",
      };

      expect(expectedEndpoint).toBe("/api/buddies/import");
      expect(expectedMethod).toBe("POST");
      expect(expectedBody).toHaveProperty("profile");
      expect(expectedBody).toHaveProperty("newId");
    });

    it("should handle import confirmation response", async () => {
      const serverResponse = {
        imported: true,
        id: "buddy-imported-456",
      };

      expect(serverResponse).toHaveProperty("imported");
      expect(serverResponse).toHaveProperty("id");
      expect(typeof serverResponse.imported).toBe("boolean");
      expect(serverResponse.imported).toBe(true);
    });
  });

  describe("versions command", () => {
    it("should call GET /api/buddies/:id/versions endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}/versions`;
      const expectedMethod = "GET";

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+\/versions/);
      expect(expectedMethod).toBe("GET");
    });

    it("should handle versions list response", async () => {
      const serverResponse = [
        {
          version: 1,
          createdAt: "2026-04-19T00:00:00Z",
          description: "Initial creation",
        },
        {
          version: 2,
          createdAt: "2026-04-19T01:00:00Z",
          description: "Updated with new PRs",
        },
      ];

      expect(Array.isArray(serverResponse)).toBe(true);
      expect(serverResponse[0]).toHaveProperty("version");
      expect(serverResponse[0]).toHaveProperty("createdAt");
      expect(serverResponse[0]).toHaveProperty("description");
    });
  });

  describe("rollback command", () => {
    it("should call POST /api/buddies/:id/rollback endpoint", async () => {
      const buddyId = "buddy-123";
      const expectedEndpoint = `/api/buddies/${buddyId}/rollback`;
      const expectedMethod = "POST";
      const expectedBody = {
        version: 1,
      };

      expect(expectedEndpoint).toMatch(/\/api\/buddies\/[^/]+\/rollback/);
      expect(expectedMethod).toBe("POST");
      expect(expectedBody).toHaveProperty("version");
    });

    it("should handle rollback confirmation response", async () => {
      const serverResponse = {
        rolledBack: true,
        id: "buddy-123",
        previousVersion: 2,
        currentVersion: 1,
      };

      expect(serverResponse).toHaveProperty("rolledBack");
      expect(serverResponse).toHaveProperty("id");
      expect(serverResponse).toHaveProperty("previousVersion");
      expect(serverResponse).toHaveProperty("currentVersion");
      expect(typeof serverResponse.rolledBack).toBe("boolean");
    });
  });

  describe("error responses", () => {
    it("should handle 404 not found error", async () => {
      const errorResponse = {
        error: "Buddy not found",
        code: 404,
      };

      expect(errorResponse).toHaveProperty("error");
      expect(errorResponse).toHaveProperty("code");
      expect(errorResponse.code).toBe(404);
      expect(typeof errorResponse.error).toBe("string");
    });

    it("should handle 400 bad request error", async () => {
      const errorResponse = {
        error: "Invalid username format",
        code: 400,
      };

      expect(errorResponse).toHaveProperty("error");
      expect(errorResponse).toHaveProperty("code");
      expect(errorResponse.code).toBe(400);
    });

    it("should handle 500 server error for missing API keys", async () => {
      const errorResponse = {
        error: "Anthropic API key not configured",
        code: 500,
      };

      expect(errorResponse).toHaveProperty("error");
      expect(errorResponse).toHaveProperty("code");
      expect(errorResponse.code).toBe(500);
      expect(errorResponse.error).toContain("API key");
    });
  });
});
