import { defineConfig } from "@playwright/test";

const ci = !!process.env.CI;

/**
 * Local: Next dev on :3100 for the pages, plus the Cloudflare Worker on :8787 for online rooms (the client
 * finds it by itself when the page is on localhost). CI: one process, the built site served by the Worker.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: ci ? "http://localhost:8787" : "http://localhost:3100",
    // Uses the Chrome already installed on the machine; CI installs it with `playwright install chrome`.
    channel: "chrome",
  },
  webServer: ci
    ? [{ command: "npx next build && cd ../server && rm -rf .wrangler/e2e-state && npx wrangler dev --port 8787 --persist-to .wrangler/e2e-state", url: "http://localhost:8787", reuseExistingServer: true, timeout: 300_000 }]
    : [
        { command: "npx next dev -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 180_000 },
        // A fresh database each run (not the dev one), so the leaderboard holds only this run's scores.
        { command: "rm -rf .wrangler/e2e-state && npx wrangler dev --port 8787 --persist-to .wrangler/e2e-state", cwd: "../server", url: "http://localhost:8787", reuseExistingServer: true, timeout: 180_000 },
      ],
});
