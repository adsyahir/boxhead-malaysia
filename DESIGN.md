# Design direction: Hantu Kampung Pisang

Status: **approved by the owner on 2026-10-31 as "keep the current look and record it"** (antislop audit 001, finding #3). The assistant wrote the descriptions below from what the game already does; the owner chose to keep it. Change this file first if the direction changes.

Design Read: *browser game for friends and casual players on phone and desktop, menus over a live 3D night scene, arcade-voxel style.* Dials: **ENERGY 2 / RHYTHM 1 / MOTION 1.**

## Identity and mood
A night in a Malaysian kampung with Malaysian ghosts. Dark, a little eerie, warm pools of lamplight, chunky voxel shapes. Menus are not separate pages: they sit over the same live 3D scene so the game feels like one place.

## Palette (3 core colours + 1 accent, plus status colours)
| Role | Value | Why |
|---|---|---|
| Night navy (page, panels) | `#0a0d16`, `#0e1426`, `#1c2640` | the scene is night; panels need to sit on it without glowing |
| Accent yellow | `#ffd24a` | pelita lamplight: the one warm colour, used for the primary action, titles, focus ring and level |
| Text | `#e6ecf7` main, `#8a9bb8` muted | 6.5:1 and above on every panel |
| Edge | `#8ba3d8` | component borders pass 3:1 so controls are findable |
| Status: danger `#d0584a` / `#ff9a8a`, good `#58b070` | | errors, selected state; always paired with text, never colour alone |
| Hero accents (8) | per hero in `game/characters.ts` | each hero's HUD card and halo carry their own colour; this is identity, not decoration |

## Type
- **Monospace** (`ui-monospace`, SF Mono, Menlo, Consolas) for the arcade voice: titles, buttons, numbers, room codes, the HUD. Reason: it matches the blocky voxel look, and codes and numbers read letter by letter.
- **System sans** for sentences (help text, notes, descriptions). Reason: monospace is tiring in paragraphs. No web fonts are downloaded.

## Shape, depth, motion
- Radius 6 to 10px on panels, cards and buttons. The only pill is the seat status tag, which marks a real state.
- Blur (glass) only on panels. Buttons and cards are solid. Shadows only where something floats above the scene (the HUD text, toasts).
- Motion: short hover lift on cards, a pop when the level number changes, toasts, fades between menu and game. Nothing loops. (MOTION 1.)
- Sound is part of the identity: a low drone and far-off wails on the menu; heartbeat and ghost voices when enemies are near.

## Rules this project keeps
- Keyboard focus is a 3px yellow ring with a 2px offset, on every control.
- Every control is at least 44px by 44px.
- Text and component contrast follow WCAG AA (4.5:1 text, 3:1 components); check with the antislop contrast checker.
- No fake statistics, testimonials or claims. The leaderboard shows real scores only.
- Copy is Malay first with English for every string (`apps/web/i18n/strings.ts`; a unit test keeps them in step).

## Keyboard notes
- The three small HUD corner buttons (pause, sound) are out of the Tab order on purpose: P, Esc and M do the same, and Tab must not steal focus from the game's own keys. The pause menu they open is fully reachable by keyboard: it moves focus to its first button, closes on Esc, and gives focus back.
