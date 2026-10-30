import { MAX_LEVEL, WEAPON_IDS, killsForLevel, type GameEvent, type WeaponId, type World } from "@kampung/game-core";
import { t, upgradeName, weaponName } from "../i18n";
import { DEFAULT_CHARACTERS, characterName, type Character } from "./characters";

export interface HudPlayer {
  name: string;
  character: Character;
  hp: number;
  maxHp: number;
  alive: boolean;
  weapon: WeaponId;
  ammo: number;
}

export interface HudState {
  players: HudPlayer[];
  score: number;
  /** Team level, and kills made / needed inside the current level (for the progress bar). */
  level: number;
  xpHave: number;
  xpNeed: number;
  wave: number;
  combo: number;
  phase: "break" | "wave";
  breakTimer: number;
  unlocked: WeaponId[];
  paused: boolean;
  enemiesLeft: number;
}

export const HUD_KEY = "hud";

/** Which hero each player slot uses in the current run (slot 0 = player 1). Set by the client that starts the run. */
let activeCharacters: Character[] = DEFAULT_CHARACTERS;

export function setActiveCharacters(chars: Character[]): void {
  activeCharacters = chars.length > 0 ? chars : DEFAULT_CHARACTERS;
}

function nameOf(slot: number): string {
  const c = activeCharacters[slot];
  return c ? characterName(c) : t("playerFallback");
}

/** Read-only snapshot of the World for the HUD (both clients). */
export function buildHudState(w: World, paused: boolean): HudState {
  return {
    players: w.players.map((p, i) => ({
      name: nameOf(i),
      character: activeCharacters[i] ?? DEFAULT_CHARACTERS[i % 2]!,
      hp: p.hp,
      maxHp: p.maxHp,
      alive: p.alive,
      weapon: p.weapon,
      ammo: p.ammo[p.weapon],
    })),
    score: w.score,
    level: w.level,
    xpHave: w.level >= MAX_LEVEL ? 1 : w.kills - killsForLevel(w.level),
    xpNeed: w.level >= MAX_LEVEL ? 1 : killsForLevel(w.level + 1) - killsForLevel(w.level),
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
    ? t("waveIn", { n: s.wave + 1, s: Math.max(0, Math.ceil(s.breakTimer)) })
    : `${t("waveN", { n: s.wave })}   ${t("enemiesLeft", { n: s.enemiesLeft })}`;
}

/** Localised toast text for a GameEvent, or null when the event has none. */
export function eventToast(e: GameEvent): string | null {
  switch (e.type) {
    case "pickup":
      return e.kind === "ketupat" ? t("toastKetupat") : t("toastAmmo");
    case "waveStarted":
      return t("toastWaveStart", { n: e.wave });
    case "waveCleared":
      return t("toastWaveClear", { n: e.wave });
    case "playerDowned":
      return t("toastDown", { name: nameOf(e.id) });
    case "playerRevived":
      return t("toastRevive", { name: nameOf(e.id) });
    case "levelUp": {
      // Only levels that give something get a toast; the HUD level number shows the rest.
      if (!e.reward) return null;
      const head = t("toastLevelUp", { n: e.level });
      if (e.reward.kind === "weapon") {
        const key = (WEAPON_IDS.indexOf(e.reward.weapon) + 1) % 10;
        return `${head} ${t("toastNewWeapon", { w: weaponName(e.reward.weapon), k: key })}`;
      }
      return `${head} ${t("toastUpgrade", { w: weaponName(e.reward.weapon), u: upgradeName(e.reward.upgrade) })}`;
    }
    default:
      return null;
  }
}
