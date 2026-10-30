# Deploying to Cloudflare (no VPS)

Everything runs on Cloudflare's edge, so there is no server of your own to crash.

| Part | Where | Status |
|---|---|---|
| Website and game (static export of `apps/web`) | Cloudflare Workers static assets | ready |
| Leaderboard API + database | Worker + D1 (SQLite) | planned |
| Online rooms (no login) | Worker + Durable Objects, one per room | planned |

## One-time setup (you do this, it needs your Cloudflare login)

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. Log in from the terminal (opens your browser):
   ```bash
   corepack pnpm --filter @kampung/web exec wrangler login
   ```
3. First deploy:
   ```bash
   corepack pnpm --filter @kampung/web deploy
   ```
   It prints your URL, like `https://hantu-kampung-pisang.<your-subdomain>.workers.dev`. Open it and play.

## Custom domain (optional)

Add your domain to Cloudflare (Websites, Add a domain), then Workers & Pages, hantu-kampung-pisang, Settings, Domains & Routes, Add, Custom domain.

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys on every push to `main`; `ci.yml` checks every other branch and PR.

1. Dashboard, My Profile, API Tokens, Create Token, template **Edit Cloudflare Workers**, then copy the token.
2. Find your Account ID on the Workers & Pages overview page (right side).
3. In the GitHub repo: Settings, Secrets and variables, Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Never commit the token. It only lives in GitHub secrets.

## Local checks

```bash
corepack pnpm --filter @kampung/web build      # writes apps/web/out (static export)
corepack pnpm --filter @kampung/web preview    # serves it through the real Workers runtime on :3100
```

## Notes

- Caching: `apps/web/public/_headers` sets immutable caching for `/_next/static/*` and a day for `/maps/*`.
- A 404 returns `404.html`. Config is `apps/web/wrangler.jsonc`.
- Free plan limits apply (Workers requests per day). The game itself is static files, so normal play barely touches them.
