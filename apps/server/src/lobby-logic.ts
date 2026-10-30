import { ROOM_CODE_ALPHABET, type RoomListing } from "@kampung/protocol";
import type { RoomSummary } from "./room-logic";

const CREATE_LIMIT = 5;
const CREATE_WINDOW_MS = 60_000;
const MAX_ROOMS = 500;
/** A room that stopped reporting (crashed or abandoned) is dropped from the list after this long. */
const STALE_MS = 15 * 60_000;

export type CreateResult = { ok: true; code: string } | { ok: false; reason: "rate_limited" | "busy" };

interface Entry {
  summary: RoomSummary;
  seenAt: number;
}

/** Registry of live rooms: hands out unique codes, lists open public rooms, limits abuse. */
export class LobbyLogic {
  private rooms = new Map<string, Entry>();
  private creates = new Map<string, number[]>();

  constructor(
    private readonly now: () => number,
    /** returns a float in [0, 1) */
    private readonly random: () => number,
  ) {}

  create(isPublic: boolean, ip: string): CreateResult {
    const now = this.now();
    this.prune(now);
    const recent = (this.creates.get(ip) ?? []).filter((t) => now - t < CREATE_WINDOW_MS);
    if (recent.length >= CREATE_LIMIT) return { ok: false, reason: "rate_limited" };
    if (this.rooms.size >= MAX_ROOMS) return { ok: false, reason: "busy" };

    let code = "";
    for (let tries = 0; tries < 50; tries++) {
      code = Array.from({ length: 4 }, () => ROOM_CODE_ALPHABET[Math.floor(this.random() * ROOM_CODE_ALPHABET.length)]!).join("");
      if (!this.rooms.has(code)) break;
      code = "";
    }
    if (!code) return { ok: false, reason: "busy" };

    recent.push(now);
    this.creates.set(ip, recent);
    this.rooms.set(code, {
      summary: { code, public: isPublic, state: "lobby", hostName: "", map: "kampung-pisang", players: 0 },
      seenAt: now,
    });
    return { ok: true, code };
  }

  /** For persisting the registry so a Durable Object restart does not forget live rooms. */
  snapshot(): { summary: RoomSummary; seenAt: number }[] {
    return [...this.rooms.values()].map((e) => ({ summary: e.summary, seenAt: e.seenAt }));
  }

  restore(entries: { summary: RoomSummary; seenAt: number }[]): void {
    for (const e of entries) this.rooms.set(e.summary.code, e);
  }

  update(summary: RoomSummary): void {
    if (this.rooms.has(summary.code)) this.rooms.set(summary.code, { summary, seenAt: this.now() });
  }

  remove(code: string): void {
    this.rooms.delete(code);
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  /** Public rooms that are still in the lobby with a free seat, newest activity first. */
  list(): RoomListing[] {
    this.prune(this.now());
    return [...this.rooms.values()]
      .filter((e) => e.summary.public && e.summary.state === "lobby" && e.summary.players > 0 && e.summary.players < 2)
      .sort((a, b) => b.seenAt - a.seenAt)
      .slice(0, 20)
      .map((e) => ({ code: e.summary.code, host: e.summary.hostName, map: e.summary.map, players: e.summary.players }));
  }

  private prune(now: number): void {
    for (const [code, e] of this.rooms) if (now - e.seenAt > STALE_MS) this.rooms.delete(code);
    for (const [ip, times] of this.creates) {
      const keep = times.filter((t) => now - t < CREATE_WINDOW_MS);
      if (keep.length === 0) this.creates.delete(ip);
      else this.creates.set(ip, keep);
    }
  }
}
