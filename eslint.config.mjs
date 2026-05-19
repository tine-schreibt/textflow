// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },
    extends: [
      tseslint.configs.recommendedTypeChecked,
      ...obsidianmd.configs.recommended,
    ],
    rules: {
      // This is disabled because the deps it keeps complaining about are in fact installed
      // and not at all extraneous
      "import/no-extraneous-dependencies": "off",
    },
  },
]);
