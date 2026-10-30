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
    command: process.env.CI ? "npx next build && npx wrangler dev --port 3100" : "npx next dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
