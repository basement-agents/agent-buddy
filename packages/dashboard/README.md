# @agent-buddy/dashboard

React + Vite + TanStack Router web UI for buddies, repositories, review results, and settings.

Spec: [`docs/project-dashboard.md`](../../docs/project-dashboard.md). Layout convention is documented in the root [`CLAUDE.md`](../../CLAUDE.md) under "Dashboard Conventions".

## Commands

| Command | Purpose |
|---|---|
| `npm run -w @agent-buddy/dashboard dev` | Vite dev server |
| `npm run -w @agent-buddy/dashboard build` | Type check + production build |
| `npm run -w @agent-buddy/dashboard preview` | Preview the built bundle |
| `npm run -w @agent-buddy/dashboard typecheck` | Type check without emit |

## Layering

May import from `@agent-buddy/core`. MUST NOT import from `@agent-buddy/cli` or `@agent-buddy/server`. Enforced by [`scripts/lint-architecture.mjs`](../../scripts/lint-architecture.mjs).
