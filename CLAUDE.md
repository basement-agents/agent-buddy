# Agent Buddy

AI code review bot that learns reviewer personas from past PR reviews and performs both low-context (diff-based) and high-context (impact analysis) reviews.

## Repository Guidance

This file is the canonical source of repo-wide rules, structure, and policies.
Every agent and contributor MUST read it before performing any task here.

## Instructions

- Read `docs/project-*.md` first for the package you're working in — each contains Goal, Architecture, and Interfaces.
- Domain logic details → `research/internal/`. External references → `research/external/`.
- Package-specific setup lives in each package's `README.md`. Repo-wide rules live in this file.
- `AGENTS.md` is a symlink to this file; both filenames resolve to the same content.
- Update `CLAUDE.md` and relevant `docs/` in the same commit whenever structure or contracts change.
- Code and docs may be in Korean or English. Technical identifiers must use English.
- Do not guess; search the codebase or consult `research/` instead.
- Use `gh` CLI instead of browser workflows for GitHub operations.
- Commit when each logical unit of work is complete; never use `--no-verify`.
- Rules using **MUST / NEVER** are mandatory. Rules using *prefer / whenever possible* are guidance.

## Monorepo Structure

```
agent-buddy/
├── packages/
│   ├── core/          # Shared types, interfaces, utilities (private)
│   ├── cli/           # CLI tool (Commander.js) — published as `agent-buddy`
│   ├── server/        # API server (Hono) (private)
│   └── dashboard/     # Web UI (React + Vite + TanStack Router) (private)
├── docs/
│   ├── project-*.md       # package specs (Goal, Architecture, Interfaces)
│   ├── architecture/      # DEPENDENCY_RULES.md, DECISIONS.md (ADR)
│   └── quality/           # KNOWN_ISSUES.md
│   └── superpowers/       # specs/ + plans/ for ongoing work
├── research/
│   ├── internal/      # domain-*.md (domain contracts)
│   └── external/      # External references
├── scripts/           # check-doc-links.mjs, lint-architecture.mjs, bundle-dashboard.mjs
├── .github/workflows/ # ci.yml
├── turbo.json
├── tsconfig.base.json
└── package.json
```

Only `packages/cli` is publishable. `cli` is bundled with tsup so `core` and `server` are inlined into `dist/cli.js`. The dashboard build (`packages/dashboard/dist/`) is copied into `packages/cli/dist/dashboard/` by `scripts/bundle-dashboard.mjs` and shipped inside the published `agent-buddy` npm package.

## Daemon Lifecycle

- `agent-buddy start` spawns a detached child via `child_process.spawn`. PID and port files live in `~/.agent-buddy/runtime/`. Daemon stdout/stderr go to `~/.agent-buddy/logs/agent-buddy.log`.
- `agent-buddy stop` sends SIGTERM and waits up to 35s before SIGKILL. Server-side graceful shutdown waits up to 30s for running jobs.
- `agent-buddy start --foreground` skips the spawn and runs `serve()` in the current process — used for development. The deprecated `agent-buddy serve` is an alias for it.
- Tests can override `~/.agent-buddy/` with the `AGENT_BUDDY_HOME` env var.

## Buddy System

Buddies are AI personas learned from real code reviewers. Each buddy has three core files:

- **SOUL.md** — Review philosophy, priorities, communication style
- **USER.md** — Expertise areas, seniority, preferred tools
- **MEMORY.md** — Index of individual review memories

Storage: `~/.agent-buddy/buddy/[id]/`

## Code Standards

### Naming

- Files/directories: `kebab-case`
- Classes/Interfaces/Types: `PascalCase`
- Functions/Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Type Safety

- `any` prohibited in TypeScript
- Prefer explicit types over inference for public APIs

### Dashboard Conventions

Layout follows Toss FE Fundamentals colocation principle: route-scoped code lives under the route, and `components/common/` + `lib/` hold only shared code consumed by ≥2 routes.

```
packages/dashboard/src/
├── app/              # entry/routing (router.tsx, providers.tsx)
├── api/              # API boundary types
├── components/
│   ├── common/       # kebab-case files shared by ≥2 routes
│   ├── system/       # design system — lowercase dirs with index.tsx
│   └── layout/       # layout components (sidebar, header)
├── lib/              # utilities/hooks shared by ≥2 routes
└── pages/<route>/
    ├── <route>-page.tsx
    ├── _components/  # kebab-case files scoped to this route
    ├── _hooks/       # hooks scoped to this route
    └── _lib/         # utilities scoped to this route
```

Tests are co-located with their source (`foo.ts` + `foo.test.ts`).

## Testing

- Mock external API calls (GitHub API, LLM API).
- Use fixtures for stable test data.
- Integration tests under `__tests__/` directories.

## CI Baseline

```bash
node scripts/check-doc-links.mjs
node scripts/lint-architecture.mjs
npm run typecheck && npm run lint && npm run test
```

`.github/workflows/ci.yml` runs the same sequence on every PR. The two `scripts/*.mjs` checks gate doc drift and forbidden cross-package imports — see [`docs/architecture/DEPENDENCY_RULES.md`](docs/architecture/DEPENDENCY_RULES.md). New repeatable mistakes go in [`docs/quality/KNOWN_ISSUES.md`](docs/quality/KNOWN_ISSUES.md); cross-cutting choices in [`docs/architecture/DECISIONS.md`](docs/architecture/DECISIONS.md).
