import pc from "picocolors";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { loadConfig, getErrorMessage, createLLMProvider } from "@agent-buddy/core";
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

      const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      if (ghToken) {
        results.push({ name: "GITHUB_TOKEN", status: "pass", message: "Set" });
      } else {
        results.push({ name: "GITHUB_TOKEN", status: "fail", message: "Not set. Set GITHUB_TOKEN or GH_TOKEN environment variable." });
      }

      let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
      try {
        config = await loadConfig();
        results.push({ name: "Config file", status: "pass", message: `Found (${config.repos.length} repos configured)` });
      } catch (err) {
        results.push({ name: "Config file", status: "fail", message: `Invalid: ${getErrorMessage(err)}` });
      }

      const providerName = config?.llm?.provider || "anthropic";
      const envKeyMap: Record<string, string[]> = {
        anthropic: ["ANTHROPIC_API_KEY"],
        openrouter: ["OPENROUTER_API_KEY"],
        openai: ["OPENAI_API_KEY"],
      };
      const providerEnvVars = envKeyMap[providerName] || [];
      const providerApiKey = config?.llm?.apiKey || providerEnvVars.map((v) => process.env[v]).find(Boolean);

      if (providerApiKey) {
        results.push({ name: `LLM Provider (${providerName})`, status: "pass", message: "API key configured" });
      } else {
        results.push({ name: `LLM Provider (${providerName})`, status: "fail", message: `No API key. Set ${providerEnvVars.join(" or ")} or configure in settings.` });
      }

      if (providerApiKey) {
        try {
          const llm = createLLMProvider(config?.llm);
          const start = Date.now();
          await llm.generate([{ role: "user", content: "ping" }], { maxTokens: 5 });
          const latency = Date.now() - start;
          results.push({ name: "LLM connectivity", status: "pass", message: `${providerName} responding (${latency}ms)` });
        } catch (err) {
          results.push({ name: "LLM connectivity", status: "fail", message: `${providerName}: ${getErrorMessage(err).replace(/sk-[a-zA-Z0-9-]+/g, "sk-...")}` });
        }
      }

      const baseDir = path.join(os.homedir(), ".agent-buddy");
      const buddyDir = path.join(baseDir, "buddy");
      try {
        await fs.access(buddyDir);
        const entries = await fs.readdir(buddyDir);
        results.push({ name: "Buddy directory", status: "pass", message: `Exists (${entries.length} buddies)` });
      } catch {
        results.push({ name: "Buddy directory", status: "warn", message: `Not found at ${buddyDir}. Run 'agent-buddy buddy analyze' to create one.` });
      }

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

      console.log();
      console.log(pc.bold(pc.cyan("agent-buddy doctor")));
      console.log(pc.dim("─".repeat(50)));

      let passed = 0;
      let warnings = 0;
      let failed = 0;

      for (const result of results) {
        const icon = result.status === "pass" ? pc.green("✓")
          : result.status === "warn" ? pc.yellow("○")
          : pc.red("✗");

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
