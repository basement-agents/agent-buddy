# @agent-buddy/core

Shared types, interfaces, and utilities consumed by `cli`, `server`, and `dashboard`.

Spec: [`docs/project-core.md`](../../docs/project-core.md)

## Commands

| Command | Purpose |
|---|---|
| `npm run -w @agent-buddy/core build` | Compile to `dist/` |
| `npm run -w @agent-buddy/core typecheck` | Type check without emit |
| `npm run -w @agent-buddy/core clean` | Remove `dist/` |

Tests live next to source as `*.test.ts`. Run from the repo root with `npm test`.

## Layering

`core` is the workspace leaf. It MUST NOT import from any other `@agent-buddy/*` package. Enforced by [`scripts/lint-architecture.mjs`](../../scripts/lint-architecture.mjs); see [`docs/architecture/DEPENDENCY_RULES.md`](../../docs/architecture/DEPENDENCY_RULES.md).
