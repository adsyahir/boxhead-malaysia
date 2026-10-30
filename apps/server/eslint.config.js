import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    ignores: ["src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: ["phaser", "phaser/*", "react", "react/*", "react-dom", "next", "next/*"] }],
      "no-restricted-globals": ["error", "window", "document", "localStorage"],
    },
  },
);
