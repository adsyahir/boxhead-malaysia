import { WEAPONS, type GameEvent, type WeaponId, type World } from "@kampung/game-core";

export interface HudPlayer {
  name: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  weapon: WeaponId;
  ammo: number;
}

export interface HudState {
  players: HudPlayer[];
  score: number;
  wave: number;
  combo: number;
  phase: "break" | "wave";
  breakTimer: number;
  unlocked: WeaponId[];
  paused: boolean;
  enemiesLeft: number;
}

export const HUD_KEY = "hud";

/** Shared by the Phaser and Three.js clients. */
export const PLAYER_NAMES = ["Abu", "Siti"];

/** Read-only snapshot of the World for the HUD (both clients). */
export function buildHudState(w: World, paused: boolean): HudState {
  return {
    players: w.players.map((p, i) => ({
      name: PLAYER_NAMES[i] ?? `P${i + 1}`,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      weapon: p.weapon,
      ammo: p.ammo[p.weapon],
    })),
    score: w.score,
    wave: w.wave,
    combo: w.combo,
    phase: w.phase,
    breakTimer: w.breakTimer,
    unlocked: [...w.unlocked],
    paused,
    enemiesLeft: w.enemies.length + w.queue.length,
  };
}

export function waveLabel(s: HudState): string {
  return s.phase === "break"
    ? `Gelombang ${s.wave + 1} dalam ${Math.max(0, Math.ceil(s.breakTimer))}`
    : `Gelombang ${s.wave}   Musuh ${s.enemiesLeft}`;
}

/** Malay toast text for a GameEvent, or null when the event has none. */
export function eventToast(e: GameEvent): string | null {
  switch (e.type) {
    case "pickup":
      return e.kind === "ketupat" ? "Ketupat! +30 HP" : "Peluru dikutip";
    case "waveStarted":
      return `Gelombang ${e.wave}`;
    case "waveCleared":
      return `Gelombang ${e.wave} selesai`;
    case "playerDowned":
      return `${PLAYER_NAMES[e.id] ?? "Pemain"} tumbang!`;
    case "playerRevived":
      return `${PLAYER_NAMES[e.id] ?? "Pemain"} bangkit semula`;
    case "weaponUnlocked":
      return `Senjata baru: ${WEAPONS[e.weapon].name}`;
    default:
      return null;
  }
}
