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
      "no-restricted-globals": ["error", "window", "document", "navigator", "localStorage", "performance"],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use the seeded RNG in rng.ts" },
        { object: "Date", property: "now", message: "Core must be deterministic; pass time in" },
      ],
    },
  },
);
