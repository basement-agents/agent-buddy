# Agent Buddy

AI code review bot that learns reviewer personas from past PR reviews and performs both low-context (diff-based) and high-context (impact analysis) reviews.

## Repository Guidance

This file is the canonical source of repo-wide rules, structure, and policies.
Every agent and contributor MUST read it before performing any task here.

## Instructions

- Read `docs/project-*.md` first for the package you're working in — each contains Goal, Architecture, and Interfaces.
- Domain logic details → `research/internal/`. External references → `research/external/`.
- Package-specific setup lives in each package's `README.md`. Repo-wide rules live in this file.
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
│   ├── core/          # Shared types, interfaces, utilities
│   ├── cli/           # CLI tool (Commander.js)
│   ├── server/        # API server (Hono)
│   └── dashboard/     # Web UI (React + Vite + TanStack Router)
├── docs/              # project-*.md (package specs)
├── research/
│   ├── internal/      # domain-*.md (domain contracts)
│   └── external/      # External references
├── turbo.json
├── tsconfig.base.json
└── package.json
```

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
npm run typecheck && npm run lint && npm run test
```
