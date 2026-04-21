import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { BuddyFileSystemStorage } from "../buddy/storage.js";
import type { BuddyProfile, MemoryEntry } from "../buddy/types.js";

const TEST_DIR = path.join(os.tmpdir(), `agent-buddy-storage-test-${Date.now()}`);

describe("BuddyFileSystemStorage", () => {
  let storage: BuddyFileSystemStorage;

  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
    storage = new BuddyFileSystemStorage(TEST_DIR);
    await storage.init();
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("Profile save/load/delete", () => {
    it("should save and load a buddy profile", async () => {
      const profile: BuddyProfile = {
        id: "test-buddy",
        username: "testbuddy",
        soul: "# Review Philosophy\n\nFocus on code quality.",
        user: "# Profile\n\nSenior engineer.",
        memory: "# Memory Index\n\nNo entries yet.",
        sourceRepos: ["owner/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      const loaded = await storage.readProfile(profile.id);

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(profile.id);
      expect(loaded?.username).toBe(profile.username);
      expect(loaded?.soul).toBe(profile.soul);
      expect(loaded?.user).toBe(profile.user);
      expect(loaded?.memory).toBe(profile.memory);
      expect(loaded?.sourceRepos).toEqual(profile.sourceRepos);
    });

    it("should return null for non-existent profile", async () => {
      const loaded = await storage.readProfile("non-existent");
      expect(loaded).toBeNull();
    });

    it("should delete a buddy profile", async () => {
      const profile: BuddyProfile = {
        id: "delete-buddy",
        username: "deletebuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      expect(await storage.readProfile(profile.id)).toBeDefined();

      await storage.deleteBuddy(profile.id);
      expect(await storage.readProfile(profile.id)).toBeNull();
    });

    it("should create profile directory and memory subdirectory", async () => {
      const profile: BuddyProfile = {
        id: "dir-test",
        username: "dirtest",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const buddyDir = path.join(TEST_DIR, "buddy", profile.id);
      const memoryDir = path.join(buddyDir, "memory");

      const buddyExists = await fs.access(buddyDir).then(() => true).catch(() => false);
      const memoryExists = await fs.access(memoryDir).then(() => true).catch(() => false);

      expect(buddyExists).toBe(true);
      expect(memoryExists).toBe(true);
    });
  });

  describe("Memory entry save and list", () => {
    it("should save and list memory entries", async () => {
      const profile: BuddyProfile = {
        id: "mem-test",
        username: "memtest",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const entry: MemoryEntry = {
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 123,
        prTitle: "Fix bug",
        content: "Review summary here",
        keyLearnings: ["Learning 1", "Learning 2"],
        createdAt: new Date(),
      };

      await storage.addMemoryEntry(entry);
      const entries = await storage.listMemoryEntries(profile.id);

      expect(entries).toHaveLength(1);
      expect(entries[0].org).toBe(entry.org);
      expect(entries[0].repo).toBe(entry.repo);
      expect(entries[0].prNumber).toBe(entry.prNumber);
      expect(entries[0].prTitle).toBe(entry.prTitle);
      expect(entries[0].content).toBe(entry.content);
      expect(entries[0].keyLearnings).toEqual(entry.keyLearnings);
    });

    it("should list multiple memory entries sorted by date", async () => {
      const profile: BuddyProfile = {
        id: "multi-mem",
        username: "multimem",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const date1 = new Date("2024-01-01");
      const date2 = new Date("2024-01-02");
      const date3 = new Date("2024-01-03");

      await storage.addMemoryEntry({
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 1,
        content: "First",
        keyLearnings: [],
        createdAt: date2,
      });

      await storage.addMemoryEntry({
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 2,
        content: "Second",
        keyLearnings: [],
        createdAt: date1,
      });

      await storage.addMemoryEntry({
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 3,
        content: "Third",
        keyLearnings: [],
        createdAt: date3,
      });

      const entries = await storage.listMemoryEntries(profile.id);

      expect(entries).toHaveLength(3);
      expect(entries[0].prNumber).toBe(3);
      expect(entries[1].prNumber).toBe(1);
      expect(entries[2].prNumber).toBe(2);
    });

    it("should update MEMORY.md when adding memory entry", async () => {
      const profile: BuddyProfile = {
        id: "mem-update",
        username: "memupdate",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      await storage.addMemoryEntry({
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 100,
        prTitle: "Test PR",
        content: "Test content",
        keyLearnings: ["Key learning 1", "Key learning 2"],
        createdAt: new Date(),
      });

      const updated = await storage.readProfile(profile.id);
      expect(updated?.memory).toContain("Memory Index");
      expect(updated?.memory).toContain("Key Patterns");
      expect(updated?.memory).toContain("Key learning 1");
      expect(updated?.memory).toContain("Key learning 2");
    });
  });

  describe("Buddy listing", () => {
    it("should list all buddies", async () => {
      const profile1: BuddyProfile = {
        id: "buddy-1",
        username: "buddyone",
        soul: "# Soul 1",
        user: "# User 1",
        memory: "# Memory 1",
        sourceRepos: ["owner/repo1"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const profile2: BuddyProfile = {
        id: "buddy-2",
        username: "buddytwo",
        soul: "# Soul 2",
        user: "# User 2",
        memory: "# Memory 2",
        sourceRepos: ["owner/repo2"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile1.id, profile1);
      await storage.writeProfile(profile2.id, profile2);

      const buddies = await storage.listBuddies();

      expect(buddies).toHaveLength(2);
      expect(buddies.map((b) => b.id)).toContain("buddy-1");
      expect(buddies.map((b) => b.id)).toContain("buddy-2");
      expect(buddies.find((b) => b.id === "buddy-1")?.username).toBe("buddyone");
      expect(buddies.find((b) => b.id === "buddy-2")?.username).toBe("buddytwo");
    });

    it("should return empty array when no buddies exist", async () => {
      const buddies = await storage.listBuddies();
      expect(buddies).toEqual([]);
    });

    it("should include source repos in buddy summary", async () => {
      const profile: BuddyProfile = {
        id: "buddy-repos",
        username: "buddyrepos",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: ["owner/repo1", "owner/repo2", "other/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const buddies = await storage.listBuddies();
      const buddy = buddies.find((b) => b.id === "buddy-repos");

      expect(buddy?.sourceRepos).toEqual(["owner/repo1", "owner/repo2", "other/repo"]);
    });
  });

  describe("Profile versioning", () => {
    it("should create backup when saving profile", async () => {
      const profile: BuddyProfile = {
        id: "version-test",
        username: "versiontest",
        soul: "# Soul v1",
        user: "# User v1",
        memory: "# Memory v1",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const soulPath = path.join(TEST_DIR, "buddy", profile.id, "SOUL.md");
      const originalContent = await fs.readFile(soulPath, "utf-8");

      profile.soul = "# Soul v2 - updated";
      await storage.writeProfile(profile.id, profile);

      const updatedContent = await fs.readFile(soulPath, "utf-8");

      expect(updatedContent).toContain("v2 - updated");
      expect(updatedContent).not.toBe(originalContent);
    });

    it("should maintain max 5 backup versions", async () => {
      const profile: BuddyProfile = {
        id: "backup-test",
        username: "backuptest",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const buddyDir = path.join(TEST_DIR, "buddy", profile.id);

      for (let i = 0; i < 10; i++) {
        profile.soul = `# Soul v${i}`;
        await storage.writeProfile(profile.id, profile);
      }

      const files = await fs.readdir(buddyDir);
      const backupFiles = files.filter((f) => f.includes(".backup."));

      expect(backupFiles.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Search buddies", () => {
    beforeEach(async () => {
      const profiles: BuddyProfile[] = [
        {
          id: "alice",
          username: "alice-dev",
          soul: "# Soul",
          user: "# User",
          memory: "# Memory",
          sourceRepos: ["acme/corp", "acme/web"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "bob",
          username: "bob-coder",
          soul: "# Soul",
          user: "# User",
          memory: "# Memory",
          sourceRepos: ["startup/app"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "charlie",
          username: "charlie-eng",
          soul: "# Soul",
          user: "# User",
          memory: "# Memory",
          sourceRepos: ["acme/mobile"],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      for (const profile of profiles) {
        await storage.writeProfile(profile.id, profile);
      }
    });

    it("should search buddies by username", async () => {
      const results = await storage.searchBuddies("alice");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("alice");
    });

    it("should search buddies by source repo", async () => {
      const results = await storage.searchBuddies("acme");
      expect(results).toHaveLength(2);
      expect(results.map((r) => r.id)).toContain("alice");
      expect(results.map((r) => r.id)).toContain("charlie");
    });

    it("should return empty array for no matches", async () => {
      const results = await storage.searchBuddies("nonexistent");
      expect(results).toEqual([]);
    });

    it("should be case insensitive", async () => {
      const results = await storage.searchBuddies("ALICE");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("alice");
    });
  });

  describe("Export/Import", () => {
    it("should export profile as JSON", async () => {
      const profile: BuddyProfile = {
        id: "export-test",
        username: "exporttest",
        soul: "# Export Soul",
        user: "# Export User",
        memory: "# Export Memory",
        sourceRepos: ["owner/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      const exported = await storage.exportProfile(profile.id);

      const data = JSON.parse(exported);
      expect(data.id).toBe(profile.id);
      expect(data.username).toBe(profile.username);
      expect(data.soul).toBe(profile.soul);
      expect(data.user).toBe(profile.user);
      expect(data.memory).toBe(profile.memory);
      expect(data.sourceRepos).toEqual(profile.sourceRepos);
      expect(data.version).toBe("1.0");
      expect(data.exportedAt).toBeDefined();
    });

    it("should import profile from JSON", async () => {
      const json = JSON.stringify({
        id: "import-test",
        username: "importtest",
        soul: "# Import Soul",
        user: "# Import User",
        memory: "# Import Memory",
        sourceRepos: ["import/repo"],
        version: "1.0",
        exportedAt: new Date().toISOString(),
      });

      const newId = await storage.importProfile(json);
      const imported = await storage.readProfile(newId);

      expect(imported).toBeDefined();
      expect(imported?.id).toBe("import-test");
      expect(imported?.username).toBe("importtest");
      expect(imported?.soul).toBe("# Import Soul");
    });

    it("should import with custom ID", async () => {
      const json = JSON.stringify({
        id: "original-id",
        username: "original",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        version: "1.0",
        exportedAt: new Date().toISOString(),
      });

      const newId = await storage.importProfile(json, "custom-id");
      expect(newId).toBe("custom-id");

      const imported = await storage.readProfile(newId);
      expect(imported?.id).toBe("custom-id");
    });

    it("should throw error for invalid import data", async () => {
      const invalidJson = JSON.stringify({
        id: "invalid",
        username: "invalid",
        soul: "# Soul",
      });

      await expect(storage.importProfile(invalidJson)).rejects.toThrow("Invalid buddy export");
    });
  });

  describe("Metadata tracking", () => {
    it("should create metadata.json with default reviewCount on first save", async () => {
      const profile: BuddyProfile = {
        id: "meta-test",
        username: "metabuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: ["owner/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      const loaded = await storage.readProfile(profile.id);

      expect(loaded).toBeDefined();
      expect(loaded!.reviewCount).toBe(0);
      expect(loaded!.lastReviewAt).toBeUndefined();
    });

    it("should increment reviewCount correctly", async () => {
      const profile: BuddyProfile = {
        id: "increment-test",
        username: "incrementbuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      await storage.incrementReviewCount(profile.id);
      await storage.incrementReviewCount(profile.id);
      await storage.incrementReviewCount(profile.id);

      const loaded = await storage.readProfile(profile.id);
      expect(loaded!.reviewCount).toBe(3);
    });

    it("should update lastReviewAt on increment", async () => {
      const profile: BuddyProfile = {
        id: "lastreview-test",
        username: "lastreviewbuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      const before = Date.now();
      await storage.incrementReviewCount(profile.id);
      const after = Date.now();

      const loaded = await storage.readProfile(profile.id);
      expect(loaded!.lastReviewAt).toBeDefined();
      expect(loaded!.lastReviewAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(loaded!.lastReviewAt!.getTime()).toBeLessThanOrEqual(after);
    });

    it("should persist reviewCount and lastReviewAt through save/load roundtrip", async () => {
      const profile: BuddyProfile = {
        id: "roundtrip-test",
        username: "roundtripbuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: ["owner/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
        reviewCount: 5,
        lastReviewAt: new Date("2026-04-19T12:00:00Z"),
      };

      await storage.writeProfile(profile.id, profile);
      const loaded = await storage.readProfile(profile.id);

      expect(loaded!.reviewCount).toBe(5);
      expect(loaded!.lastReviewAt).toEqual(new Date("2026-04-19T12:00:00Z"));
    });

    it("should include reviewCount in listBuddies totalReviews", async () => {
      const profile: BuddyProfile = {
        id: "list-test",
        username: "listbuddy",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      await storage.incrementReviewCount(profile.id);
      await storage.incrementReviewCount(profile.id);

      const buddies = await storage.listBuddies();
      const buddy = buddies.find((b) => b.id === "list-test");
      expect(buddy).toBeDefined();
      expect(buddy!.totalReviews).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should create buddy with special characters in ID", async () => {
      const specialId = "buddy.with_special.chars-123";
      const profile: BuddyProfile = {
        id: specialId,
        username: "specialuser",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: ["owner/repo"],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);
      const loaded = await storage.readProfile(specialId);

      expect(loaded).toBeDefined();
      expect(loaded!.id).toBe(specialId);
      expect(loaded!.username).toBe("specialuser");
      expect(loaded!.sourceRepos).toEqual(["owner/repo"]);
    });

    it("should reject buddy IDs with path traversal characters", async () => {
      const profile: BuddyProfile = {
        id: "../../etc/passwd",
        username: "hacker",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(storage.writeProfile(profile.id, profile)).rejects.toThrow("Invalid buddy ID");
      await expect(storage.readProfile("../../../tmp")).rejects.toThrow("Invalid buddy ID");
    });

    it("should reject buddy IDs with slashes", async () => {
      const profile: BuddyProfile = {
        id: "buddy/with/slashes",
        username: "test",
        soul: "# Soul",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await expect(storage.writeProfile(profile.id, profile)).rejects.toThrow("Invalid buddy ID");
    });

    it("should preserve existing fields when updating only some fields", async () => {
      const originalProfile: BuddyProfile = {
        id: "update-preserve-test",
        username: "original-user",
        soul: "# Original Soul\n\nDeep philosophy",
        user: "# Original User\n\nExpert in TypeScript",
        memory: "# Original Memory\n\nMany entries",
        sourceRepos: ["owner/repo1", "owner/repo2"],
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-01"),
        reviewCount: 10,
      };

      await storage.writeProfile(originalProfile.id, originalProfile);

      const updatedProfile: BuddyProfile = {
        ...originalProfile,
        username: "new-username",
        sourceRepos: ["owner/repo3"],
        updatedAt: new Date("2026-02-01"),
      };

      await storage.writeProfile(updatedProfile.id, updatedProfile);
      const loaded = await storage.readProfile(updatedProfile.id);

      expect(loaded!.username).toBe("new-username");
      expect(loaded!.sourceRepos).toEqual(["owner/repo3"]);
      expect(loaded!.soul).toBe("# Original Soul\n\nDeep philosophy");
      expect(loaded!.user).toBe("# Original User\n\nExpert in TypeScript");
      expect(loaded!.memory).toBe("# Original Memory\n\nMany entries");
      expect(loaded!.reviewCount).toBe(10);
    });

    it("should remove all associated files when deleting a buddy", async () => {
      const profile: BuddyProfile = {
        id: "delete-files-test",
        username: "deletefiles",
        soul: "# Soul v1",
        user: "# User",
        memory: "# Memory",
        sourceRepos: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storage.writeProfile(profile.id, profile);

      await storage.addMemoryEntry({
        buddyId: profile.id,
        org: "owner",
        repo: "repo",
        prNumber: 1,
        content: "Review content",
        keyLearnings: ["Learning 1"],
        createdAt: new Date(),
      });

      profile.soul = "# Soul v2";
      await storage.writeProfile(profile.id, profile);
      profile.soul = "# Soul v3";
      await storage.writeProfile(profile.id, profile);

      const buddyDir = path.join(TEST_DIR, "buddy", profile.id);
      const existsBefore = await fs.access(buddyDir).then(() => true).catch(() => false);
      expect(existsBefore).toBe(true);

      await storage.deleteBuddy(profile.id);

      const existsAfter = await fs.access(buddyDir).then(() => true).catch(() => false);
      expect(existsAfter).toBe(false);
      expect(await storage.readProfile(profile.id)).toBeNull();
    });
  });

  describe("init", () => {
    it("should create buddy directory structure", async () => {
      const freshDir = path.join(os.tmpdir(), `agent-buddy-init-test-${Date.now()}`);
      const freshStorage = new BuddyFileSystemStorage(freshDir);
      try {
        const buddyDir = path.join(freshDir, "buddy");
        const existsBefore = await fs.access(buddyDir).then(() => true).catch(() => false);
        expect(existsBefore).toBe(false);

        await freshStorage.init();

        const existsAfter = await fs.access(buddyDir).then(() => true).catch(() => false);
        expect(existsAfter).toBe(true);
      } finally {
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });

    it("should be idempotent (safe to call multiple times)", async () => {
      const freshDir = path.join(os.tmpdir(), `agent-buddy-init-idem-${Date.now()}`);
      const freshStorage = new BuddyFileSystemStorage(freshDir);
      try {
        await freshStorage.init();
        await freshStorage.init();
        await freshStorage.init();

        const buddyDir = path.join(freshDir, "buddy");
        const exists = await fs.access(buddyDir).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      } finally {
        await fs.rm(freshDir, { recursive: true, force: true });
      }
    });

    it("should handle missing parent directory", async () => {
      const baseName = `agent-buddy-init-nested-${Date.now()}`;
      const freshDir = path.join(os.tmpdir(), baseName, "deeply", "nested", "dir");
      const freshStorage = new BuddyFileSystemStorage(freshDir);
      try {
        const parentExists = await fs.access(freshDir).then(() => true).catch(() => false);
        expect(parentExists).toBe(false);

        await freshStorage.init();

        const buddyDir = path.join(freshDir, "buddy");
        const exists = await fs.access(buddyDir).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      } finally {
        await fs.rm(path.join(os.tmpdir(), baseName), { recursive: true, force: true });
      }
    });
  });
});
