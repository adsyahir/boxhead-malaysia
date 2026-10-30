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

## Resolution
(commit SHAs and PR numbers at stage 6)
