# Known Issues

A running log of repeatable agent or contributor mistakes. One entry per pattern, not per incident. Resolved entries stay (with a `Resolved:` line) so the next agent does not reintroduce them.

## KI-001: dashboard import path casing

Dashboard files have hit `Layout` vs `layout` casing mismatches that pass on macOS (case-insensitive FS) and fail on Linux CI. Always use kebab-case file and directory names; verify imports match on-disk casing exactly.

## KI-002: vitest config TS1259 (esModuleInterop)

The root `vitest.config.ts` does not extend `tsconfig.base.json` and therefore lacks `esModuleInterop`. Use `import * as path from 'node:path'` instead of the default-import form.

## KI-003: project-dashboard.md referenced a missing domain doc

`docs/project-dashboard.md` linked to `research/internal/domain-dashboard.md` which did not exist.

**Resolved 2026-04-28:** stub created at `research/internal/domain-dashboard.md`. Populate as the route structure stabilizes. `scripts/check-doc-links.mjs` now guards against this class of drift.

## KI-004: runtime artifacts included in doc-link checks

OMX/Codex runtime state can write markdown copies under `.omx/`. Those files inherit links whose relative roots differ from the project docs, so scanning them creates false broken-link failures.

**Resolved 2026-05-04:** `scripts/check-doc-links.mjs` now ignores `.omx/` alongside other generated/runtime directories.

## KI-005: daemon log rotation 미구현

`~/.agent-buddy/logs/agent-buddy.log`는 `agent-buddy start` 자식 프로세스의 stdout/stderr를 append-only로 받아쓴다. 회전 (size 또는 time 기반)이 없어 장시간 운영 시 디스크 사용량이 단조 증가한다. 임시 대처: `agent-buddy stop && rm ~/.agent-buddy/logs/agent-buddy.log && agent-buddy start`. v1 범위 밖, 후속 작업.

## How to use this file

When an agent makes the same mistake twice, file a new entry. When the mistake can be enforced mechanically, lift it into `scripts/lint-architecture.mjs` (or a new check) and link the entry to the rule. Once the rule is enforced and CI catches it, the entry can be marked `Resolved:` with the commit hash and stay as historical context.
