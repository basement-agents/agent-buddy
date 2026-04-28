#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_EXT = ['.ts', '.tsx'];

const RULES = [
  {
    name: 'core is a leaf',
    root: join(repoRoot, 'packages/core/src'),
    forbidden: /@agent-buddy\/(cli|server|dashboard)/g,
  },
  {
    name: 'dashboard does not import cli/server',
    root: join(repoRoot, 'packages/dashboard/src'),
    forbidden: /@agent-buddy\/(cli|server)/g,
  },
  {
    name: 'server does not import cli/dashboard',
    root: join(repoRoot, 'packages/server/src'),
    forbidden: /@agent-buddy\/(cli|dashboard)/g,
  },
];

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

function walk(dir, out = []) {
  if (!exists(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (SRC_EXT.some((e) => entry.endsWith(e))) out.push(p);
  }
  return out;
}

const violations = [];
for (const rule of RULES) {
  for (const file of walk(rule.root)) {
    const text = readFileSync(file, 'utf8');
    const matches = text.match(rule.forbidden);
    if (matches) {
      violations.push({
        rule: rule.name,
        file: relative(repoRoot, file),
        offending: [...new Set(matches)].join(', '),
      });
    }
  }
}

if (violations.length) {
  console.error(`Architecture violations: ${violations.length}`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file} -> ${v.offending}`);
  }
  process.exit(1);
}
console.log('Architecture rules pass.');
