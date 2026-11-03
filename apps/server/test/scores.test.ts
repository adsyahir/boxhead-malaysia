import { describe, expect, it } from "vitest";
import { levelForKills, maxScore, totalSpawned } from "@kampung/game-core";
import type { MapId } from "@kampung/protocol";
import { SUBMIT_LIMIT, SUBMIT_WINDOW_MS, TICKET_LIMIT, TICKET_MAX_AGE_MS, checkSubmission, issueTicket, saveOnlineScore, submitScore, type NewScore, type ScoreMode, type ScoreRow, type ScoreStore, type SubmissionLog, type SubmitTrace } from "../src/scores";

class MemoryStore implements ScoreStore {
  rows: { row: NewScore; ip: string | null; at: number }[] = [];
  async insert(row: NewScore, ip: string | null, now: number) {
    this.rows.push({ row, ip, at: now });
  }
  async countHigher(map: MapId, mode: ScoreMode, score: number) {
    return this.rows.filter((r) => r.row.map === map && r.row.mode === mode && r.row.score > score).length;
  }
  async top(map: MapId | null, mode: ScoreMode | null, limit: number): Promise<ScoreRow[]> {
    return this.rows
      .filter((r) => (!map || r.row.map === map) && (!mode || r.row.mode === mode))
      .sort((a, b) => b.row.score - a.row.score || a.at - b.at)
      .slice(0, limit)
      .map((r) => ({ nickname: r.row.nickname, score: r.row.score, wave: r.row.wave, kills: r.row.kills, level: r.row.level, map: r.row.map, mode: r.row.mode, durationMs: r.row.durationMs, createdAt: r.at }));
  }
  async recentFrom(ip: string, since: number) {
    return this.rows.filter((r) => r.ip === ip && r.at > since).length;
  }
  tickets = new Map<string, { map: MapId; ip: string; at: number; used: boolean }>();
  async addTicket(id: string, map: MapId, ip: string, now: number) {
    this.tickets.set(id, { map, ip, at: now, used: false });
  }
  async recentTickets(ip: string, since: number) {
    return [...this.tickets.values()].filter((t) => t.ip === ip && t.at > since).length;
  }
  async useTicket(id: string) {
    const t = this.tickets.get(id);
    if (!t || t.used) return null;
    t.used = true;
    return { issuedAt: t.at, map: t.map };
  }
  log: SubmissionLog[] = [];
  failLog = false;
  async logSubmission(e: SubmissionLog) {
    if (this.failLog) throw new Error("log down");
    this.log.push(e);
  }
}

const good = { nickname: "Abu Test", score: 5000, wave: 3, kills: 30, map: "kampung-pisang", mode: "1p", durationMs: 90_000, ticket: "00000000-0000-4000-8000-000000000000" };

let nextTicket = 1;
/** The body with a fresh ticket in the store, issued exactly the run's length before `now` (as a real run would). */
function ticketed(store: MemoryStore, body: Record<string, unknown>, now: number): Record<string, unknown> {
  const id = `00000000-0000-4000-8000-${String(nextTicket++).padStart(12, "0")}`;
  const duration = typeof body.durationMs === "number" ? body.durationMs : 0;
  void store.addTicket(id, (body.map as MapId) ?? "kampung-pisang", "issuer", now - duration);
  return { ...body, ticket: id };
}

describe("checkSubmission", () => {
  it("accepts a plausible run and works out the level from the kills", () => {
    const r = checkSubmission(good);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data).toMatchObject({ nickname: "Abu Test", score: 5000, wave: 3, level: levelForKills(30), source: "client" });
    }
  });

  it("accepts a level that agrees with the kills and refuses one that does not", () => {
    expect(checkSubmission({ ...good, level: levelForKills(30) }).ok).toBe(true);
    expect(checkSubmission({ ...good, level: levelForKills(30) + 5 })).toEqual({ ok: false, reason: "Level does not match kills" });
  });

  it.each([
    ["name too short", { nickname: "ab" }],
    ["name with symbols", { nickname: "<b>hi</b>" }],
    ["rude name", { nickname: "Babi123" }],
    ["empty run", { score: 0, kills: 0 }],
    ["score above the possible maximum", { score: maxScore(3) + 1 }],
    ["run too short for its wave", { durationMs: 29_999 }],
    ["more kills than enemies spawned", { kills: totalSpawned(3) + 1 }],
    ["fractional score", { score: 10.5 }],
    ["negative kills", { kills: -1 }],
    ["unknown map", { map: "../../etc" }],
    ["browsers cannot submit online scores", { mode: "online" }],
    ["score is a string", { score: "5000" }],
    ["absurdly large number", { score: 1e15 }],
  ])("rejects: %s", (_n, patch) => {
    expect(checkSubmission({ ...good, ...patch }).ok).toBe(false);
  });

  it.each([null, undefined, "x", 5, [], {}])("rejects a body that is %j", (body) => {
    expect(checkSubmission(body).ok).toBe(false);
  });

  it("treats wave 0 as wave 1", () => {
    const r = checkSubmission({ ...good, wave: 0, durationMs: 10_000, score: 100, kills: 1 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.wave).toBe(1);
  });
});

describe("submitScore", () => {
  it("ranks by score within a board, and boards are separate", async () => {
    const store = new MemoryStore();
    expect(await submitScore(store, ticketed(store, { ...good, score: 3000 }, 1000), "ip1", 1000)).toEqual({ ok: true, rank: 1 });
    expect(await submitScore(store, ticketed(store, { ...good, score: 5000 }, 1001), "ip2", 1001)).toEqual({ ok: true, rank: 1 });
    expect(await submitScore(store, ticketed(store, { ...good, score: 4000 }, 1002), "ip3", 1002)).toEqual({ ok: true, rank: 2 });
    expect(await submitScore(store, ticketed(store, { ...good, score: 4000 }, 1003), "ip4", 1003)).toEqual({ ok: true, rank: 2 }); // a tie shares the rank
    expect(await submitScore(store, ticketed(store, { ...good, score: 2400, mode: "2p" }, 1004), "ip5", 1004)).toEqual({ ok: true, rank: 1 }); // another board
    expect(await submitScore(store, ticketed(store, { ...good, score: 2400, map: "kebun-getah" }, 1005), "ip6", 1005)).toEqual({ ok: true, rank: 1 });
  });

  it("returns a 400 with the reason for a bad score and stores nothing", async () => {
    const store = new MemoryStore();
    const r = await submitScore(store, ticketed(store, { ...good, score: maxScore(3) + 1 }, 1000), "ip1", 1000);
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(store.rows).toHaveLength(0);
  });

  it("allows 5 submissions a minute per sender, then 429, then allows again", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < SUBMIT_LIMIT; i++) expect((await submitScore(store, ticketed(store, { ...good, score: 3000 + i * 10 }, 1000 + i), "same", 1000 + i)).ok).toBe(true);
    expect(await submitScore(store, ticketed(store, good, 2000), "same", 2000)).toMatchObject({ ok: false, status: 429 });
    expect((await submitScore(store, ticketed(store, good, 2000), "someone-else", 2000)).ok).toBe(true);
    expect((await submitScore(store, ticketed(store, good, 1000 + SUBMIT_WINDOW_MS + 10), "same", 1000 + SUBMIT_WINDOW_MS + 10)).ok).toBe(true);
  });

  it("rejected scores do not use up the rate limit", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 10; i++) await submitScore(store, ticketed(store, { ...good, nickname: "x" }, 1000 + i), "same", 1000 + i);
    expect((await submitScore(store, ticketed(store, good, 2000), "same", 2000)).ok).toBe(true);
  });
});

describe("saveOnlineScore (the room server vouches for these)", () => {
  const run = { score: 8000, wave: 6, kills: 120, durationMs: 400_000, map: "kebun-getah" as MapId };

  it("stores the team under both names, in the online board, with the level from the kills", async () => {
    const store = new MemoryStore();
    const rank = await saveOnlineScore(store, run, ["Abu", "Siti"], 5000);
    expect(rank).toBe(1);
    expect(store.rows[0]!.row).toMatchObject({ nickname: "Abu & Siti", mode: "online", source: "server", level: levelForKills(120), map: "kebun-getah" });
    expect(store.rows[0]!.ip).toBeNull();
  });

  it("ranks against other online runs on the same map only", async () => {
    const store = new MemoryStore();
    await saveOnlineScore(store, { ...run, score: 9000 }, ["A", "B"], 1);
    expect(await saveOnlineScore(store, run, ["C", "D"], 2)).toBe(2);
    expect(await saveOnlineScore(store, { ...run, map: "kampung-pisang" }, ["C", "D"], 3)).toBe(1);
  });

  it("does not store an empty run, and keeps long names within 40 characters", async () => {
    const store = new MemoryStore();
    expect(await saveOnlineScore(store, { ...run, score: 0 }, ["Abu", "Siti"], 1)).toBeNull();
    expect(store.rows).toHaveLength(0);
    await saveOnlineScore(store, run, ["Sixteen Chars Nm1", "Sixteen Chars Nm2", "extra"], 2);
    expect(store.rows[0]!.row.nickname.length).toBeLessThanOrEqual(40);
  });
});

describe("the board", () => {
  it("lists the best first, older first on a tie, filters by map and mode, and honours the limit", async () => {
    const store = new MemoryStore();
    await submitScore(store, ticketed(store, { ...good, nickname: "Old Tie", score: 4000 }, 1), "a", 1);
    await submitScore(store, ticketed(store, { ...good, nickname: "New Tie", score: 4000 }, 2), "b", 2);
    await submitScore(store, ticketed(store, { ...good, nickname: "Best", score: 6000 }, 3), "c", 3);
    await submitScore(store, ticketed(store, { ...good, nickname: "Other Map", score: 9000, map: "kebun-getah" }, 4), "d", 4);
    await submitScore(store, ticketed(store, { ...good, nickname: "Two Player", score: 7000, mode: "2p" }, 5), "e", 5);

    expect((await store.top("kampung-pisang", "1p", 50)).map((r) => r.nickname)).toEqual(["Best", "Old Tie", "New Tie"]);
    expect((await store.top("kampung-pisang", "1p", 2)).map((r) => r.nickname)).toEqual(["Best", "Old Tie"]);
    expect((await store.top(null, "2p", 50)).map((r) => r.nickname)).toEqual(["Two Player"]);
    expect((await store.top(null, null, 50))[0]!.nickname).toBe("Other Map");
  });
});

describe("private submission log", () => {
  const trace: SubmitTrace = { ip: "203.0.113.7", country: "MY", region: "Selangor", city: "Shah Alam", asn: 4788, asOrg: "TM Net", colo: "KUL", userAgent: "Mozilla/5.0" };

  it("records stored and rejected attempts with where they came from", async () => {
    const store = new MemoryStore();
    await submitScore(store, ticketed(store, good, 1000), "h1", 1000, trace);
    await submitScore(store, ticketed(store, { ...good, score: 9_999_990 }, 2000), "h1", 2000, trace); // edited in transit
    await submitScore(store, ticketed(store, { ...good, nickname: "kote" }, 3000), "h1", 3000, trace);
    expect(store.log.map((e) => [e.outcome, e.reason, e.nickname, e.score])).toEqual([
      ["stored", null, "Abu Test", 5000],
      ["invalid", "Score too high for wave", "Abu Test", 9_999_990],
      ["invalid", "Nickname not allowed", "kote", 5000],
    ]);
    expect(store.log[0]).toMatchObject({ ip: "203.0.113.7", country: "MY", city: "Shah Alam", asOrg: "TM Net", at: 1000 });
  });

  it("logs rate-limited attempts and junk bodies too", async () => {
    const store = new MemoryStore();
    for (let i = 0; i <= SUBMIT_LIMIT; i++) await submitScore(store, ticketed(store, { ...good, score: 3000 + i * 10 }, 1000 + i), "same", 1000 + i, trace);
    await submitScore(store, "not json at all", "same", 5000, trace);
    expect(store.log.at(-2)!.outcome).toBe("rate_limited");
    expect(store.log.at(-1)).toMatchObject({ outcome: "invalid", nickname: null, score: null });
  });

  it("never fails a real submission because the log is down", async () => {
    const store = new MemoryStore();
    store.failLog = true;
    expect(await submitScore(store, ticketed(store, good, 1000), "h1", 1000, trace)).toEqual({ ok: true, rank: 1 });
  });

  it("is not part of the public scores", async () => {
    const store = new MemoryStore();
    await submitScore(store, ticketed(store, good, 1000), "h1", 1000, trace);
    expect(JSON.stringify(await store.top(null, null, 10))).not.toContain("203.0.113.7");
  });
});

describe("run tickets", () => {
  const map = "kampung-pisang";

  it("are handed out per map and limited per sender", async () => {
    const store = new MemoryStore();
    let n = 0;
    const id = () => `00000000-0000-4000-9000-${String(n++).padStart(12, "0")}`;
    expect(await issueTicket(store, { map }, "s1", 1000, id)).toEqual({ ok: true, ticket: "00000000-0000-4000-9000-000000000000" });
    expect((await issueTicket(store, { map: "nowhere" }, "s1", 1000, id)).ok).toBe(false);
    for (let i = 1; i < TICKET_LIMIT; i++) expect((await issueTicket(store, { map }, "s1", 1000 + i, id)).ok).toBe(true);
    expect(await issueTicket(store, { map }, "s1", 2000, id)).toMatchObject({ ok: false, status: 429 });
    expect((await issueTicket(store, { map }, "s2", 2000, id)).ok).toBe(true);
  });

  async function setup(issuedAt: number) {
    const store = new MemoryStore();
    const r = await issueTicket(store, { map }, "s1", issuedAt, () => "00000000-0000-4000-9000-000000000001");
    return { store, ticket: (r as { ticket: string }).ticket };
  }

  it("accept a score once the claimed play time has really passed", async () => {
    const { store, ticket } = await setup(0);
    expect(await submitScore(store, { ...good, ticket }, "h", 90_000)).toEqual({ ok: true, rank: 1 });
  });

  it("refuse a score sent sooner than the run could have lasted", async () => {
    const { store, ticket } = await setup(0);
    expect(await submitScore(store, { ...good, ticket }, "h", 60_000)).toMatchObject({ ok: false, reason: "Sent sooner than the run could have lasted" });
  });

  it("work only once", async () => {
    const { store, ticket } = await setup(0);
    expect((await submitScore(store, { ...good, ticket }, "h", 100_000)).ok).toBe(true);
    expect(await submitScore(store, { ...good, ticket, score: 5010 }, "h", 100_001)).toMatchObject({ ok: false, reason: "Unknown or used ticket" });
  });

  it("must exist and match the map", async () => {
    const { store, ticket } = await setup(0);
    expect(await submitScore(store, { ...good, ticket: "00000000-0000-4000-9000-00000000dead" }, "h", 100_000)).toMatchObject({ reason: "Unknown or used ticket" });
    expect(await submitScore(store, { ...good, ticket, map: "kebun-getah" }, "h", 100_000)).toMatchObject({ reason: "Ticket is for another map" });
  });

  it("expire", async () => {
    const { store, ticket } = await setup(0);
    expect(await submitScore(store, { ...good, ticket }, "h", TICKET_MAX_AGE_MS + 1)).toMatchObject({ reason: "Ticket expired" });
  });

  it("are required", async () => {
    const { ticket: _t, ...noTicket } = good;
    expect(checkSubmission(noTicket)).toEqual({ ok: false, reason: "Malformed score" });
  });
});
