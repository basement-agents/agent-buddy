# Dependency Rules

The workspace forms a one-way dependency graph. `core` is the only leaf; UI and server layers depend on it, never the other way around.

## Allowed direction

```
@agent-buddy/core    ← leaf, depended on by everyone
@agent-buddy/server  ← may import core
@agent-buddy/cli     ← may import core, server
@agent-buddy/dashboard ← may import core
```

`cli → server` is permitted because the CLI can run review jobs in-process via the server's library API. If that ever stops being true, tighten the rule in `scripts/lint-architecture.mjs` and update this file in the same commit.

## Forbidden

- `core` → any other `@agent-buddy/*`
- `server` → `cli` | `dashboard`
- `dashboard` → `cli` | `server`

## Enforcement

`scripts/lint-architecture.mjs` runs in CI (`.github/workflows/ci.yml`) and rejects forbidden imports by regex over `packages/*/src/**/*.{ts,tsx}`. Adding a new package requires extending the `RULES` array in that script and this document together.

Decision context for the layering choices lives in [`DECISIONS.md`](DECISIONS.md).
