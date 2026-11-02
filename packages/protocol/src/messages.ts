import { z } from "zod";
import type { GameEvent } from "@kampung/game-core";
import type { Snapshot } from "./snapshot";

/** Heroes are cosmetic; the server only checks the id is one of these. */
export const HERO_IDS = ["abu", "siti", "ahmeng", "meiling", "muthu", "kavitha", "hamid", "kiah"] as const;
export type HeroId = (typeof HERO_IDS)[number];

export const MAP_IDS = ["kampung-pisang", "kebun-getah", "tanah-perkuburan"] as const;
export type MapId = (typeof MAP_IDS)[number];

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ"; // no I, L, O: easy to read out loud
export const ROOM_CODE_RE = /^[A-HJKMNP-Z]{4}$/;
export const ROOM_SLOTS = 2;

export const NET = {
  /** Client sends its input at most this often. */
  inputHz: 30,
  /** The server sends a snapshot every N simulation ticks (60 Hz / 3 = 20 Hz). */
  snapshotEveryTicks: 3,
  pingMs: 20_000,
  reconnectGraceMs: 30_000,
  maxMessageBytes: 2048,
} as const;

export type Slot = 0 | 1;

export interface LobbyPlayer {
  slot: Slot;
  name: string;
  hero: HeroId;
  ready: boolean;
  connected: boolean;
}

export type RoomState = "lobby" | "playing" | "over";

export interface RunResult {
  score: number;
  wave: number;
  kills: number;
  /** Team level reached. */
  level: number;
  durationMs: number;
  map: MapId;
}

export type ErrorCode = "bad_message" | "no_room" | "room_full" | "bad_name" | "not_host" | "not_ready" | "in_progress" | "rate_limited" | "busy";

// ---------- client -> server ----------
const num = z.number().finite();

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("hello"), name: z.string().max(40), token: z.string().max(64).optional() }),
  z.object({ t: z.literal("hero"), hero: z.enum(HERO_IDS) }),
  z.object({ t: z.literal("ready"), ready: z.boolean() }),
  z.object({ t: z.literal("map"), map: z.enum(MAP_IDS) }),
  z.object({ t: z.literal("start") }),
  z.object({
    t: z.literal("input"),
    seq: z.number().int().min(0).max(2_000_000_000),
    mx: num.min(-1).max(1),
    my: num.min(-1).max(1),
    /** Twin-stick aim (touch right stick). Omitted when not aiming: facing then follows movement. */
    ax: num.min(-1).max(1).optional(),
    ay: num.min(-1).max(1).optional(),
    fire: z.boolean(),
    swap: z.boolean(),
    /** Counts weapon-swap key presses, so a tap shorter than one input interval is not lost. */
    taps: z.number().int().min(0).max(2_000_000_000),
    /** Direct weapon pick for one input (0..9 = keys 1..9, 0). Omitted when no number key was pressed. */
    sel: z.number().int().min(0).max(9).optional(),
  }),
  z.object({ t: z.literal("ping"), n: z.number().int().min(0).max(2_000_000_000) }),
  z.object({ t: z.literal("leave") }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

/** Parse one raw websocket message. Returns null for anything oversized, malformed or unknown. */
export function parseClientMsg(raw: unknown): ClientMsg | null {
  if (typeof raw !== "string" || raw.length > NET.maxMessageBytes) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const r = ClientMsgSchema.safeParse(json);
  return r.success ? r.data : null;
}

// ---------- server -> client ----------
export type ServerMsg =
  | { t: "welcome"; slot: Slot; code: string; token: string }
  | {
      t: "lobby";
      state: RoomState;
      code: string;
      public: boolean;
      host: Slot;
      map: MapId;
      players: (LobbyPlayer | null)[];
    }
  | { t: "start"; map: MapId; seed: number; heroes: HeroId[]; you: Slot }
  | { t: "snap"; s: Snapshot; e: GameEvent[] }
  | { t: "over"; run: RunResult }
  /** The team score of the finished online run was stored (rank in the online board for that map), or could not be (null). */
  | { t: "saved"; rank: number | null }
  | { t: "error"; code: ErrorCode; msg: string }
  | { t: "pong"; n: number };

// ---------- HTTP (room list / create) ----------
export interface RoomListing {
  code: string;
  host: string;
  map: MapId;
  players: number;
}

export const CreateRoomSchema = z.object({ public: z.boolean() });
