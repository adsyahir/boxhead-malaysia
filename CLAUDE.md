# Zombie Kampung Pisang

Boxhead 2Play style top-down zombie shooter with a Malaysian kampung theme (pocong, toyol, pontianak). Local 2P on one keyboard, 1P touch on mobile, online leaderboard. Portfolio piece: monorepo, typed core, tests, CI/CD, self-hosted on a VPS behind Cloudflare. UI text is Malay.

Full design spec: the "Zombie Kampung Pisang: Design Spec" of 2026-10-30. Plan and decision log: `.claude/features/zombie-kampung-pisang-v1.md` (read it first). Notion project page (owner keeps tasks there): https://app.notion.com/p/4091ce1f20bd80669961c9c4c96af802

## Commands (IMPORTANT)

Bare `pnpm` is a broken shim on this machine. Always use `corepack pnpm` (pinned to 9.15.9 by `packageManager`).

```bash
corepack pnpm install
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test                                   # game-core vitest, 68 tests
corepack pnpm --filter @kampung/web dev              # http://localhost:3000/play
cd apps/web && corepack pnpm exec next build
cd apps/web && CI= corepack pnpm exec playwright test   # smoke test, uses installed Chrome, dev server on :3100
corepack pnpm --filter @kampung/web maps             # regenerate tiles.png + 3 Tiled JSON maps
```

`.claude/launch.json` defines a "web" dev server on port 3100 for the Claude Browser pane.

## Architecture

```
packages/game-core   pure TS simulation, no Phaser/React/DOM (lint-enforced), seeded RNG, fixed 60 Hz
  src/world.ts       createWorld(), step(world, inputs, dt) -> GameEvent[] (mutates in place)
  src/systems/       players, enemies, projectiles, placeables, pickups, waves, combat, flowfield
  src/data/          weapons.ts, enemies.ts, waves.ts, balance.ts (all balance numbers)
  src/validate-run.ts  anti-cheat + nickname rules, shared with the future API
apps/web             Next 15 App Router + client
  game/              Phaser 3 client (scenes, render, input, audio, maps loader)
  game3d/            Three.js 3D client, see "3D redesign" below
  public/maps/       tiles.png + kampung-pisang / kebun-getah / tanah-perkuburan .json (generated)
  scripts/generate-maps.mjs   generates the maps; gid meanings are in this file
  e2e/smoke.spec.ts  Playwright smoke test (relies on canvas data-scene / data-tick / data-players)
packages/db          (not created yet) Prisma
infra/CLOUDFLARE.md  deploy guide. Hosting is Cloudflare only (static site now; D1 + Durable Objects later). No VPS.
```

Rules that must hold (they are what make future online co-op possible):
1. `game-core` never imports Phaser, React, Next, three or the DOM, and never uses `Math.random` or `Date.now`.
2. Renderers only read input and draw. They never mutate the World.
3. Every random value in core goes through the seeded RNG in `rng.ts`.

Coordinates: core is 2D pixels (map 60x40 tiles of 32 px = 1920x1280). Renderers map world y to their own depth axis.

## Status

Done and committed on `main` (pushed to https://github.com/adsyahir/boxhead-malaysia): M0-M3. Monorepo, full `game-core` (3 enemies, 8 weapons, pickups, flow field with barricades, waves, combo, revive, game over), `validateRun`. 68 tests pass.

Done but NOT committed (branch `feat/v1-phaser-client`, nothing has been committed since M3): M4, the Phaser client in `apps/web`: menu, map select, 3 generated maps, HUD, night lighting, camera (2P zoom), particles/shake, synthesised WebAudio SFX (mute on M, saved in localStorage), keyboard 1P/2P and touch controls, rotate prompt, Playwright smoke test. Verified: typecheck, lint, tests, next build, e2e, manual run of all 3 maps with no console errors. Not verified: touch on a real device, 2P camera feel, feel of all 8 weapons (needs a human playtest).

### 3D client (built, uncommitted)
`/play` is now a Three.js 3D client in `apps/web/game3d/` (built by Opus 5.5 after Fable was unavailable); the Phaser client moved to `/play2d`. `game-core` is unchanged. Voxel/low-poly boxes (all InstancedMesh), 3/4 camera (~56 degree pitch, about 18x10.5 tiles visible), night scene (moon shadows, pelita point lights), React DOM menus/HUD, touch controls, see-through dither when a player stands behind a house. Scale: 1 tile = 32 world px = 1 scene unit; world x -> scene x, world y -> scene z. Shared framework-free input in `apps/web/game/input/key-state.ts` and `touch-state.ts`. Debug: `/play?debug` exposes `window.__kppWorld()`, `?zoom=0.4` moves the camera closer; canvas has `data-scene`, `data-tick`, `data-players`, `data-ms`.
Verified independently by the controller: typecheck, lint, 68 core tests, next build, Playwright (2 tests: 3D and /play2d) all pass. Opus also played all 3 maps, 2P, pause/mute, game over and mobile landscape in the browser.
Known gaps: no human playtest of feel/frame rate yet (the browser pane throttles to ~1.5 fps when hidden); enemies behind houses/canopies stay hidden (Kebun Getah canopies cover a lot); barricade orientation is guessed from nearest player facing; no render interpolation (judder on 120 Hz); 3D shows less of the map than the Phaser view (tune `VIEW_W`/`VIEW_H` in `game3d/engine/camera.ts`); Phaser `/play2d` night overlay does not fill a very tall viewport.

## Not built yet (build order from the spec)
- M5 Leaderboard: `packages/db` Prisma schema (Score model in spec section 8), `POST/GET /api/scores` (Zod, `validateRun`, in-memory 5/min/IP rate limit, GET cached 30 s), game-over nickname submit UI with retry ("Tak dapat hantar markah, cuba lagi"), `/leaderboard` page with map and mode filters, API tests against a test Postgres.
- M6 Infra: CHANGED to Cloudflare-only (owner fears VPS crashes). Static site config + GitHub Actions + guide are written (see `infra/CLOUDFLARE.md`); owner still has to run `wrangler login`, first deploy, and add `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets. Leaderboard will be Worker + D1 (not Prisma/Postgres), online rooms Durable Objects.
- M7 Voxel sprites and real audio. Art goes through one lookup (`apps/web/game/render/atlas.ts`) so swapping is atlas-only.
- Known gaps: game over screen has no nickname/submit yet; enemies do not face the player in the Phaser version; Pagar Buluh edge cases when a player is fully sealed in; unit tests missing for grenade vs wall, 2P revive collisions, Pontianak slow zone.

## Decisions and gotchas
- Revived players spawn at `map.playerStarts` (spec said near centre); the maps put starts at the centre.
- Barricades block enemies only, not players. Enemies path around them via the flow field; if sealed in they go straight and chew the barricade.
- Phaser must be imported as `import * as Phaser from "phaser"`; the default import breaks Next dev.
- Phaser is only imported inside a `useEffect` dynamic import (`PhaserGame.tsx`), cancelled flag handles React StrictMode double mount.
- Maps are generated procedurally (plain, all spawns verified reachable); refine in Tiled later. Audio is synthesised placeholders.
- Workflow the owner uses: vibe-workflow skill. Plan, implement (tests green, show real output), human E2E, review, grouped commits with approval, push, ticket only when asked. Commit style: conventional commits (`feat(game-core): ...`), trailer `Co-Authored-By: Claude ... <noreply@anthropic.com>`. The owner has explicitly allowed direct pushes to `main` on this repo ("just push to main, don't open PR"); do not assume that carries over to other repos or branches.
- Fable (claude-fable-5-1) needs usage credits in the Claude desktop app. The owner wants to use it from the Claude Code terminal.

## Next steps (owner's order, 2026-10-31)
0. Owner: first Cloudflare deploy. Then Malay/English language switch, then main menu flow (Start -> character select; Settings, How to Play, Credits on home page), then level + upgrade list (table in feature file), then leaderboard on D1, then online rooms (2 players, code + public list, Durable Objects).

## Older next steps
1. Playtest the 3D version at /play (and /play2d), note feel problems.
2. Review and commit M4 + 3D in grouped commits (ask before committing). Suggested groups: input refactor + Phaser client, generated maps/tileset, 3D engine, 3D UI, e2e/config.
3. M5 leaderboard, then M6 infra.
4. Update the Notion project page when milestones finish.
