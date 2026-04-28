# @agent-buddy/server

Hono-based API server. Receives GitHub webhooks, queues review jobs, and streams results over SSE.

Spec: [`docs/project-server.md`](../../docs/project-server.md)

## Commands

| Command | Purpose |
|---|---|
| `npm run -w @agent-buddy/server build` | Compile to `dist/` |
| `npm run -w @agent-buddy/server dev` | `tsx watch src/index.ts` |
| `npm run -w @agent-buddy/server typecheck` | Type check without emit |

## Layering

May import from `@agent-buddy/core`. MUST NOT import from `@agent-buddy/cli` or `@agent-buddy/dashboard`. Enforced by [`scripts/lint-architecture.mjs`](../../scripts/lint-architecture.mjs).
