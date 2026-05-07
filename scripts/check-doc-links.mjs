#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IGNORE = new Set([
  'node_modules',
  'dist',
  '.turbo',
  '.git',
  '.omx',
  '.idea',
  '.omc',
  'coverage',
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORE.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (entry.endsWith('.md')) out.push(p);
  }
  return out;
}

const LINK = /\[[^\]]*?\]\(([^)\s]+)\)/g;
const broken = [];

for (const file of walk(repoRoot)) {
  const text = readFileSync(file, 'utf8');
  let inFence = false;
  let lineNo = 0;
  for (const line of text.split('\n')) {
    lineNo++;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const m of line.matchAll(LINK)) {
      let target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      target = target.split('#')[0].split('?')[0];
      if (!target) continue;
      const abs = resolve(dirname(file), target);
      if (!existsSync(abs)) {
        broken.push({ file: relative(repoRoot, file), line: lineNo, target });
      }
    }
  }
}

if (broken.length) {
  console.error(`Broken markdown links: ${broken.length}`);
  for (const b of broken) console.error(`  ${b.file}:${b.line} -> ${b.target}`);
  process.exit(1);
}
console.log('All markdown links resolve.');
