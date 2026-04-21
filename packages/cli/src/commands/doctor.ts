import pc from "picocolors";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { loadConfig, getErrorMessage } from "@agent-buddy/core";
import type { Command } from "commander";

interface CheckResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check agent-buddy installation for common issues")
    .action(async () => {
      const results: CheckResult[] = [];

      const envChecks = [
        { name: "GITHUB_TOKEN", envVars: ["GITHUB_TOKEN", "GH_TOKEN"] as const },
        { name: "ANTHROPIC_API_KEY", envVars: ["ANTHROPIC_API_KEY"] as const },
      ];

      for (const check of envChecks) {
        const value = check.envVars.map((v) => process.env[v]).find(Boolean);
        if (value) {
          results.push({ name: check.name, status: "pass", message: `Set (${value.slice(0, 8)}...)` });
        } else {
          results.push({ name: check.name, status: "fail", message: `Not set. Set ${check.envVars.join(" or ")} environment variable.` });
        }
      }

      // Check config file
      let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
      try {
        config = await loadConfig();
        results.push({ name: "Config file", status: "pass", message: `Found (${config.repos.length} repos configured)` });
      } catch (err) {
        results.push({ name: "Config file", status: "fail", message: `Invalid: ${getErrorMessage(err)}` });
      }

      // Check buddy directory structure
      const baseDir = path.join(os.homedir(), ".agent-buddy");
      const buddyDir = path.join(baseDir, "buddy");
      try {
        await fs.access(buddyDir);
        const entries = await fs.readdir(buddyDir);
        results.push({ name: "Buddy directory", status: "pass", message: `Exists (${entries.length} buddies)` });
      } catch {
        results.push({ name: "Buddy directory", status: "warn", message: `Not found at ${buddyDir}. Run 'agent-buddy buddy analyze' to create one.` });
      }

      // Check server connectivity
      try {
        const port = config?.server?.port || 3000;
        const host = config?.server?.host || "localhost";
        const res = await fetch(`http://${host}:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          results.push({ name: "Server connectivity", status: "pass", message: `Server responding at port ${port}` });
        } else {
          results.push({ name: "Server connectivity", status: "warn", message: `Server returned HTTP ${res.status}` });
        }
      } catch {
        results.push({ name: "Server connectivity", status: "warn", message: "Server not running. Start with 'agent-buddy serve'." });
      }

      // Print results
      console.log();
      console.log(pc.bold(pc.cyan("agent-buddy doctor")));
      console.log(pc.dim("\u2500".repeat(50)));

      let passed = 0;
      let warnings = 0;
      let failed = 0;

      for (const result of results) {
        const icon = result.status === "pass" ? pc.green("\u2713")
          : result.status === "warn" ? pc.yellow("\u25CB")
          : pc.red("\u2717");

        const label = result.status === "pass" ? pc.green(result.name)
          : result.status === "warn" ? pc.yellow(result.name)
          : pc.red(result.name);

        console.log(`  ${icon} ${label}: ${result.message}`);

        if (result.status === "pass") passed++;
        else if (result.status === "warn") warnings++;
        else failed++;
      }

      console.log();
      if (failed > 0) {
        console.log(pc.red(`  ${failed} issue(s) found. Fix the errors above.`));
      } else if (warnings > 0) {
        console.log(pc.yellow(`  ${warnings} warning(s). Everything looks good, but consider addressing the warnings.`));
      } else {
        console.log(pc.green(`  All ${passed} checks passed!`));
      }
      console.log();
    });
}
