#!/usr/bin/env node

import { Command } from "commander";
import pc from "picocolors";
import ora from "ora";
import { confirm, input, password } from "@inquirer/prompts";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

import {
  BuddyFileSystemStorage,
  loadConfig,
  saveConfig,
  resetConfig,
  addRepo,
  removeRepo,
  listRepos,
  GitHubClient,
  AnalysisPipeline,
  ReviewEngine,
  createLLMProvider,
  compareBuddies,
  Logger,
  getErrorMessage,
  sleep,
  RepoConfig,
  BuddySummary,
} from "@agent-buddy/core";

import { fetchReviewHistory, readPersistedJobs } from "./commands/history.js";
import { fetchBuddyVersions } from "./commands/buddy-handlers.js";
import { getApiBaseUrl, formatStatus } from "./lib/helpers.js";

const BASE_DIR = path.join(os.homedir(), ".agent-buddy");
const logger = new Logger("cli");

function getGitHubToken(override?: string): string {
  return override || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
}

function getAnthropicApiKey(override?: string): string {
  return override || process.env.ANTHROPIC_API_KEY || "";
}

function requireEnv(token: string, name: string): string {
  if (!token) { console.error(pc.red(`${name} not set`)); process.exit(1); }
  return token;
}

type JobStatus = "running" | "queued" | "completed" | "failed";

function countByStatus<T extends { status: string }>(items: T[]): Record<JobStatus, number> {
  const counts: Record<JobStatus, number> = { running: 0, queued: 0, completed: 0, failed: 0 };
  for (const item of items) {
    if (item.status in counts) counts[item.status as JobStatus]++;
  }
  return counts;
}

function parseRepoId(repoStr: string): [owner: string, repo: string] | null {
  const parts = repoStr.trim().split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts.map((part) => part.trim());
  if (!owner || !repo) return null;
  return [owner, repo];
}

function parseRepoArg(repoArg: string): [owner: string, repo: string] {
  const result = parseRepoId(repoArg);
  if (!result) {
    console.error(pc.red("Invalid format. Use owner/repo"));
    process.exit(1);
  }
  return result;
}

function showNextSteps() {
  console.log(pc.dim("  Next steps:"));
  console.log(pc.dim("    1. Add a repo:    ") + pc.cyan("agent-buddy repo add <owner/repo>"));
  console.log(pc.dim("    2. Create a buddy: ") + pc.cyan("agent-buddy buddy analyze <username> --repo <owner/repo>"));
  console.log(pc.dim("    3. Start server:   ") + pc.cyan("agent-buddy serve"));
}

const program = new Command();

program
  .name("agent-buddy")
  .description("AI code review bot that learns reviewer personas")
  .version("0.1.0");

const { registerDoctorCommand } = await import("./commands/doctor.js");
registerDoctorCommand(program);

program
  .command("completion")
  .description("Generate shell completion script")
  .option("--shell <shell>", "Shell type (bash or zsh)", process.env.SHELL?.includes("zsh") ? "zsh" : "bash")
  .action((opts: { shell: string }) => {
    const script = generateCompletionScript(opts.shell);
    console.log(script);
  });

function generateCompletionScript(shell: string): string {
  if (shell === "zsh") {
    return `#compdef agent-buddy
_agent-buddy() {
  local -a commands
  commands=(
    'init:Initialize agent-buddy configuration'
    'status:Show agent-buddy status'
    'config:Manage configuration'
    'repo:Manage repositories'
    'buddy:Manage buddy profiles'
    'serve:Start the webhook server'
    'review:Perform a manual code review'
    'completion:Generate shell completion script'
  )

  local -a repo_commands
  repo_commands=(
    'add:Add a repository to monitor'
    'list:List configured repositories'
    'remove:Remove a repository'
    'assign:Assign a buddy to a repository'
  )

  local -a buddy_commands
  buddy_commands=(
    'analyze:Create a buddy from a reviewer history'
    'list:List all buddies'
    'show:Show full buddy profile'
    'update:Update buddy with new review data'
    'delete:Delete a buddy'
    'export:Export a buddy profile to JSON'
    'import:Import a buddy profile from JSON'
    'rollback:Rollback a buddy profile to a previous version'
    'versions:List available version backups for a buddy'
    'compare:Compare two buddy profiles'
  )

  local -a config_commands
  config_commands=(
    'set:Set a configuration value'
    'get:Get a configuration value'
    'list:List all configuration'
  )

  case $state[1] in
    command)
      _describe 'command' commands
      ;;
    repo)
      _describe 'repo command' repo_commands
      ;;
    buddy)
      _describe 'buddy command' buddy_commands
      ;;
    config)
      _describe 'config command' config_commands
      ;;
  esac
}

_agent-buddy "$@"
`;
  } else {
    return `# agent-buddy bash completion
_agent_buddy_completion() {
  local cur prev words cword
  _init_completion || return

  commands="init status config repo buddy serve review completion"
  repo_commands="add list remove assign"
  buddy_commands="analyze list show update delete export import rollback versions compare"
  config_commands="set get list"

  if [[ \${cword} -eq 1 ]]; then
    COMPREPLY=($(compgen -W "\${commands}" -- "\${cur}"))
  elif [[ \${cword} -eq 2 ]]; then
    case "\${prev}" in
      repo)
        COMPREPLY=($(compgen -W "\${repo_commands}" -- "\${cur}"))
        ;;
      buddy)
        COMPREPLY=($(compgen -W "\${buddy_commands}" -- "\${cur}"))
        ;;
      config)
        COMPREPLY=($(compgen -W "\${config_commands}" -- "\${cur}"))
        ;;
    esac
  fi
}

complete -F _agent_buddy_completion agent-buddy
`;
  }
}

program
  .command("init")
  .description("Initialize agent-buddy configuration")
  .action(async () => {
    const spinner = ora("Initializing agent-buddy...").start();

    try {
      const storage = new BuddyFileSystemStorage();
      await storage.init();

      const config = await loadConfig();

      if (!getGitHubToken()) {
        spinner.stop();
        const githubToken = await input({
          message: "Enter your GitHub personal access token:",
          validate: (v) => (v.length > 0 ? true : "Token is required"),
        });
        const token = getGitHubToken(githubToken);
        spinner.start("Validating token...");
        try {
          const client = new GitHubClient(token);
          await client.getRepo("octocat", "Hello-World");
          spinner.succeed("GitHub token validated");
        } catch (err) {
          console.error("Token validation failed (non-critical)", err);
          spinner.warn("Could not validate token (will continue anyway)");
        }
        spinner.start("Saving configuration...");
      }

      if (!getAnthropicApiKey()) {
        spinner.stop();
        const anthropicApiKey = await input({
          message: "Enter your Anthropic API key:",
          validate: (v) => (v.length > 0 ? true : "API key is required"),
        });
        getAnthropicApiKey(anthropicApiKey);
        spinner.start("Saving configuration...");
      }

      config.server = config.server || { port: 3000, host: "0.0.0.0", webhookSecret: "", apiKey: "" };
      config.server.apiKey = crypto.randomUUID();
      await saveConfig(config);

      spinner.succeed(pc.green("agent-buddy initialized successfully!"));
      console.log();
      console.log(pc.dim("  Config directory: ") + BASE_DIR);
      showNextSteps();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      spinner.fail(pc.red(`Initialization failed: ${error.message}`));
      logger.error("CLI init failed", { error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show agent-buddy status")
  .option("--json", "Output as JSON", false)
  .option("--watch", "Watch mode: poll every 2 seconds", false)
  .action(async (opts: { json: boolean; watch: boolean }) => {
    const renderStatus = async () => {
      const config = await loadConfig();
      const storage = new BuddyFileSystemStorage();
      const buddies = await storage.listBuddies();
      const autoReviewCount = config.repos.filter((r: RepoConfig) => r.autoReview).length;

      if (opts.json) {
        console.log(JSON.stringify({
          repositories: {
            total: config.repos.length,
            autoReview: autoReviewCount,
            manual: config.repos.length - autoReviewCount,
          },
          buddies: {
            total: buddies.length,
          },
          server: {
            port: config.server?.port || 3000,
            host: config.server?.host || "0.0.0.0",
          },
        }, null, 2));
        return;
      }

      console.clear();
      console.log();
      console.log(pc.bold(pc.cyan("agent-buddy status")));
      console.log(pc.dim("─".repeat(40)));
      console.log(pc.dim("  Repositories:   ") + pc.bold(String(config.repos.length)));
      console.log(pc.dim("  Buddies:        ") + pc.bold(String(buddies.length)));
      console.log(pc.dim("  Server Port:    ") + pc.bold(String(config.server?.port || 3000)));
      console.log(pc.dim("  Server Host:    ") + pc.bold(String(config.server?.host || "0.0.0.0")));
      console.log(pc.dim("  Auto-Review:    ") + pc.bold(`${autoReviewCount} repos`));
      console.log();

      try {
        const jobs = await readPersistedJobs();

        if (jobs.length > 0) {
          const { running, queued, completed, failed } = countByStatus(jobs.map((j) => j.data));

          console.log(pc.bold("Jobs"));
          console.log(pc.dim("─".repeat(40)));
          console.log(pc.dim("  Running:    ") + (running > 0 ? pc.bold(pc.green(String(running))) : pc.dim("0")));
          console.log(pc.dim("  Queued:     ") + (queued > 0 ? pc.bold(pc.yellow(String(queued))) : pc.dim("0")));
          console.log(pc.dim("  Completed:  ") + pc.bold(String(completed)));
          console.log(pc.dim("  Failed:     ") + (failed > 0 ? pc.bold(pc.red(String(failed))) : pc.dim("0")));

          if (running > 0) {
            for (const job of jobs.filter((j) => j.data.status === "running")) {
              const data = job.data as { id: string; progressPercentage?: number; progressDetail?: string };
              const pct = data.progressPercentage != null ? ` ${Math.round(data.progressPercentage)}%` : "";
              console.log(pc.dim(`    ${data.id.slice(0, 8)}...${pct} ${data.progressDetail || ""}`));
            }
          }
          console.log();
        }
      } catch (err) {
        console.error("Failed to fetch job status", err);
      }

      if (opts.watch) {
        console.log(pc.dim("  Press Ctrl+C to exit watch mode"));
      }
    };

    if (!opts.watch) {
      await renderStatus();
      return;
    }

    process.stdout.write("\x1B?25l");
    const cleanup = () => {
      process.stdout.write("\x1B?25h");
      console.log();
      process.exit(0);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    await renderStatus();
    setInterval(renderStatus, 2000);
  });

const configCmd = new Command("config").description("Manage configuration");

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value (supports dot notation)")
  .action(async (key: string, value: string) => {
    try {
      const config = await loadConfig();

      const keys = key.split(".");
      let target: Record<string, unknown> = config as unknown as Record<string, unknown>;

      for (let i = 0; i < keys.length - 1; i++) {
        if (!(keys[i] in target)) {
          target[keys[i]] = {};
        }
        target = target[keys[i]] as Record<string, unknown>;
      }

      const finalKey = keys[keys.length - 1];
      try {
        target[finalKey] = JSON.parse(value);
      } catch {
        target[finalKey] = value;
      }

      await saveConfig(config);
      console.log(pc.green(`Set ${pc.cyan(key)} = ${value}`));
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

configCmd
  .command("get <key>")
  .description("Get a configuration value")
  .action(async (key: string) => {
    try {
      const config = await loadConfig();
      const keys = key.split(".");
      let value: unknown = config as unknown;

      for (const k of keys) {
        if (value && typeof value === "object" && k in value) {
          value = (value as Record<string, unknown>)[k];
        } else {
          console.error(pc.red(`Key not found: ${key}`));
          process.exit(1);
        }
      }

      console.log(pc.cyan(`${key}:`) + " " + JSON.stringify(value, null, 2));
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

configCmd
  .command("list")
  .description("List all configuration")
  .action(async () => {
    try {
      const config = await loadConfig();
      console.log();
      console.log(pc.bold("Configuration"));
      console.log(pc.dim("─".repeat(60)));
      const safe = { ...config };
      if (safe.githubToken) safe.githubToken = "[REDACTED]";
      if (safe.server?.apiKey) safe.server.apiKey = "[REDACTED]";
      if (safe.server?.webhookSecret) safe.server.webhookSecret = "[REDACTED]";
      if (safe.llm?.apiKey) safe.llm.apiKey = "[REDACTED]";
      if (safe.githubAppPrivateKey) safe.githubAppPrivateKey = "[REDACTED]";
      console.log(JSON.stringify(safe, null, 2));
      console.log();
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

configCmd
  .command("reset")
  .description("Reset configuration to defaults")
  .action(async () => {
    try {
      const currentConfig = await loadConfig();
      console.log();
      console.log(pc.bold("Current Configuration"));
      console.log(pc.dim("─".repeat(60)));
      console.log(JSON.stringify(currentConfig, null, 2));
      console.log();

      const confirmed = await confirm({ message: "Reset all configuration to defaults?" });
      if (!confirmed) {
        console.log(pc.yellow("Reset cancelled."));
        return;
      }

      await resetConfig();
      console.log(pc.green("Configuration reset to defaults."));
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

program.addCommand(configCmd);

const repoCmd = new Command("repo").description("Manage repositories");

repoCmd
  .command("add <owner/repo>")
  .description("Add a repository to monitor")
  .option("-b, --buddy <id>", "Pre-assign a buddy")
  .action(async (repoArg: string, opts: { buddy?: string }) => {
    const [owner, repo] = parseRepoArg(repoArg);

    const spinner = ora(`Validating ${owner}/${repo}...`).start();
    try {
      const token = getGitHubToken();
      if (!token) {
        spinner.fail(pc.red("GITHUB_TOKEN not set. Run agent-buddy init first."));
        process.exit(1);
      }
      const client = new GitHubClient(token);
      await client.getRepo(owner, repo);
      spinner.succeed(`Repository ${pc.cyan(`${owner}/${repo}`)} found`);
    } catch (err) {
      console.error("Repository lookup failed", err);
      spinner.fail(pc.red(`Repository ${owner}/${repo} not found or token invalid`));
      process.exit(1);
    }

    try {
      await addRepo(owner, repo, opts.buddy);
      console.log(pc.green(`  Added ${owner}/${repo}` + (opts.buddy ? ` with buddy ${pc.cyan(opts.buddy)}` : "")));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error(pc.red(`  Failed: ${errorMessage}`));
      logger.error("Failed to add repo", { owner, repo, buddyId: opts.buddy, error: errorMessage });
      process.exit(1);
    }
  });

repoCmd
  .command("list")
  .description("List configured repositories")
  .option("--json", "Output as JSON", false)
  .action(async (opts: { json: boolean }) => {
    const repos = await listRepos();

    if (opts.json) {
      console.log(JSON.stringify(repos.map((r: RepoConfig) => ({
        id: r.id,
        owner: r.owner,
        repo: r.repo,
        buddyId: r.buddyId || null,
        autoReview: r.autoReview,
        triggerMode: r.triggerMode,
      })), null, 2));
      return;
    }

    if (repos.length === 0) {
      console.log(pc.dim("No repositories configured. Add one with:"));
      console.log(pc.dim("  agent-buddy repo add <owner/repo>"));
      return;
    }

    console.log();
    console.log(pc.bold("Configured Repositories"));
    console.log(pc.dim("─".repeat(120)));

    const repoWidth = 35;
    const buddyWidth = 25;
    const autoReviewWidth = 15;
    const triggerWidth = 20;
    const statusWidth = 15;

    console.log(
      pc.dim("Repository".padEnd(repoWidth)) +
      pc.dim("Buddy".padEnd(buddyWidth)) +
      pc.dim("Auto-Review".padEnd(autoReviewWidth)) +
      pc.dim("Trigger Mode".padEnd(triggerWidth)) +
      pc.dim("Status".padEnd(statusWidth))
    );
    console.log(pc.dim("─".repeat(120)));

    for (const r of repos) {
      const repo = pc.bold(r.id).padEnd(repoWidth);
      const buddy = (r.buddies?.length ? pc.cyan(r.buddies.join(", ")) : r.buddyId ? pc.cyan(r.buddyId) : pc.dim("none")).padEnd(buddyWidth);
      const autoReview = (r.autoReview ? pc.green("enabled") : pc.dim("disabled")).padEnd(autoReviewWidth);
      const trigger = formatTriggerMode(r.triggerMode).padEnd(triggerWidth);
      const status = r.autoReview ? pc.green("● active") : pc.dim("○ inactive").padEnd(statusWidth);

      console.log(repo + buddy + autoReview + trigger + status);
    }
    console.log();

    const enabledCount = repos.filter((r: RepoConfig) => r.autoReview).length;
    console.log(pc.dim(`  Summary: ${repos.length} repos, ${enabledCount} with auto-review enabled`));
    console.log();
  });

repoCmd
  .command("remove <owner/repo>")
  .description("Remove a repository")
  .action(async (repoArg: string) => {
    const [owner, repo] = parseRepoArg(repoArg);

    const ok = await confirm({ message: `Remove ${owner}/${repo} from config?` });
    if (!ok) {
      console.log(pc.dim("Cancelled"));
      return;
    }

    try {
      await removeRepo(owner, repo);
      console.log(pc.green(`Removed ${owner}/${repo}`));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      console.error(pc.red(`Failed: ${errorMessage}`));
      logger.error("Failed to remove repo", { owner, repo, error: errorMessage });
      process.exit(1);
    }
  });

repoCmd
  .command("assign <owner/repo> <buddy-id>")
  .description("Assign a buddy to a repository")
  .action(async (repoArg: string, buddyId: string) => {
    const [owner, repo] = parseRepoArg(repoArg);

    try {
      const config = await loadConfig();
      const repoConfig = config.repos.find((r: RepoConfig) => r.id === `${owner}/${repo}`);
      if (!repoConfig) {
        console.error(pc.red(`Repository ${owner}/${repo} not found in config`));
        console.log(pc.dim(`Add it first with: agent-buddy repo add ${owner}/${repo}`));
        process.exit(1);
      }

      repoConfig.buddies = [buddyId];
      await saveConfig(config);
      console.log(pc.green(`Assigned buddy ${pc.cyan(buddyId)} to ${owner}/${repo}`));
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

program.addCommand(repoCmd);

const buddyCmd = new Command("buddy").description("Manage buddy profiles");

buddyCmd
  .command("analyze <username>")
  .description("Create a buddy from a reviewer's history")
  .requiredOption("-r, --repo <owner/repo>", "Repository to analyze")
  .option("--max-prs <number>", "Max PRs to analyze", "20")
  .action(async (username: string, opts: { repo: string; maxPrs: string }) => {
    const token = requireEnv(getGitHubToken(), "GITHUB_TOKEN");
    const config = await loadConfig();

    const parsed = parseRepoArg(opts.repo);
    const [owner, repo] = parsed;

    const spinner = ora(`Analyzing ${pc.cyan(username)} on ${opts.repo}...`).start();
    try {
      const client = new GitHubClient(token);
      const llm = createLLMProvider(config.llm);
      const pipeline = new AnalysisPipeline(llm);

      spinner.text = "Fetching review history...";
      const reviewData = await client.getPRsReviewedBy(owner, repo, username);

      if (reviewData.length === 0) {
        spinner.fail(pc.yellow(`No reviews found for ${username} on ${opts.repo}`));
        process.exit(1);
      }

      const maxPrs = parseInt(opts.maxPrs, 10);
      const data = reviewData.slice(0, maxPrs);

      spinner.text = `Analyzing ${data.length} reviews...`;
      const profile = await pipeline.createBuddy(username, data, owner, repo);

      spinner.succeed(pc.green(`Buddy ${pc.cyan(username)} created successfully!`));
      console.log();
      console.log(pc.dim("  Source repos: ") + profile.sourceRepos.join(", "));
      console.log(pc.dim("  Created at:   ") + profile.createdAt.toISOString());
      console.log();
      console.log(pc.dim("  View profile: ") + pc.cyan(`agent-buddy buddy show ${username}`));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      spinner.fail(pc.red(`Analysis failed: ${error.message}`));
      logger.error("Buddy analysis failed", { username, repo: opts.repo, error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

buddyCmd
  .command("list")
  .description("List all buddies")
  .option("-v, --verbose", "Show detailed info", false)
  .option("--json", "Output as JSON", false)
  .action(async (opts: { verbose: boolean; json: boolean }) => {
    const storage = new BuddyFileSystemStorage();
    const buddies = await storage.listBuddies();

    if (opts.json) {
      console.log(JSON.stringify(buddies.map((b: BuddySummary) => ({
        id: b.id,
        username: b.username,
        sourceRepos: b.sourceRepos,
        totalReviews: b.totalReviews,
        lastUpdated: b.lastUpdated.toISOString(),
      })), null, 2));
      return;
    }

    if (buddies.length === 0) {
      console.log(pc.dim("No buddies created yet. Create one with:"));
      console.log(pc.dim("  agent-buddy buddy analyze <username> --repo <owner/repo>"));
      return;
    }

    console.log();
    console.log(pc.bold("Buddies"));
    console.log(pc.dim("─".repeat(100)));

    const idWidth = 20;
    const usernameWidth = 20;
    const reposWidth = 30;
    const reviewsWidth = 10;
    const updatedWidth = 20;

    console.log(
      pc.dim("ID".padEnd(idWidth)) +
      pc.dim("Username".padEnd(usernameWidth)) +
      pc.dim("Repos".padEnd(reposWidth)) +
      pc.dim("Reviews".padEnd(reviewsWidth)) +
      pc.dim("Last Updated".padEnd(updatedWidth))
    );
    console.log(pc.dim("─".repeat(100)));

    for (const b of buddies) {
      const id = pc.cyan(b.id.slice(0, idWidth - 2) + "..").padEnd(idWidth);
      const username = pc.bold(b.username).padEnd(usernameWidth);
      const repos = (b.sourceRepos.length > 0
        ? b.sourceRepos.slice(0, 2).join(", ") + (b.sourceRepos.length > 2 ? ", ..." : "")
        : pc.dim("none")
      ).padEnd(reposWidth);
      const reviews = pc.yellow(String(b.totalReviews)).padEnd(reviewsWidth);
      const updated = new Date(b.lastUpdated).toLocaleDateString().padEnd(updatedWidth);

      console.log(id + username + repos + reviews + updated);
    }
    console.log();

    if (opts.verbose) {
      console.log(pc.dim("Run ") + pc.cyan("agent-buddy buddy show <id>") + pc.dim(" to view full profile details"));
      console.log();
    }
  });

buddyCmd
  .command("show <id>")
  .description("Show full buddy profile")
  .action(async (id: string) => {
    const storage = new BuddyFileSystemStorage();
    const profile = await storage.readProfile(id);

    if (!profile) {
      console.error(pc.red(`Buddy ${id} not found`));
      process.exit(1);
    }

    console.log();
    console.log(pc.bold(pc.cyan(`Buddy: ${profile.username}`)));
    console.log(pc.dim("─".repeat(80)));
    console.log(pc.dim("  ID:           ") + pc.cyan(profile.id));
    console.log(pc.dim("  Created:      ") + pc.bold(profile.createdAt.toISOString()));
    console.log(pc.dim("  Updated:      ") + pc.bold(profile.updatedAt.toISOString()));
    console.log(pc.dim("  Source Repos: ") + (profile.sourceRepos.length > 0 ? profile.sourceRepos.join(", ") : pc.dim("none")));
    console.log();

    console.log(pc.bold(pc.green("  SOUL (Review Philosophy)")));
    console.log(pc.dim("  " + "─".repeat(76)));
    console.log(pc.dim(indent(profile.soul, 2)));
    console.log();

    console.log(pc.bold(pc.blue("  USER (Expertise & Style)")));
    console.log(pc.dim("  " + "─".repeat(76)));
    console.log(pc.dim(indent(profile.user, 2)));
    console.log();

    console.log(pc.bold(pc.yellow("  MEMORY (Review History Summary)")));
    console.log(pc.dim("  " + "─".repeat(76)));
    const memories = await storage.listMemoryEntries(id);
    if (memories.length === 0) {
      console.log(pc.dim("    No memory entries yet."));
    } else {
      console.log(pc.dim(`    Total entries: ${memories.length}`));
      console.log();
      console.log(pc.bold("    Recent Reviews:"));
      const recent = memories.slice(-10).reverse();
      for (const m of recent) {
        const date = m.createdAt.toISOString().slice(0, 10);
        console.log(`      ${pc.dim(date)} ${pc.cyan(m.org + "/" + m.repo)} PR #${m.prNumber}${m.prTitle ? pc.dim(` - ${m.prTitle.slice(0, 50)}`) : ""}`);
      }
      if (memories.length > 10) {
        console.log(pc.dim(`      ... and ${memories.length - 10} more entries`));
      }
    }
    console.log();
  });

buddyCmd
  .command("update <id>")
  .description("Update buddy with new review data")
  .option("-r, --repo <owner/repo>", "Repository to fetch new reviews from")
  .action(async (id: string, opts: { repo?: string }) => {
    const token = requireEnv(getGitHubToken(), "GITHUB_TOKEN");
    const config = await loadConfig();

    const spinner = ora(`Updating buddy ${pc.cyan(id)}...`).start();
    try {
      const storage = new BuddyFileSystemStorage();
      const profile = await storage.readProfile(id);
      if (!profile) {
        spinner.fail(pc.red(`Buddy ${id} not found`));
        process.exit(1);
      }

      const repos = opts.repo ? [opts.repo] : profile.sourceRepos;
      if (repos.length === 0) {
        spinner.fail(pc.red("No source repos to update from"));
        process.exit(1);
      }

      const client = new GitHubClient(token);
      const llm = createLLMProvider(config.llm);
      const pipeline = new AnalysisPipeline(llm);

      for (const repoStr of repos) {
        const parsed = parseRepoId(repoStr);
        if (!parsed) continue;
        const [owner, repo] = parsed;

        spinner.text = `Fetching new reviews from ${repoStr}...`;
        const reviewData = await client.getPRsReviewedBy(owner, repo, id);
        if (reviewData.length > 0) {
          spinner.text = `Updating from ${reviewData.length} reviews on ${repoStr}...`;
          await pipeline.updateBuddy(id, reviewData, owner, repo);
        }
      }

      spinner.succeed(pc.green(`Buddy ${pc.cyan(id)} updated`));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      spinner.fail(pc.red(`Update failed: ${error.message}`));
      logger.error("Buddy update failed", { id, repo: opts.repo, error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

buddyCmd
  .command("delete <id>")
  .description("Delete a buddy")
  .action(async (id: string) => {
    const ok = await confirm({ message: `Delete buddy ${id}? This cannot be undone.` });
    if (!ok) {
      console.log(pc.dim("Cancelled"));
      return;
    }

    const storage = new BuddyFileSystemStorage();
    await storage.deleteBuddy(id);
    console.log(pc.green(`Buddy ${id} deleted`));
  });

buddyCmd
  .command("export <id>")
  .description("Export a buddy profile to JSON")
  .option("-o, --output <file>", "Output file path")
  .action(async (id: string, opts: { output?: string }) => {
    const spinner = ora(`Exporting buddy ${pc.cyan(id)}...`).start();
    try {
      const storage = new BuddyFileSystemStorage();
      const json = await storage.exportProfile(id);

      if (opts.output) {
        await fs.writeFile(opts.output, json);
        spinner.succeed(pc.green(`Profile exported to ${pc.cyan(opts.output)}`));
      } else {
        console.log();
        console.log(json);
        spinner.succeed(pc.green(`Profile exported successfully`));
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      spinner.fail(pc.red(`Export failed: ${errorMessage}`));
      logger.error("Buddy export failed", { id, error: errorMessage });
      process.exit(1);
    }
  });

buddyCmd
  .command("import <file>")
  .description("Import a buddy profile from JSON")
  .option("--as <id>", "Import with a different ID")
  .action(async (file: string, opts: { as?: string }) => {
    const spinner = ora(`Importing buddy from ${pc.cyan(file)}...`).start();
    try {
      const json = await fs.readFile(file, "utf-8");

      let jsonData: unknown;
      try {
        jsonData = JSON.parse(json);
      } catch (err) {
        console.error("JSON parse failed", err);
        spinner.fail(pc.red("Invalid JSON file"));
        console.error(pc.dim("  The file could not be parsed as valid JSON."));
        process.exit(1);
      }

      if (!jsonData || typeof jsonData !== "object") {
        spinner.fail(pc.red("Invalid buddy export format"));
        console.error(pc.dim("  Expected a JSON object with buddy profile data."));
        process.exit(1);
      }

      const storage = new BuddyFileSystemStorage();
      const newId = await storage.importProfile(json, opts.as);

      spinner.succeed(pc.green(`Buddy imported as ${pc.cyan(newId)}`));
      console.log();
      console.log(pc.dim("  View profile: ") + pc.cyan(`agent-buddy buddy show ${newId}`));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      spinner.fail(pc.red(`Import failed`));

      if (errorMessage.includes("Invalid buddy export")) {
        console.error();
        console.error(pc.red("  Validation errors:"));
        console.error(pc.dim(errorMessage));
        console.error();
        console.error(pc.dim("  Required fields: id, username, soul, user, memory, sourceRepos, version, exportedAt"));
        console.error(pc.dim("  All fields must be non-empty strings (except sourceRepos which must be an array)."));
      } else {
        console.error(pc.red(`  ${errorMessage}`));
      }

      logger.error("Buddy import failed", { file, newId: opts.as, error: errorMessage });
      process.exit(1);
    }
  });

buddyCmd
  .command("rollback <id>")
  .description("Rollback a buddy profile to a previous version")
  .option("-v, --version <number>", "Specific version to rollback to (default: latest)")
  .action(async (id: string, opts: { version?: string }) => {
    const spinner = ora(`Rolling back buddy ${pc.cyan(id)}...`).start();
    try {
      const storage = new BuddyFileSystemStorage();

      const versions = await storage.listProfileVersions(id);
      if (versions.length === 0) {
        spinner.fail(pc.red(`No version backups found for buddy ${id}`));
        process.exit(1);
      }

      const targetVersion = opts.version ? parseInt(opts.version, 10) : undefined;

      if (targetVersion !== undefined) {
        const versionExists = versions.some((v: { version: number; backedUpAt: string }) => v.version === targetVersion);
        if (!versionExists) {
          spinner.fail(pc.red(`Version ${targetVersion} not found`));
          console.log(pc.dim("Available versions:"));
          for (const v of versions) {
            console.log(pc.dim(`  v${v.version} - ${v.backedUpAt}`));
          }
          process.exit(1);
        }
      }

      const restored = await storage.rollbackProfile(id, targetVersion);

      spinner.succeed(pc.green(`Rolled back to version ${targetVersion || "latest"}`));
      console.log();
      console.log(pc.dim("  Restored from: ") + restored.updatedAt.toISOString());
      console.log(pc.dim("  View profile: ") + pc.cyan(`agent-buddy buddy show ${id}`));
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      spinner.fail(pc.red(`Rollback failed: ${errorMessage}`));
      logger.error("Buddy rollback failed", { id, version: opts.version, error: errorMessage });
      process.exit(1);
    }
  });

buddyCmd
  .command("versions <id>")
  .description("List available version backups for a buddy")
  .action(async (id: string) => {
    const versions = await fetchBuddyVersions(id);

    if (versions.length === 0) {
      console.log(pc.dim(`No version backups found for buddy ${id}`));
      return;
    }

    console.log();
    console.log(pc.bold(`Version backups for ${pc.cyan(id)}`));
    console.log(pc.dim("─".repeat(60)));
    for (const v of versions) {
      console.log(`  v${v.version} - ${v.backedUpAt}`);
    }
    console.log();
    console.log(pc.dim(`Rollback with: agent-buddy buddy rollback ${id} [-v <version>]`));
    console.log();
  });

buddyCmd
  .command("setup")
  .description("Interactive first-time configuration")
  .action(async () => {
    console.log();
    console.log(pc.bold(pc.cyan("agent-buddy setup")));
    console.log(pc.dim("─".repeat(40)));
    console.log();

    const githubToken = await password({
      message: "GitHub Token (ghp_...):",
      validate: (v) => (v.length > 0 ? true : "GitHub token is required"),
    });

    const validateSpinner = ora("Validating GitHub token...").start();
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${githubToken}` },
      });
      if (!res.ok) {
        validateSpinner.fail(pc.red("Invalid GitHub token"));
        process.exit(1);
      }
      const user = (await res.json()) as { login: string };
      validateSpinner.succeed(pc.green(`GitHub token valid (user: ${pc.cyan(user.login)})`));
    } catch (err) {
      console.error("GitHub token validation failed", err);
      validateSpinner.fail(pc.red("Could not validate GitHub token"));
      process.exit(1);
    }

    const anthropicKey = await password({
      message: "Anthropic API Key (sk-ant-...):",
      validate: (v) => (v.length > 0 ? true : "Anthropic API key is required"),
    });

    const port = await input({
      message: "Server port:",
      default: "3000",
      validate: (v) => {
        const n = parseInt(v, 10);
        return n > 0 && n < 65536 ? true : "Port must be between 1 and 65535";
      },
    });

    const configDir = path.join(os.homedir(), ".agent-buddy");
    await fs.mkdir(configDir, { recursive: true });
    const configPath = path.join(configDir, "config.json");

    let config: Record<string, unknown> = {};
    try {
      const existing = await fs.readFile(configPath, "utf-8");
      config = JSON.parse(existing);
    } catch {
    }

    config.githubToken = githubToken;
    config.anthropicApiKey = anthropicKey;
    config.server = { ...(config.server as Record<string, unknown> || {}), port: parseInt(port, 10) };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log();
    console.log(pc.green("Configuration saved to ") + pc.cyan(configPath));
    console.log();
    showNextSteps();
    console.log();
  });

buddyCmd
  .command("compare <id1> <id2>")
  .description("Compare two buddy profiles")
  .action(async (id1: string, id2: string) => {
    const storage = new BuddyFileSystemStorage();
    const [buddy1, buddy2] = await Promise.all([
      storage.readProfile(id1),
      storage.readProfile(id2),
    ]);

    if (!buddy1) {
      console.error(pc.red(`Buddy ${id1} not found`));
      return;
    }
    if (!buddy2) {
      console.error(pc.red(`Buddy ${id2} not found`));
      return;
    }

    const result = compareBuddies(buddy1, buddy2);

    console.log();
    console.log(pc.bold(`Comparing ${pc.cyan(buddy1.username)} vs ${pc.cyan(buddy2.username)}`));
    console.log(pc.dim("─".repeat(80)));
    console.log();

    const scorePercent = Math.round(result.score * 100);
    const scoreColor = scorePercent > 70 ? pc.green : scorePercent > 40 ? pc.yellow : pc.red;
    console.log(pc.bold("  Overall Similarity: ") + scoreColor(`${scorePercent}%`));
    console.log();

    console.log(pc.bold("  Soul Profile Overlap: ") + pc.yellow(`${Math.round(result.soulOverlap * 100)}%`));

    console.log(pc.bold("  Philosophy Similarity: ") + `${Math.round(result.analysis.philosophySimilarity * 100)}%`);
    console.log(pc.bold("  Expertise Overlap: ") + `${Math.round(result.analysis.expertiseOverlap * 100)}%`);

    if (result.sharedKeywords.length > 0) {
      console.log();
      console.log(pc.bold("  Shared Keywords:"));
      for (const keyword of result.sharedKeywords) {
        console.log(pc.dim("    • ") + keyword);
      }
    }

    if (result.sharedRepos.length > 0) {
      console.log();
      console.log(pc.bold("  Shared Repos:"));
      for (const repo of result.sharedRepos) {
        console.log(pc.dim("    • ") + pc.cyan(repo));
      }
    }

    if (result.analysis.commonPatterns.length > 0) {
      console.log();
      console.log(pc.bold("  Common Patterns:"));
      for (const pattern of result.analysis.commonPatterns) {
        console.log(pc.dim("    • ") + pattern);
      }
    }

    console.log();
  });

program.addCommand(buddyCmd);

program
  .command("serve")
  .description("Start the webhook server")
  .option("-p, --port <port>", "Server port", "3000")
  .action(async (opts: { port: string }) => {
    const config = await loadConfig();
    const port = opts.port || String(config.server?.port || 3000);

    console.log();
    console.log(pc.bold(pc.cyan("agent-buddy server")));
    console.log(pc.dim("─".repeat(40)));
    console.log(pc.dim("  Port:     ") + port);
    console.log(pc.dim("  Webhook:  ") + `POST http://localhost:${port}/api/webhooks/github`);
    console.log();
    console.log(pc.dim("  To set up GitHub webhook:"));
    console.log(pc.dim("  1. Go to repo Settings > Webhooks > Add webhook"));
    console.log(pc.dim(`  2. Payload URL: http://your-server:${port}/api/webhooks/github`));
    console.log(pc.dim("  3. Content type: application/json"));
    console.log(pc.dim("  4. Secret: (set in config.json server.webhookSecret)"));
    console.log();

    try {
      const mod = await import("@agent-buddy/server");
      const serve = (mod as Record<string, unknown>).serve as ((port: number) => Promise<void>) | undefined;
      if (serve) {
        await serve(Number(port));
      } else {
        console.error(pc.red("Server module does not export serve function"));
        process.exit(1);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      console.error(pc.red(`Server error: ${error.message}`));
      logger.error("Server startup failed", { port, error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

const reviewCmd = new Command("review").description("Perform code reviews");

reviewCmd
  .command("<owner/repo> <pr-number>")
  .description("Perform a manual code review on a PR")
  .option("--buddy <id>", "Use a specific buddy profile")
  .option("--high-context", "Enable high-context analysis", false)
  .action(async (repoArg: string, prNumberStr: string, opts: { buddy?: string; highContext: boolean }) => {
    const token = requireEnv(getGitHubToken(), "GITHUB_TOKEN");
    const config = await loadConfig();

    const parsed = parseRepoArg(repoArg);
    const [owner, repo] = parsed;
    const prNumber = parseInt(prNumberStr, 10);
    if (isNaN(prNumber)) {
      console.error(pc.red("Usage: agent-buddy review <owner/repo> <pr-number>"));
      process.exit(1);
    }

    const spinner = ora(`Reviewing ${owner}/${repo} PR #${prNumber}...`).start();
    try {
      const client = new GitHubClient(token);
      const llm = createLLMProvider(config.llm);
      const engine = new ReviewEngine(llm);
      const storage = new BuddyFileSystemStorage();

      spinner.text = "Fetching PR data...";
      const [pr, diff] = await Promise.all([
        client.getPR(owner, repo, prNumber),
        client.getPRDiff(owner, repo, prNumber),
      ]);

      let buddyProfile;
      if (opts.buddy) {
        spinner.text = `Loading buddy ${opts.buddy}...`;
        buddyProfile = await storage.readProfile(opts.buddy);
        if (!buddyProfile) {
          spinner.warn(pc.yellow(`Buddy ${opts.buddy} not found, using default review`));
        }
      } else {
        const config = await loadConfig();
        const repoConfig = config.repos.find((r: { id: string }) => r.id === `${owner}/${repo}`);
        const buddyIds = repoConfig?.buddies?.length ? repoConfig.buddies : repoConfig?.buddyId ? [repoConfig.buddyId] : [];
        if (buddyIds.length > 0) {
          buddyProfile = await storage.readProfile(buddyIds[0]);
        }
      }

      let repoFiles: string[] | undefined;
      if (opts.highContext) {
        spinner.text = "Fetching repository file tree...";
        try {
          const files = await client.getPRFiles(owner, repo, prNumber);
          repoFiles = files.map((f: { filename: string }) => f.filename);
        } catch (err) {
          console.error("Failed to fetch PR file tree, falling back to diff filenames", err);
          repoFiles = [pr.files.map((f: { filename: string }) => f.filename).join("\n")];
        }
      }

      spinner.text = "Running review...";
      const review = await engine.performReview(pr, diff, buddyProfile ?? undefined, repoFiles);

      spinner.succeed(pc.green("Review complete!"));
      console.log();

      const stateIcon = review.state === "approved"
        ? pc.green("[APPROVED]")
        : review.state === "changes_requested"
          ? pc.red("[CHANGES REQUESTED]")
          : pc.yellow("[COMMENTED]");
      console.log(`  ${stateIcon} ${review.summary.split("\n")[0]}`);
      console.log();

      if (review.comments.length > 0) {
        console.log(pc.bold(`  Comments (${review.comments.length})`));
        for (const c of review.comments.slice(0, 10)) {
          const sev = c.severity === "error" ? pc.red("[ERROR]")
            : c.severity === "warning" ? pc.yellow("[WARN]")
            : c.severity === "suggestion" ? pc.cyan("[SUGGEST]")
            : pc.dim("[INFO]");
          console.log(`    ${sev} ${pc.dim(`${c.path}:${c.line || "?"}`)} ${c.body.slice(0, 80)}`);
        }
        if (review.comments.length > 10) {
          console.log(pc.dim(`    ... and ${review.comments.length - 10} more`));
        }
      }

      console.log();
      console.log(pc.dim(`  Model: ${review.metadata.llmModel}`));
      console.log(pc.dim(`  Tokens: ${review.metadata.tokenUsage.totalTokens}`));
      console.log(pc.dim(`  Duration: ${(review.metadata.durationMs / 1000).toFixed(1)}s`));

      const postOk = await confirm({ message: "Post this review to GitHub?" });
      if (postOk) {
        const postSpinner = ora("Posting review...").start();
        const ghReview = engine.formatForGitHub(review);
        await client.createReview(owner, repo, prNumber, ghReview);
        postSpinner.succeed(pc.green("Review posted to GitHub"));
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      spinner.fail(pc.red(`Review failed: ${error.message}`));
      logger.error("Manual review failed", { owner, repo, prNumber, buddy: opts.buddy, error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

reviewCmd
  .command("trigger")
  .description("Trigger a review via the server API")
  .requiredOption("--repo <owner/repo>", "Repository in owner/repo format")
  .requiredOption("--pr <number>", "PR number")
  .option("--buddy <id>", "Buddy ID to use for review")
  .option("--wait", "Poll until review completes, then show result", false)
  .action(async (opts: { repo: string; pr: string; buddy?: string; wait: boolean }) => {
    const parsed = parseRepoArg(opts.repo);
    const [owner, repo] = parsed;

    const prNumber = parseInt(opts.pr, 10);
    if (isNaN(prNumber)) {
      console.error(pc.red("Invalid --pr value. Must be a number"));
      process.exit(1);
    }

    const config = await loadConfig();
    const serverPort = config.server?.port || 3000;
    const serverHost = config.server?.host || "localhost";
    const apiBase = `http://${serverHost}:${serverPort}/api`;

    const body: { prNumber: number } = {
      prNumber,
    };

    const url = new URL(`${apiBase}/repos/${owner}/${repo}/reviews`);
    if (opts.buddy) {
      url.searchParams.set("buddyId", opts.buddy);
    }

    const spinner = ora(`Triggering review for ${pc.cyan(`${opts.repo}#${opts.pr}`)}...`).start();

    try {
      const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" })) as { error?: string };
        if (res.status === 404) {
          spinner.fail(pc.red("Server API endpoint not found. Is the server running?"));
          console.error(pc.dim(`  Expected: ${apiBase}/repos/${owner}/${repo}/reviews`));
        } else if (res.status === 500) {
          spinner.fail(pc.red("Server error"));
          console.error(pc.dim(`  ${errorData.error || "Unknown error"}`));
        } else {
          spinner.fail(pc.red(`HTTP ${res.status}: ${errorData.error || "Unknown error"}`));
        }
        process.exit(1);
      }

      const data = await res.json() as { message: string; buddyIds: string[] };
      spinner.succeed(pc.green(`${data.message}`));
      console.log(pc.dim(`  Buddy IDs: ${data.buddyIds.join(", ")}`));
      console.log();

      if (!opts.wait) {
        console.log(pc.dim("Note: The server processes reviews asynchronously."));
        console.log(pc.dim("Check server logs for review progress."));
        return;
      }

      const pollSpinner = ora("Waiting for review to complete...").start();
      const pollTimeoutMs = parseInt(process.env.AGENT_BUDDY_POLL_TIMEOUT_MS || "600000", 10);
      const pollIntervalMs = 2000;
      const startTime = Date.now();

      const jobResults: Array<{ buddyId: string; status: string; error?: string }> = [];

      for (const buddyId of data.buddyIds) {
        const jobId = `${opts.repo}-${opts.pr}-${buddyId}`;
        const jobUrl = `${apiBase}/jobs/${encodeURIComponent(jobId)}`;

        let jobStatus: string | null = null;

        while (Date.now() - startTime < pollTimeoutMs) {
          try {
            const jobRes = await fetch(jobUrl);
            if (!jobRes.ok) {
              if (jobRes.status === 404) {
                pollSpinner.text = `Waiting for job to start...`;
              } else {
                pollSpinner.text = `HTTP ${jobRes.status} error for ${buddyId}`;
              }
            } else {
              const jobData = await jobRes.json() as { status: string; error?: string };
              jobStatus = jobData.status;

              if (jobStatus === "completed") {
                pollSpinner.text = `Review for ${pc.cyan(buddyId)} completed!`;
                jobResults.push({ buddyId, status: "completed" });
                break;
              } else if (jobStatus === "failed") {
                pollSpinner.text = `Review for ${pc.cyan(buddyId)} failed!`;
                jobResults.push({ buddyId, status: "failed", error: jobData.error });
                break;
              } else if (jobStatus === "running") {
                pollSpinner.text = `Review in progress for ${pc.cyan(buddyId)}...`;
              } else {
                pollSpinner.text = `Review queued for ${pc.cyan(buddyId)}...`;
              }
            }
          } catch (err) {
            console.error("Network error during job polling, retrying...", err);
          }

          await sleep(pollIntervalMs);
        }

        if (jobStatus !== "completed" && jobStatus !== "failed") {
          pollSpinner.warn(pc.yellow(`Polling timed out for ${buddyId} after ${pollTimeoutMs / 1000} seconds`));
          jobResults.push({ buddyId, status: "timeout" });
        }
      }

      pollSpinner.stop();
      console.log();
      console.log(pc.bold("Review Results:"));

      let hasFailures = false;
      for (const result of jobResults) {
        const statusIcon = result.status === "completed" ? pc.green("✓")
          : result.status === "failed" ? pc.red("✗")
          : pc.yellow("○");
        const statusText = result.status === "completed" ? pc.green("completed")
          : result.status === "failed" ? pc.red("failed")
          : pc.yellow("timed out");

        console.log(`  ${statusIcon} ${pc.cyan(result.buddyId)}: ${statusText}`);
        if (result.error) {
          console.log(pc.dim(`    Error: ${result.error}`));
          hasFailures = true;
        }
        if (result.status === "failed") {
          hasFailures = true;
        }
      }
      console.log();

      if (hasFailures) {
        process.exit(1);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(getErrorMessage(err));
      if (error.message.includes("ECONNREFUSED")) {
        spinner.fail(pc.red("Cannot connect to server"));
        console.error(pc.dim(`  Is the server running at ${apiBase}?`));
        console.error(pc.dim(`  Start it with: agent-buddy serve`));
      } else {
        spinner.fail(pc.red(`Failed: ${error.message}`));
      }
      logger.error("Review trigger failed", { repo: opts.repo, pr: opts.pr, buddy: opts.buddy, error: error.message, stack: error.stack });
      process.exit(1);
    }
  });

program.addCommand(reviewCmd);

const jobCmd = new Command("job").description("Manage jobs");

jobCmd
  .command("list")
  .description("List recent jobs")
  .option("--status <status>", "Filter by status (queued, running, completed, failed, cancelled)")
  .option("--json", "Output as JSON", false)
  .action(async (opts: { status?: string; json: boolean }) => {
    const config = await loadConfig();
    const apiBase = getApiBaseUrl(config);
    const params = new URLSearchParams();
    if (opts.status) params.set("status", opts.status);
    const qs = params.toString();
    const url = `${apiBase}/api/jobs${qs ? `?${qs}` : ""}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(pc.red(`Failed to fetch jobs (${res.status})`));
        process.exit(1);
      }
      const data = await res.json() as { data: JobListItem[]; total: number };

      if (opts.json) {
        console.log(JSON.stringify(data.data, null, 2));
        return;
      }

      if (data.data.length === 0) {
        console.log(pc.dim("No jobs found."));
        return;
      }

      console.log();
      console.log(pc.bold("Recent Jobs"));
      console.log(pc.dim("─".repeat(130)));

      const idWidth = 38;
      const typeWidth = 12;
      const statusWidth = 14;
      const repoWidth = 25;
      const prWidth = 8;
      const buddyWidth = 18;

      console.log(
        pc.dim("ID".padEnd(idWidth)) +
        pc.dim("TYPE".padEnd(typeWidth)) +
        pc.dim("STATUS".padEnd(statusWidth)) +
        pc.dim("REPO".padEnd(repoWidth)) +
        pc.dim("PR#".padEnd(prWidth)) +
        pc.dim("BUDDY".padEnd(buddyWidth)) +
        pc.dim("CREATED")
      );
      console.log(pc.dim("─".repeat(130)));

      for (const job of data.data) {
        const id = job.id.substring(0, 36).padEnd(idWidth);
        const type = job.type.padEnd(typeWidth);
        const status = formatJobStatus(job.status).padEnd(statusWidth);
        const repo = (job.repoId || job.repo || "-").padEnd(repoWidth);
        const pr = (job.prNumber != null ? String(job.prNumber) : "-").padEnd(prWidth);
        const buddy = (job.buddyId || "-").padEnd(buddyWidth);
        const created = formatJobDate(job.createdAt);

        console.log(id + type + status + repo + pr + buddy + created);
      }

      console.log();
      console.log(pc.dim(`  Total: ${data.total} jobs`));
      console.log();
    } catch (err) {
      if (err instanceof Error && err.cause?.toString().includes("ECONNREFUSED")) {
        console.error(pc.red("Server is not running. Start it with:"));
        console.error(pc.dim("  agent-buddy serve"));
        process.exit(1);
      }
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

jobCmd
  .command("cancel <job-id>")
  .description("Cancel a queued or running job")
  .action(async (jobId: string) => {
    const config = await loadConfig();
    const apiBase = getApiBaseUrl(config);
    const url = `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/cancel`;

    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json() as { success?: boolean; status?: string; error?: string };

      if (!res.ok) {
        console.error(pc.red(data.error || `Cancel failed (${res.status})`));
        process.exit(1);
      }

      console.log(pc.green(`Job ${jobId}: ${data.status}`));
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

program.addCommand(jobCmd);

program
  .command("history")
  .description("View recent review history")
  .option("--repo <owner/repo>", "Filter by repository")
  .option("--buddy <id>", "Filter by buddy")
  .option("--since <date>", "Filter reviews from this date (YYYY-MM-DD)")
  .option("--until <date>", "Filter reviews up to this date (YYYY-MM-DD)")
  .option("--json", "Output as JSON", false)
  .action(async (opts: { repo?: string; buddy?: string; since?: string; until?: string; json: boolean }) => {
    try {
      const reviews = await fetchReviewHistory(opts);

      if (opts.json) {
        console.log(JSON.stringify(reviews, null, 2));
        return;
      }

      if (reviews.length === 0) {
        console.log(pc.dim("No review history found."));
        return;
      }

      console.log();
      console.log(pc.bold("Recent Reviews"));
      console.log(pc.dim("─".repeat(70)));

      for (const j of reviews) {
        const stateIcon = j.state === "completed" ? pc.green("[OK]") : pc.red("[FAIL]");
        const repo = j.repo || "unknown";
        const pr = j.prNumber != null ? `#${j.prNumber}` : "";
        const buddy = j.buddyId ? pc.dim(` by ${j.buddyId}`) : "";
        const date = new Date(j.date).toLocaleDateString();

        console.log(`  ${stateIcon} ${pc.bold(repo)} ${pr}${buddy}`);
        console.log(`    ${pc.dim(`${j.commentCount} comments | ${date}`)}`);
      }
      console.log();
    } catch (err) {
      console.error(pc.red(`Failed: ${getErrorMessage(err)}`));
      process.exit(1);
    }
  });

program
  .command("search <query>")
  .description("Search repos, buddies, and reviews")
  .option("--json", "Output as JSON", false)
  .action(async (query: string, opts: { json: boolean }) => {
    const config = await loadConfig();
    const apiBase = getApiBaseUrl(config);
    const url = `${apiBase}/api/search?q=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error(pc.red(`Search failed (${res.status})`));
        process.exit(1);
      }
      const data = await res.json() as {
        repos: { id: string; owner: string; repo: string }[];
        buddies: { id: string; username: string }[];
        reviews: { owner: string; repo: string; prNumber: number; summary: string }[];
      };

      if (opts.json) {
        console.log(JSON.stringify(data, null, 2));
        return;
      }

      const hasResults = data.repos.length > 0 || data.buddies.length > 0 || data.reviews.length > 0;

      if (!hasResults) {
        console.log(pc.dim(`No results found for "${query}"`));
        return;
      }

      console.log();
      console.log(pc.bold(`Search results for "${query}"`));
      console.log(pc.dim("─".repeat(50)));

      if (data.repos.length > 0) {
        console.log();
        console.log(pc.cyan(`  Repositories (${data.repos.length})`));
        for (const r of data.repos) {
          console.log(`    ${pc.bold(r.id)}  ${pc.dim(`${r.owner}/${r.repo}`)}`);
        }
      }

      if (data.buddies.length > 0) {
        console.log();
        console.log(pc.cyan(`  Buddies (${data.buddies.length})`));
        for (const b of data.buddies) {
          console.log(`    ${pc.bold(b.username)}  ${pc.dim(b.id)}`);
        }
      }

      if (data.reviews.length > 0) {
        console.log();
        console.log(pc.cyan(`  Reviews (${data.reviews.length})`));
        for (const r of data.reviews) {
          const repo = `${r.owner}/${r.repo}#${r.prNumber}`;
          console.log(`    ${pc.bold(repo)}  ${r.summary}`);
        }
      }

      console.log();
    } catch (err) {
      const msg = getErrorMessage(err);
      if (msg.includes("ECONNREFUSED")) {
        console.error(pc.red("Server is not running. Start it with: agent-buddy serve"));
      } else {
        console.error(pc.red(`Failed: ${msg}`));
      }
      process.exit(1);
    }
  });

function indent(text: string, spaces: number): string {
  const prefix = " ".repeat(spaces);
  return text.split("\n").map((line) => prefix + line).join("\n");
}

function formatTriggerMode(mode: string): string {
  return formatStatus(mode, {
    pr_opened: pc.cyan,
    mention: pc.yellow,
    review_requested: pc.green,
    manual: pc.dim,
  });
}

interface JobListItem {
  id: string;
  type: string;
  status: string;
  repoId?: string;
  repo?: string;
  buddyId?: string;
  prNumber?: number;
  createdAt: string;
  error?: string;
}

function formatJobStatus(status: string): string {
  return formatStatus(status, {
    queued: pc.dim,
    running: pc.cyan,
    completed: pc.green,
    failed: pc.red,
    cancelled: pc.yellow,
  });
}

function formatJobDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return pc.dim("-");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return pc.dim("just now");
  if (diffMin < 60) return pc.dim(`${diffMin}m ago`);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return pc.dim(`${diffHr}h ago`);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return pc.dim(`${diffDay}d ago`);
  return pc.dim(date.toLocaleDateString());
}

program.parse();
