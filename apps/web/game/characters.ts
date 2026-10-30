/**
 * Playable heroes. Purely cosmetic: every hero has identical stats (see core balance.ts).
 * `accent` tints the HUD card, the ground halo and the 2P marker; `look` feeds the select-screen figure.
 */
import { HERO_IDS, type HeroId } from "@kampung/protocol";

/** The ids are shared with the online server, which validates them. */
export const CHARACTERS = HERO_IDS;
export type Character = HeroId;

export const DEFAULT_CHARACTERS: Character[] = ["abu", "siti"];

interface Hero {
  name: string;
  /** 0xRRGGBB, bright enough to read on the night scene */
  accent: number;
  look: { skin: number; top: number; bottom: number; hair: number };
}

export const HEROES: Record<Character, Hero> = {
  abu: { name: "Abu", accent: 0x5aa0ff, look: { skin: 0xc68a5a, top: 0x2f62c0, bottom: 0x7a1f2a, hair: 0x111111 } },
  siti: { name: "Siti", accent: 0xff7ab8, look: { skin: 0xc68a5a, top: 0xe06a9a, bottom: 0xb84876, hair: 0xf4e2ec } },
  ahmeng: { name: "Ah Meng", accent: 0xff5a4a, look: { skin: 0xe0b890, top: 0xc0302a, bottom: 0x333844, hair: 0x15110d } },
  meiling: { name: "Mei Ling", accent: 0xffd24a, look: { skin: 0xe6bf9a, top: 0xe8c040, bottom: 0x2a6a80, hair: 0x15110d } },
  muthu: { name: "Muthu", accent: 0xffa03a, look: { skin: 0x8a5a38, top: 0xf0e8d8, bottom: 0x2a2a38, hair: 0x15110d } },
  kavitha: { name: "Kavitha", accent: 0x4fd88a, look: { skin: 0x93603c, top: 0x2e8a52, bottom: 0xd88a2a, hair: 0x15110d } },
  hamid: { name: "Pak Cik Hamid", accent: 0x9ab8e0, look: { skin: 0xb8805a, top: 0x5a7a9a, bottom: 0x6a3a2a, hair: 0xf2f2f2 } },
  kiah: { name: "Mak Cik Kiah", accent: 0xc88ae8, look: { skin: 0xc08a5a, top: 0x7a3a8a, bottom: 0x5a2a6a, hair: 0xd8c0e8 } },
};

export function characterIndex(c: Character): number {
  return CHARACTERS.indexOf(c);
}

export function characterName(c: Character): string {
  return HEROES[c].name;
}

export function hex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}
