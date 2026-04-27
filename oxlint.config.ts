import { defineConfig } from "oxlint";

export default defineConfig({
  rules: {
    // Disable overly strict rules for existing codebase
    "no-useless-fallback-in-spread": "off",
    "no-unnecessary-parameter-property-assignment": "off",
  },
});
