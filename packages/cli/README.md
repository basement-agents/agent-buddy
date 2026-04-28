# @agent-buddy/cli

Commander.js CLI exposed as the `agent-buddy` binary. Manages buddies, repository configuration, and manual review runs.

Spec: [`docs/project-cli.md`](../../docs/project-cli.md)

## Commands

| Command | Purpose |
|---|---|
| `npm run -w @agent-buddy/cli build` | Compile to `dist/` |
| `npm run -w @agent-buddy/cli dev` | Watch mode (`tsc --watch`) |
| `npm run -w @agent-buddy/cli typecheck` | Type check without emit |

Binary entry: `dist/index.js` (`bin: agent-buddy`).

## Layering

May import from `@agent-buddy/core` and `@agent-buddy/server`. MUST NOT import from `@agent-buddy/dashboard`. Rationale and enforcement: [`docs/architecture/DEPENDENCY_RULES.md`](../../docs/architecture/DEPENDENCY_RULES.md).
