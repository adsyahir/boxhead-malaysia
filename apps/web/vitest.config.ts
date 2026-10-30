import { defineConfig } from "vitest/config";

// Unit tests only: the Playwright specs in e2e/ run with `pnpm e2e`.
export default defineConfig({
  test: { include: ["game/**/*.test.ts", "i18n/**/*.test.ts", "settings/**/*.test.ts"] },
});
