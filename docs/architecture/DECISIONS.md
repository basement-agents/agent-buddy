# Architecture Decisions

A running log of cross-cutting design choices. Each entry is short. Append new entries; do not rewrite accepted ones — supersede with a new ADR instead.

## ADR-001: Hono for the API server

**Date:** 2025-04-27
**Status:** Accepted

Hono runs on Node, Bun, Cloudflare Workers, and Deno from one codebase. Combined with `@hono/zod-validator` it gives type-safe request validation that reuses the `zod` schemas already exported from `core`.

## ADR-002: oxlint + oxfmt + ultracite

**Date:** 2025-04-27
**Status:** Accepted

`oxlint` is the primary linter (Rust-based, fast). `oxfmt` is the formatter. `ultracite check` / `ultracite fix` runs an opinionated bundle on top. The combination is materially faster than ESLint + Prettier and is zero-config for most rules. When rules conflict, oxlint defaults win.

## ADR-003: vitest at the workspace root

**Date:** 2025-04-27
**Status:** Accepted

A root `vitest.config.ts` discovers tests across all packages so `npm test` runs the full suite from the repo root. Per-package `vitest.config.ts` files exist only for environment overrides (e.g., `jsdom` in `dashboard`).

## ADR-004: Turborepo + npm workspaces

**Date:** 2025-04-27
**Status:** Accepted

Turborepo handles task orchestration and caching across packages; npm workspaces handles install and symlinking. No migration to pnpm or yarn is planned.

## ADR-005: AGENTS.md is a symlink to CLAUDE.md

**Date:** 2026-04-28
**Status:** Accepted

Codex, Cursor, and Gemini look for `AGENTS.md`; Claude Code looks for `CLAUDE.md`. We keep one source of truth (`CLAUDE.md`) and expose it via a symlink so every tool resolves to the same content. If tool-specific guidance ever becomes necessary, split into `CLAUDE.md` plus a tool-specific overlay file; do not duplicate the entry-point.

## ADR-006: Mechanical doc-link and architecture checks

**Date:** 2026-04-28
**Status:** Accepted

`scripts/check-doc-links.mjs` rejects broken relative markdown links. `scripts/lint-architecture.mjs` rejects forbidden cross-package imports. Both run in CI alongside `typecheck`, `lint`, and `test`. Rationale: documents and dependency rules drift silently otherwise; we caught exactly that drift on 2026-04-28.
