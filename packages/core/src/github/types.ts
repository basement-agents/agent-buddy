export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  author: GitHubUser;
  base: GitHubRef;
  head: GitHubRef;
  files: PRFile[];
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatarUrl: string;
  url: string;
}

export interface GitHubRef {
  label: string;
  ref: string;
  sha: string;
  repo: {
    owner: GitHubUser;
    name: string;
    fullName: string;
  };
}

export interface PRFile {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
  previousFilename?: string;
}

export interface ReviewComment {
  id: number;
  author: GitHubUser;
  body: string;
  path: string;
  line?: number;
  startLine?: number;
  side: "LEFT" | "RIGHT";
  createdAt: string;
  diffHunk: string;
  pullRequestUrl: string;
  inReplyToId?: number;
}

export interface PRReview {
  id: number;
  author: GitHubUser;
  body: string;
  state: "approved" | "changes_requested" | "commented" | "dismissed" | "pending";
  submittedAt: string;
  comments: ReviewComment[];
}

export interface Repository {
  id: number;
  owner: GitHubUser;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  defaultBranch: string;
  url: string;
  language: string | null;
  stargazersCount: number;
  forksCount: number;
}

export interface Contributor {
  login: string;
  id: number;
  avatarUrl: string;
  contributions: number;
  reviewCount?: number;
}

export interface WebhookEvent {
  action: string;
  type: "pull_request" | "issue_comment" | "pull_request_review";
  repository: Repository;
  sender: GitHubUser;
  pullRequest?: PullRequest;
  comment?: { id: number; body: string; author: GitHubUser };
  review?: PRReview;
}

export interface CreateReviewRequest {
  body: string;
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  comments: CreateReviewComment[];
}

export interface CreateReviewComment {
  path: string;
  line?: number;
  startLine?: number;
  side?: "LEFT" | "RIGHT";
  body: string;
  inReplyTo?: number;
}
