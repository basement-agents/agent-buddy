const REPO_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface ApiErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

export function validateRepoId(owner: string, repo: string): ApiErrorResponse | null {
  if (!REPO_ID_RE.test(owner)) {
    return validationError("Invalid owner format");
  }
  if (!REPO_ID_RE.test(repo)) {
    return validationError("Invalid repo format");
  }
  return null;
}

export function apiError(
  message: string,
  details?: string
): ApiErrorResponse {
  const result: ApiErrorResponse = { error: message };
  if (details) result.details = details;
  return result;
}

export function notFound(resource: string, id: string): ApiErrorResponse {
  return {
    error: "Not found",
    message: `${resource} '${id}' does not exist`,
  };
}

export function validationError(details: string): ApiErrorResponse {
  return {
    error: "Validation error",
    message: "Request validation failed",
    details,
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePaginationParams(
  pageStr: string | undefined,
  limitStr: string | undefined
): { page: number; limit: number } | { error: ApiErrorResponse } {
  const page = pageStr === undefined ? 1 : parseInt(pageStr, 10);
  const limit = limitStr === undefined ? 20 : parseInt(limitStr, 10);

  if (isNaN(page) || page < 1) {
    return { error: validationError("page must be a positive integer") };
  }
  if (isNaN(limit) || limit < 1) {
    return { error: validationError("limit must be a positive integer") };
  }
  if (limit > 100) {
    return { error: validationError("limit must be at most 100") };
  }

  return { page, limit };
}

export function paginate<T>(items: T[], page: number, limit: number): PaginatedResponse<T> {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const data = items.slice(start, start + limit);
  return { data, page, limit, total, totalPages };
}
