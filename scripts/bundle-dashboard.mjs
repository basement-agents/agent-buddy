#!/usr/bin/env node
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dashboardDir = resolve(repoRoot, "packages/dashboard");
const cliDir = resolve(repoRoot, "packages/cli");
const dashboardDist = resolve(dashboardDir, "dist");
const targetDir = resolve(cliDir, "dist/dashboard");

if (!existsSync(dashboardDist)) {
  console.log("[bundle-dashboard] running vite build...");
  execSync("npm run build", { cwd: dashboardDir, stdio: "inherit" });
}

mkdirSync(resolve(cliDir, "dist"), { recursive: true });
if (existsSync(targetDir)) rmSync(targetDir, { recursive: true });
cpSync(dashboardDist, targetDir, { recursive: true });
console.log(`[bundle-dashboard] copied ${dashboardDist} -> ${targetDir}`);
