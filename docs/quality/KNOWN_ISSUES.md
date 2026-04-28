# Known Issues

A running log of repeatable agent or contributor mistakes. One entry per pattern, not per incident. Resolved entries stay (with a `Resolved:` line) so the next agent does not reintroduce them.

## KI-001: dashboard import path casing

Dashboard files have hit `Layout` vs `layout` casing mismatches that pass on macOS (case-insensitive FS) and fail on Linux CI. Always use kebab-case file and directory names; verify imports match on-disk casing exactly.

## KI-002: vitest config TS1259 (esModuleInterop)

The root `vitest.config.ts` does not extend `tsconfig.base.json` and therefore lacks `esModuleInterop`. Use `import * as path from 'node:path'` instead of the default-import form.

## KI-003: project-dashboard.md referenced a missing domain doc

`docs/project-dashboard.md` linked to `research/internal/domain-dashboard.md` which did not exist.

**Resolved 2026-04-28:** stub created at `research/internal/domain-dashboard.md`. Populate as the route structure stabilizes. `scripts/check-doc-links.mjs` now guards against this class of drift.

## How to use this file

When an agent makes the same mistake twice, file a new entry. When the mistake can be enforced mechanically, lift it into `scripts/lint-architecture.mjs` (or a new check) and link the entry to the rule. Once the rule is enforced and CI catches it, the entry can be marked `Resolved:` with the commit hash and stay as historical context.
