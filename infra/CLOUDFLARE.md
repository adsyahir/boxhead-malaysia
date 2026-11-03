# Deploying to Cloudflare (no VPS)

Everything runs on Cloudflare's edge, so there is no server of your own to crash. One Worker (`hantu-kampung-pisang`,
code in `apps/server`) serves the static website and also runs the online rooms.

| Part | Where | Status |
|---|---|---|
| Website and game (static export of `apps/web`) | Worker static assets | ready |
| Online rooms (no login, 2 players, code or public list) | Durable Objects: one `RoomDO` per room, one `LobbyDO` registry | ready, tested locally |
| Leaderboard + database | Worker + D1 (SQLite), `/api/scores` | ready, tested locally |

## One-time setup (you do this, it needs your Cloudflare login)

1. Make a free account at https://dash.cloudflare.com/sign-up.
2. Log in from the terminal (opens your browser):
   ```bash
   cd apps/server && npx wrangler login
   ```
3. First deploy (builds the site, then publishes the Worker with its Durable Objects):
   ```bash
   corepack pnpm ship
   ```
   It prints your URL, like `https://hantu-kampung-pisang.<your-subdomain>.workers.dev`. Open it and play. Open it on a
   second device, create a room on one and join from the other with the 4-letter code.

## The leaderboard database (D1)

`apps/server/wrangler.jsonc` declares a D1 database called `hantu-kampung-pisang` bound as `DB`. Locally wrangler creates it for you. On your first `corepack pnpm ship`, recent wrangler versions create the database on your account automatically; if yours asks for a `database_id`, run `cd apps/server && npx wrangler d1 create hantu-kampung-pisang`, paste the id into `wrangler.jsonc`, and deploy again. The table is created by the Worker the first time it is used, so there is no migration step.

- `POST /api/scores` takes a finished 1P or 2P run (nickname, score, wave, kills, map, mode, durationMs). It is checked against the same limits as the game (`validateRun`), the level must match the kills, and each sender may store 5 scores a minute.
- Online scores are never accepted from a browser. The room server saves the team score itself when a game ends, which is why those cannot be faked.
- `GET /api/scores?map=&mode=&limit=50` returns the best first and is cached for 30 seconds.
- See and clear data: `cd apps/server && npx wrangler d1 execute DB --remote --command "SELECT * FROM scores ORDER BY score DESC LIMIT 20"`.
- Every submit attempt (stored, rejected as invalid, or rate limited) is logged privately in `score_submissions` with the
  IP, Cloudflare's location (country, region, city), network (ASN and name), data centre and browser. It is never
  returned by the public API, and rows older than 90 days are deleted. Recent rejected attempts:
  `cd apps/server && npx wrangler d1 execute DB --remote --command "SELECT datetime(at/1000,'unixepoch') AS time, outcome, reason, nickname, score, ip, country, city, as_org FROM score_submissions WHERE outcome != 'stored' ORDER BY at DESC LIMIT 30"`.
  Remove a bad score: `... --command "DELETE FROM scores WHERE nickname = 'X'"`.

## Custom domain

`apps/server/wrangler.jsonc` declares `boxhead-hantu-kampung-pisang.adsyahir.com` as a Worker Custom Domain (`routes` with
`custom_domain: true`), so every deploy attaches it and Cloudflare manages its DNS record. Do not also add a CNAME or A
record for that name by hand: a hand-made record that points at the `workers.dev` name gives error 1016 (the whole site,
including score submit, fails) and makes the deploy refuse to attach the domain. To use another domain, change the pattern;
the domain's zone must be on the same Cloudflare account.
`workers_dev: true` keeps `https://hantu-kampung-pisang.<subdomain>.workers.dev` working as a backup; without it, a
config with a route turns that address off.

## Automatic deploys from GitHub

`.github/workflows/deploy.yml` deploys on every push to `main`; `ci.yml` checks every other branch and PR.

1. Dashboard, My Profile, API Tokens, Create Token, template **Edit Cloudflare Workers**, then copy the token.
2. Find your Account ID on the Workers & Pages overview page (right side).
3. In the GitHub repo: Settings, Secrets and variables, Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Never commit the token. It only lives in GitHub secrets.

## Local development

```bash
corepack pnpm --filter @kampung/web dev     # pages on http://localhost:3000 (hot reload)
corepack pnpm dev:online                    # online server on http://localhost:8787 (needs apps/web/out: run build:web once)
```

On `localhost` the page finds the Worker on :8787 by itself. `corepack pnpm build:web && corepack pnpm dev:online` also serves the
whole site from :8787, exactly like production.

## How online play works (for debugging)

- `POST /api/rooms {public}` creates a room and returns a 4-letter code; `GET /api/rooms` lists open public rooms.
- `GET /ws?room=CODE` upgrades to a websocket owned by that room's Durable Object, which runs the real game (`game-core`)
  at 60 Hz and sends snapshots at 20 Hz. Clients only send their input.
- A dropped player is downed and can rejoin with the token the browser keeps for 30 seconds, coming back at the next wave.
- Limits: 5 rooms per minute per IP, 2 players per room, 500 live rooms, 120-message burst per player, messages over 2 KB dropped.

## Notes

- Caching: `apps/web/public/_headers` sets immutable caching for `/_next/static/*` and a day for `/maps/*`.
- Free-plan limits apply (requests per day, Durable Object duration while a room is being played). See Cloudflare's Durable Objects pricing page before sharing the link widely.
- The server bundles the three Tiled maps at build time, so server and client always agree on walls and spawns.
