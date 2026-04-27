import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./packages/dashboard/src"),
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    setupFiles: ["./packages/dashboard/src/__tests__/setup.ts"],
  },
});
