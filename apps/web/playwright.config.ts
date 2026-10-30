import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    // Uses the Chrome already installed on the machine; CI installs it with `playwright install chrome`.
    channel: "chrome",
  },
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm exec wrangler dev --port 3100" : "pnpm exec next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
