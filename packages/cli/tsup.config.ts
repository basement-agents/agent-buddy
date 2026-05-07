import { defineConfig } from "tsup";

export default defineConfig({
  entry: { cli: "src/cli.ts" },
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  shims: false,
  splitting: false,
  bundle: true,
  noExternal: [/^@agent-buddy\//],
  external: [
    "commander",
    "ora",
    "picocolors",
    "@inquirer/prompts",
    "hono",
    "@hono/zod-validator",
    "zod",
  ],
  banner: { js: "#!/usr/bin/env node" },
});
