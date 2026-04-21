import { BuddyFileSystemStorage } from "@agent-buddy/core";

export interface VersionBackup {
  version: number;
  backedUpAt: string;
}

export async function fetchBuddyVersions(id: string): Promise<VersionBackup[]> {
  const storage = new BuddyFileSystemStorage();
  const versions = await storage.listProfileVersions(id);
  return versions.sort((a: VersionBackup, b: VersionBackup) => b.version - a.version);
}
