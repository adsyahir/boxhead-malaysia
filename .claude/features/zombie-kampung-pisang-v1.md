# Zombie Kampung Pisang v1: implementation plan

Spec: the design spec of 2026-10-30 (sections referenced as §N). This file is the branch memory. Update it as work proceeds.

## Environment findings (Step 0)

- Working dir `/Users/adsyahir/Desktop/Novosoft/boxhead-malaysia` is **empty**: no git repo, no CLAUDE.md, no vibe-profile, no prototype file. The spec's "working single-file prototype" is not here, so balance numbers come from the spec tables only.
- Node 22.23.1 OK. Docker 29.9.2 OK. **pnpm is broken**: corepack tries to download pnpm 12.5.1 and fails. Needs fixing before milestone M0 (`npm i -g pnpm@9` or `corepack prepare pnpm@9 --activate`).
- Not a git repo: commit style, protected branches and tracker are underivable. Proposed: `git init`, branch `feat/v1-game-core`, conventional commits, protected `main`, tracker none.

## Decisions taken (defaults, change if wrong)

- Package versions: Next 15 (App Router), Phaser 3.80+, Prisma 5/6, Vitest, Zod, Playwright, ESLint 9, TypeScript strict.
- `game-core` is plain ESM TS consumed by `apps/web` via workspace dependency (`transpilePackages`). Zero runtime deps.
- Core uses fixed `dt = 1/60`. `step()` mutates `World` in place and returns `GameEvent[]` (cheaper than immutable copy at 60 Hz; still deterministic).
- Seeded RNG: mulberry32. World holds RNG state, so snapshots are reproducible.
- Collision: circle vs grid (axis-separated resolve), circle vs circle for separation. Placeables write into a dynamic blocker layer over the static grid.
- Scoring and unlocks use team score (§4).
- Rate limit in route: in-memory Map keyed by IP (`CF-Connecting-IP` first).

## Milestones (each ends with tests green; the human gates between stages 2 → 3 → 4 …)

### M0. Repo and tooling (build order 1)
Files: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.js` (with `no-restricted-imports` for phaser/react/next/dom in game-core, plus a `Math.random` ban there), `.gitignore`, `.env.example`.
Exit: `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` all run (empty-green).

### M1. game-core skeleton (build order 1–2)
`rng.ts`, `world.ts` (World, createWorld, step, GameEvent, PlayerInput), `map/` (MapData, collision grid, circle-vs-grid), `entities/`, `data/balance.ts`, `data/enemies.ts`, `data/waves.ts`, `data/weapons.ts` (full table from §4 up front, so later milestones only add behaviour).
Systems in order: movement, collision, combat (Lastik projectile), enemy chase (straight line first), waves + spawn rules (≥160 px from players, 0.7 s rise invulnerability), scoring and combo, downed/revive/game over.
Tests: movement + wall collision, Lastik cooldown and damage, wave composition formula, spawn distance, combo window, game over, determinism (same seed + inputs ⇒ identical world hash).
Exit: vitest green, output pasted.

### M2. Rest of the simulation (build order 4)
Enemies: Pocong hop pulse, Toyol, Pontianak (slow near players, fireball projectile hurting players). Weapons: Uzi spread, Senapang Patah pellets with range cap, Pagar Buluh (HP, blocks, enemies attack it), Tong Gas (shootable, chain 0.14 s), Bom Ikan (fuse), Mercun Bola (arm delay), Meriam Buluh (rocket). Explosion system with falloff and knockback, no player damage. Unlock by team score + ammo grant to living players, auto-switch when out of ammo. Pickups (drop rates, ketupat, ammo box, +250 fallback, despawn 16 s/25 s, wave crate from wave 2). Flow field BFS (32 px, 8-dir, no corner cutting, rebuild every 0.25 s and on barricade dirty, direct chase within 60 px, circle separation).
Tests: one file per system, per §11 list.
Exit: vitest green. Coverage report on `game-core` pasted.

### M3. `validateRun` (part of build order 7, done early because it depends only on core data)
`validate-run.ts`: `maxScore(wave)`, min duration, kills ≤ spawned, nickname rules + Malay/English bad-word list. Accept and reject tests.

### M4. Phaser client (build order 3, 5, 6)
Next app skeleton, `PhaserGame.tsx` (dynamic, ssr false), fixed-timestep accumulator (cap 5), scenes Boot/Menu/MapSelect/Game/Hud/GameOver, placeholder box texture generation, entity views mirroring core, event-driven FX (particles, shake, hit flash), darkness overlay with light circles, depth sort by y, camera (1P lerp, 2P midpoint + zoom to 0.7), keyboard adapters (1P/2P maps per §7), touch adapter (joystick, Tembak/Tukar, rotate prompt, hide 2P on touch), audio manager (unlock on first gesture, mute M + HUD button + localStorage), Tiled loader to `MapData` and 3 maps in `public/maps/` (60×40, layers per §5), pause.
Maps: I can author Tiled JSON programmatically (script generating the 3 maps from a layout description) since Tiled GUI is not available to me. They will be playable but plain; the human can refine them in Tiled later. **Flagged risk.**
Audio: free SFX need sourcing. I will generate placeholder tones/noise via a script (no network downloads without your OK) and leave a `public/audio/README` listing the slots.
Exit: dev server runs, Playwright smoke test passes. Real play-feel is stage 3 (human).

### M5. Leaderboard (build order 7)
`packages/db` Prisma schema per §8 + initial migration. `app/api/scores` POST (Zod → validateRun → insert → rank) and GET (filters, limit, `Cache-Control: s-maxage=30`). In-memory rate limit. Game-over UI with nickname memory and retry state, `/leaderboard` page with filters.
Tests: route tests against a test Postgres (docker compose service for tests), every rejection rule, rate limit, ordering/filter.

### M6. Infra (build order 8)
`infra/Dockerfile` (Next standalone, runs `prisma migrate deploy` on start), `docker-compose.yml` (web, postgres + volume, nginx), `nginx.conf` (origin cert, proxy, static caching headers), nightly `pg_dump` cron script, `.github/workflows/ci.yml` (lint, typecheck, unit, API tests w/ postgres service) and `deploy.yml` (build → GHCR → SSH → compose pull/up). Cloudflare steps documented in `infra/README.md` since they are dashboard actions.
Exit: `docker compose build` succeeds locally; workflows pass `actionlint` if available. **Actual deploy needs your VPS host, domain, and secrets, and is not done by me.**

### M7. Art/audio swap (build order 9)
Out of reach for automation (MagicaVoxel renders, real SFX). Deliver the atlas lookup interface (`entityType + direction + animation`) in M4 so this is atlas-only later. Not built here.

## Order of work
M0 → M1 → M2 → M3 → (stage 3 checkpoint on core via a headless sim script) → M4 → M5 → M6. Stage 2 is run via subagent-driven-development, implementers on a cheaper model, no per-task commits.

## Risks
1. Scope: this is multiple weeks of work. Proposal: implement M0–M3 first (the portfolio-critical, fully testable core), then stop for your review before the Phaser client.
2. Game feel (speeds, spread, combo, difficulty) cannot be verified headlessly; needs your playtest.
3. Phaser/Next integration (SSR, StrictMode double mount destroying the game) needs care; handle in `PhaserGame.tsx` cleanup.
4. Procedurally generated maps and placeholder audio will look/sound rough.
5. Determinism breaks if anything uses `Date.now()`/`Math.random()` in core; lint rule + test guard it.
6. `Pagar Buluh` blocking all paths: flow field must handle unreachable players (enemies fall back to attacking the nearest barricade or going straight).

## Open questions for the human
1. OK to `git init` here and use branch `feat/v1-game-core`, protected `main`?
2. Should I fix pnpm (install pnpm 9 globally)? 
3. Scope for this run: M0–M3 only, or through M5?
4. Where is the prototype file? (Not in this directory; optional but useful for balance.)

## Log
- Stage 2 for M0-M3 done inline by the controller (no subagents): the tool rules here forbid spawning agents unless asked. Deviation from the skill default.
- git init, branch feat/v1-game-core, nothing committed yet (stage 5).
- pnpm works via `corepack pnpm` thanks to `packageManager: pnpm@9.15.9`; bare `pnpm` on PATH still hits the broken 12.5.1 shim.
- Revive position uses map.playerStarts (spec said "near map centre"); loader should put starts near centre.
- Barricades block enemies only (not players). Enemies path around them through the flow field; if sealed in, they go straight and chew the barricade.
- Barrels shot by a player explode on the next placeables pass; chained ones use the 0.14s delay.
- Cooldown compare uses epsilon 1e-9 to avoid float drift at 60 Hz.
- Tests: 68 passing (core, weapons, ai, validate-run). Lint, typecheck clean.
- Parked: no test yet for grenade-hitting-wall, 2P revive position collisions, Pontianak slow zone.

### M4 log (branch feat/v1-phaser-client)
- apps/web: Next 15 + Phaser 3.88. Routes /, /play, /leaderboard (placeholder, M5).
- Maps generated by `apps/web/scripts/generate-maps.mjs` (tiles.png + 3 Tiled JSON, all spawns verified reachable). Loader: `game/maps/index.ts` -> core MapData.
- Scenes: Boot, Menu, MapSelect, Game, Hud, GameOver. Fixed 60 Hz accumulator (cap 5). Core never touched by Phaser.
- Art through `render/atlas.ts` (placeholder boxes). SFX synthesised with WebAudio; mute on M / HUD button, saved in localStorage.
- Touch: joystick + Tembak/Tukar in Hud scene, 2P hidden on touch, rotate prompt via CSS. NOT tested on a real touch device.
- Canvas exposes data-scene/data-tick/data-players for the e2e test.
- Verified: typecheck, lint, 68 core tests, next build, Playwright smoke (system Chrome), manual run in the in-app browser of all 3 maps + 2P movement + downed + HUD. No console errors.
- Known gaps: GameOver has no nickname/submit yet (M5); camera zoom for 2P and the full 8-weapon feel unplaytested by a human; enemies do not rotate to face the player (placeholder).

### M4b 3D renderer (Three.js, uncommitted)
- New client in `apps/web/game3d/` (three 0.170). `/play` now mounts `game3d/Game3D.tsx`; the Phaser client moved to `/play2d` (home page has a small "Versi 2D" link). game-core untouched, no Phaser import in game3d.
- Scale mapping: 1 tile = 32 world px = 1 scene unit; world x -> scene x, world y -> scene z, +y up, ground top at y = 0 (`game3d/engine/coords.ts`).
- Loop identical to Phaser: fixed 60 Hz accumulator, max 5 steps/frame then drop backlog; no render interpolation.
- Look: everything is instanced unit boxes. Static map = 3 InstancedMeshes (ground, lit decor, unlit glow). Houses/surau/well/smokehouse/lorry are built per connected footprint from the decor layer and fill their collision footprint; trees/graves/posts/fences per tile; wakaf roofs over wood-floor patches; any solid tile without known decor becomes a stone block. Outside the fence: 9-tile band of trees (only low bushes on the south side so nothing tall sits between the camera and the bottom rows).
- Actors/props/particles/HP bars all go into 2 dynamic instanced batches (lit + glow) plus blob-shadow and halo quads, so actor count barely changes draw calls. Rigs in `engine/rigs.ts` (Abu songkok + baju melayu, Siti tudung + baju kurung, pocong hop/squash, toyol scurry, pontianak float + reaching arms + red eyes; rising from a dirt mound, hit flash, downed player lies on back).
- Camera: 56 deg pitch, FOV 38, frames ~18 x 10.5 tiles (tighter than Phaser's 25 x 14 so the models read); 2P midpoint follow, zoom out up to 1.45x; trauma shake on explosions/hurt.
- Lighting: hemisphere + dim moon (only shadow caster, 2048 PCF soft, follows camera focus), lantern point light per living player, N nearest pelita get real lights, small pool for muzzle/explosion/fireball/rocket lights. Fixed light counts (no shader recompiles). Touch devices: no shadows, 3 lamp + 2 dynamic lights; desktop: 6 + 4.
- Occlusion: decor material dithers away (Bayer discard) inside a cylinder between camera and each player, above 0.3 units; shadows unaffected.
- UI is React DOM: Menu / MapSelect (hover previews the map behind) / HUD / pause / GameOver, same Malay text and keys (1, 2, 1-3, Esc, P, M). Touch joystick + Tembak/Tukar as DOM pointer events writing the shared `touchState`. Shared framework-free input: `game/input/key-state.ts`, `game/input/touch-state.ts` (Phaser adapters now use them).
- Canvas exposes data-scene / data-tick / data-players (+ data-ms = smoothed CPU ms per frame). Debug only: `/play?zoom=0.4` (closer camera), `/play?debug` (exposes `window.__kppWorld()`).
- Verified: typecheck, lint, 68 core tests, next build, Playwright (3D via home + 2D at /play2d), in-app browser on all 3 maps, 2P, pause, game over -> Main Lagi, mobile portrait prompt and landscape touch. CPU ~1 ms/frame on the dev Mac at 1280x720.
- Known gaps: no render interpolation (fine at 60 Hz, slight judder possible on 120 Hz displays); enemies hidden behind houses are not see-through (only players get the dither circle); GPU cost on real phones unmeasured; at the 1.45x cap two far-apart players sit at the screen edge (same as Phaser); barricade orientation is guessed from the nearest player's facing at placement; no GameOver keyboard shortcut (same as Phaser). Pre-existing Phaser issue seen at /play2d: the night overlay does not cover the canvas on tall viewports.

## Resolution
(commit SHAs and PR numbers at stage 6)

## Online rooms (co-op, no login): plan (draft, awaiting owner decisions)

Spec section 10 listed online co-op as post-v1; the architecture was built for it. Owner asked for it on 2026-10-31: anonymous play, join a room.

### Design
- **Server-authoritative.** New `apps/server` (Node + `ws`) imports `game-core` and runs one `World` per room at 60 Hz (accumulator, cap 5). Clients send only `PlayerInput`; server clamps and validates it. Snapshots at 20 Hz (compact JSON arrays, ints), GameEvents batched with each snapshot.
- **No login.** Anonymous session token in localStorage (for reconnect within 30 s). Nickname 3-16 chars through the existing `validateNickname`.
- **Rooms.** 4-letter code, create/join, host picks map and starts, 2 players max (core has two heroes: Abu, Siti). Lobby with nicknames and ready state. Room closes when empty. Optional public room list.
- **Shared protocol package** `packages/protocol`: message types + Zod schemas used by both server and web.
- **Client.** New online screens in the 3D client (Cipta Bilik / Sertai Bilik, lobby). In online mode the engine does not call `step()`; it renders a `World`-shaped object rebuilt from snapshots with interpolation between the last two. No prediction in the first cut.
- **Core changes (small, tested).** `player.away` flag so a disconnected player is skipped by revive and game-over; `snapshotWorld()` / `applySnapshot()` helpers. Determinism and existing 68 tests must keep passing.
- **Abuse limits.** Per-IP connection and room-create rate limits, max rooms, max message size, ping/pong 25 s (Cloudflare idles at 100 s), schema-validated messages, drop on bad input.
- **Infra.** nginx WebSocket upgrade for `/ws`, compose service `server`, dev server on :3200 (`NEXT_PUBLIC_WS_URL`).

### Milestones
- N0 Commit M4 + 3D baseline first (owner approval needed).
- N1 Core: `away` flag, snapshot helpers, tests.
- N2 `packages/protocol`: messages, schemas, snapshot codec, tests.
- N3 `apps/server`: rooms, lobby, game loop, reconnect, limits; integration tests with real ws clients.
- N4 Client: network layer, online screens, remote world + interpolation.
- N5 Two-browser Playwright test, compose/nginx, docs.
- Later: client-side prediction for own player, server-submitted leaderboard scores (trustworthy), 3-4 players with new heroes, emotes/chat.

### Risks
- Latency feel without prediction (about RTT + one snapshot of delay). Add prediction if it feels bad.
- Bandwidth: 100 enemies at 20 Hz in JSON; quantise first, binary later if needed.
- Anonymous rooms invite spam; limits above, Cloudflare rules on top.
- Needs VPS port/proxy changes before it works live; local dev works without.

## Level + upgrade system (from owner's Boxhead "Upgrade List" screenshot, 2026-10-31)

Replaces score-based weapon unlocks. Level N unlocks a weapon or applies an upgrade. Transcribed from the image (name mapping to our weapons: Pistol=Lastik, UZI=Uzi, Shotgun=Senapang Patah, Barrel=Tong Gas, Grenade=Bom Ikan, Fake walls=Pagar Buluh, Claymore=Mercun Bola, Rocket=Meriam Buluh, Chargepack and Railgun are NEW):

| Lvl | Event | Lvl | Event | Lvl | Event |
|---|---|---|---|---|---|
| 3 | Pistol: Fast Fire | 41 | Shotgun: Quad Ammo | 66 | Rocket: Double Ammo |
| 5 | NEW Uzi (key 2) | 42 | Grenade: Double Ammo | 68 | Chargepack: Double Ammo |
| 8 | Pistol: Double Damage | 43 | Shotgun: Rapid Fire | 70 | NEW Railgun (key 0) |
| 10 | NEW Shotgun (key 3) | 44 | Barrel: Bigger Bang | 72 | Rocket: Big Bang |
| 13 | Uzi: Rapid Fire | 45 | Grenade: Big Bang | 74 | Chargepack: Big Bang |
| 15 | NEW Barrel (key 4) | 47 | Claymore: Cluster Explode | 76 | Chargepack: Quad Ammo |
| 17 | Uzi: Double Ammo | 48 | Uzi: Double Damage | 78 | Railgun: Fast Fire |
| 18 | Shotgun: Fast Fire | 50 | NEW Rocket (key 8) | 80 | Railgun: Double Ammo |
| 20 | NEW Grenade (key 5) | 51 | Shotgun: Wider Shot | 85 | Rocket: Quad Ammo |
| 21 | Shotgun: Double Ammo | 52 | Grenade: Quad Ammo | 90 | Uzi: Quad Damage |
| 23 | Uzi: Long Shot | 53 | Fake Wall: Quad Ammo | 95 | Chargepack: Bigger Bang |
| 26 | Barrel: Double Ammo | 54 | Claymore: Double Ammo | 100 | Railgun: Rapid Fire |
| 30 | NEW Fake walls (key 6) | 55 | NEW Chargepack (key 9) | 105 | Rocket: Bigger Bang |
| 31 | Shotgun: Wide Shot | 56 | Shotgun: Double Damage | 110 | Railgun: Quad Ammo |
| 32 | Barrel: Big Bang | 57 | Grenade: Bigger Bang | 120 | Rocket: Rapid Fire |
| 33 | Grenade: Cluster Explode | 58 | Claymore: Big Bang | 125 | Railgun: Long Shot |
| 35 | Shotgun: Long Shot | 59 | Rocket: Fast Fire | | |
| 36 | Barrel: Quad Ammo | 61 | Uzi: Infinite Range | | |
| 37 | Fake Wall: Double Ammo | 62 | Claymore: Bigger Bang | | |
| 39 | Uzi: Quad Ammo | 63 | Chargepack: Cluster Explode | | |
| 40 | NEW Claymore (key 7) | 64 | Claymore: Quad Ammo | | |

Upgrade effects to define in data (suggested): Fast Fire = cooldown x0.8, Rapid Fire = x0.65, Double/Quad Damage = x2/x4, Double/Quad Ammo = ammo grants x2/x4, Long Shot = range x1.5, Infinite Range = no range limit, Wide Shot = spread x1.4 and +pellets, Wider Shot = more again, Big/Bigger Bang = blast radius x1.25/x1.5 (and damage), Cluster Explode = explosion spawns 4 small secondary blasts.
Note: "Double/Quad X" stack as the list shows both on one weapon (e.g. Uzi: Double Ammo at 17, Quad Ammo at 39), so use the highest tier reached, not multiplicative stacking.


## Hosting change (2026-10-31): everything on Cloudflare, no VPS
Owner is worried the VPS would crash. M6 changes: no Docker/nginx/Postgres/VPS. Plan: static site on Workers assets (done, see `infra/CLOUDFLARE.md`), leaderboard as Worker + D1 (replaces Prisma + Postgres; raw SQL or Drizzle, decide at M5), online rooms as Durable Objects (one per room, runs game-core), GitHub Actions deploy via wrangler. Done now: `output: "export"`, `wrangler.jsonc`, `_headers`, ci.yml, deploy.yml, verified locally with `wrangler dev` (all routes 200, 404 page, game plays, e2e passes). Needs the owner: `wrangler login` + first deploy, API token and account id as GitHub secrets.
Backlog order now: 1) Cloudflare deploy (owner steps), 2) language switch Malay/English, 3) level + upgrade list, 4) leaderboard on D1, 5) online rooms on Durable Objects.

### Owner requests queued after Cloudflare (2026-10-31)
- Language switch Malay / English (all UI text; store choice in localStorage; default from browser language). Needs a small i18n layer shared by the 3D UI and the Phaser UI, and key-based strings instead of hard-coded Malay.
- Proper game-style flow: Main menu -> Start -> choose character (Abu / Siti; online later) -> map select -> play. Home page gets Settings (language, sound volume/mute, controls help, graphics quality), plus "many more like other games": How to Play, Leaderboard, Credits, and later Online. Settings persisted in localStorage.
- Open questions for the owner before building: which settings matter most; whether character choice is cosmetic only or changes stats; whether 2P picks a character per player.
