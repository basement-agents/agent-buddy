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

## ADR-007: Single npm package via tsup bundle

**Date:** 2026-05-08
**Status:** Accepted

`agent-buddy`는 외부에는 단일 npm 패키지로 노출하되 monorepo 구조는 유지한다. `packages/cli`를 tsup으로 번들해 `core`/`server` 코드를 인라인 포함하고, `scripts/bundle-dashboard.mjs`가 `vite build` 결과를 `packages/cli/dist/dashboard/`로 복사한다. 사용자는 `npm install -g agent-buddy` 한 번으로 cli + 서버 + 대시보드 정적 자산을 모두 받는다. `core`/`server`/`dashboard`는 `"private": true`로 발행되지 않는다.

대안 — 4개 패키지 별도 발행 또는 `agent-buddy` 메타 패키지 — 은 release surface와 버전 동기화 부담만 늘리고 사용자 가치는 동일하다.

## ADR-008: PID-file daemon lifecycle

**Date:** 2026-05-08
**Status:** Accepted

`agent-buddy start`는 `child_process.spawn(detached, unref)`로 자식을 띄우고 `~/.agent-buddy/runtime/agent-buddy.pid`(O_EXCL atomic create)에 PID를 기록한다. `agent-buddy stop`은 PID를 읽어 SIGTERM, 35초 polling 후 SIGKILL fallback. launchd / systemd / pm2 의존 없이 OS 독립적으로 동작한다. Windows daemon은 v1 보장 범위 밖이며 `--foreground` 사용을 권장한다.
