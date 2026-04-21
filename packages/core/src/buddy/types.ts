export type BuddyId = string;

export interface BuddyProfile {
  id: BuddyId;
  username: string;
  soul: string;
  user: string;
  memory: string;
  sourceRepos: string[];
  lastAnalyzedPr?: number;
  createdAt: Date;
  updatedAt: Date;
  reviewCount?: number;
  lastReviewAt?: Date;
}

export interface SoulProfile {
  reviewPhilosophy: string;
  priorities: string[];
  communicationStyle: string;
  petPeeves: string[];
  typicalSeverity: ReviewSeverity;
}

export interface UserProfile {
  username: string;
  expertiseAreas: string[];
  seniorityLevel: "junior" | "mid" | "senior" | "staff" | "principal";
  preferredTools: string[];
  stats: UserStats;
}

export interface UserStats {
  totalReviews: number;
  totalPRsReviewed: number;
  mostReviewedRepos: string[];
  averageCommentCount: number;
  approvalRate: number;
}

export interface MemoryEntry {
  buddyId: BuddyId;
  org: string;
  repo: string;
  prNumber: number;
  prTitle?: string;
  content: string;
  keyLearnings: string[];
  createdAt: Date;
}

export interface BuddySummary {
  id: BuddyId;
  username: string;
  sourceRepos: string[];
  totalReviews: number;
  lastUpdated: Date;
}

export interface BuddyStorage {
  readProfile(id: BuddyId): Promise<BuddyProfile | null>;
  writeProfile(id: BuddyId, profile: BuddyProfile): Promise<void>;
  listBuddies(): Promise<BuddySummary[]>;
  deleteBuddy(id: BuddyId): Promise<void>;
  addMemoryEntry(entry: MemoryEntry): Promise<void>;
  listMemoryEntries(buddyId: BuddyId): Promise<MemoryEntry[]>;
  rollbackProfile(id: BuddyId, version?: number): Promise<BuddyProfile>;
  listProfileVersions(id: BuddyId): Promise<Array<{ version: number; backedUpAt: string }>>;
  incrementReviewCount(id: BuddyId): Promise<void>;
}

export type ReviewSeverity = "info" | "suggestion" | "warning" | "error";

export interface BuddyExport {
  id: string;
  username: string;
  soul: string;
  user: string;
  memory: string;
  sourceRepos: string[];
  version: string;
  exportedAt: string;
}

export interface BuddyExportValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface BuddyExportValidationResult {
  valid: boolean;
  errors: BuddyExportValidationError[];
  versionWarning?: string;
}

function validateStringField(
  obj: Record<string, unknown>,
  field: string,
  nonEmpty: boolean
): BuddyExportValidationError | undefined {
  const value = obj[field];
  if (typeof value !== "string") {
    return { field, message: `${field} must be a string`, value: typeof value };
  }
  if (nonEmpty && value.trim() === "") {
    return { field, message: `${field} must be a non-empty string`, value };
  }
}

export function validateBuddyExport(data: unknown): BuddyExportValidationResult {
  const errors: BuddyExportValidationError[] = [];
  let versionWarning: string | undefined;

  if (!data || typeof data !== "object") {
    return {
      valid: false,
      errors: [{ field: "root", message: "Invalid JSON: expected an object" }],
    };
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields exist
  const requiredFields: Array<keyof BuddyExport> = ["id", "username", "soul", "user", "memory", "sourceRepos", "version", "exportedAt"];
  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === null || obj[field] === undefined) {
      errors.push({ field, message: `Missing required field: ${field}` });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Validate field types
  const stringFields = [
    { field: "id", nonEmpty: true },
    { field: "username", nonEmpty: true },
    { field: "soul", nonEmpty: false },
    { field: "user", nonEmpty: false },
    { field: "memory", nonEmpty: false },
    { field: "version", nonEmpty: true },
    { field: "exportedAt", nonEmpty: true },
  ] as const;

  for (const { field, nonEmpty } of stringFields) {
    const err = validateStringField(obj, field, nonEmpty);
    if (err) errors.push(err);
  }

  if (!Array.isArray(obj.sourceRepos)) {
    errors.push({ field: "sourceRepos", message: "sourceRepos must be an array", value: typeof obj.sourceRepos });
  } else {
    for (let i = 0; i < obj.sourceRepos.length; i++) {
      if (typeof obj.sourceRepos[i] !== "string") {
        errors.push({
          field: `sourceRepos[${i}]`,
          message: "sourceRepos must contain only strings",
          value: obj.sourceRepos[i],
        });
      }
    }
  }

  if (typeof obj.exportedAt === "string" && obj.exportedAt.trim() !== "") {
    const date = new Date(obj.exportedAt);
    if (isNaN(date.getTime())) {
      errors.push({ field: "exportedAt", message: "exportedAt must be a valid ISO 8601 date string", value: obj.exportedAt });
    }
  }

  // Check version compatibility
  if (typeof obj.version === "string" && obj.version !== "1.0") {
    versionWarning = `Export version ${obj.version} differs from current format version 1.0. Import may not work correctly.`;
  }

  return {
    valid: errors.length === 0,
    errors,
    versionWarning,
  };
}
