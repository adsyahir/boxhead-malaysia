import { describe, expect, it } from "vitest";
import { ROOM_CODE_RE } from "@kampung/protocol";
import { LobbyLogic } from "../src/lobby-logic";

function make() {
  const clock = { ms: 0 };
  let seed = 1;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return { clock, lobby: new LobbyLogic(() => clock.ms, random) };
}

const summary = (code: string, over: Partial<Parameters<LobbyLogic["update"]>[0]> = {}) => ({
  code, public: true, state: "lobby" as const, hostName: "Abu", map: "kampung-pisang" as const, players: 1, ...over,
});

describe("LobbyLogic", () => {
  it("creates unique, readable 4-letter codes", () => {
    const { lobby } = make();
    const codes = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const r = lobby.create(true, `ip${i}`);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.code).toMatch(ROOM_CODE_RE);
        codes.add(r.code);
      }
    }
    expect(codes.size).toBe(40);
  });

  it("limits room creation to 5 per minute per address, then allows again", () => {
    const { lobby, clock } = make();
    for (let i = 0; i < 5; i++) expect(lobby.create(true, "1.2.3.4").ok).toBe(true);
    expect(lobby.create(true, "1.2.3.4")).toEqual({ ok: false, reason: "rate_limited" });
    expect(lobby.create(true, "9.9.9.9").ok).toBe(true); // someone else is unaffected
    clock.ms += 61_000;
    expect(lobby.create(true, "1.2.3.4").ok).toBe(true);
  });

  it("lists only public lobby rooms with a free seat", () => {
    const { lobby } = make();
    const mk = (pub: boolean) => {
      const r = lobby.create(pub, `ip${Math.random()}`);
      if (!r.ok) throw new Error("create failed");
      return r.code;
    };
    const open = mk(true);
    const priv = mk(false);
    const full = mk(true);
    const running = mk(true);
    const empty = mk(true);
    lobby.update(summary(open));
    lobby.update(summary(priv, { public: false }));
    lobby.update(summary(full, { players: 2 }));
    lobby.update(summary(running, { state: "playing" }));
    lobby.update(summary(empty, { players: 0 }));
    expect(lobby.list().map((r) => r.code)).toEqual([open]);
    expect(lobby.list()[0]).toMatchObject({ host: "Abu", map: "kampung-pisang", players: 1 });
  });

  it("forgets removed rooms and drops stale ones", () => {
    const { lobby, clock } = make();
    const r = lobby.create(true, "ip");
    if (!r.ok) throw new Error("create failed");
    lobby.update(summary(r.code));
    expect(lobby.has(r.code)).toBe(true);
    clock.ms += 16 * 60_000;
    expect(lobby.list()).toEqual([]);
    expect(lobby.has(r.code)).toBe(false);

    const r2 = lobby.create(true, "ip2");
    if (!r2.ok) throw new Error("create failed");
    lobby.remove(r2.code);
    expect(lobby.has(r2.code)).toBe(false);
  });

  it("ignores updates for rooms it never created", () => {
    const { lobby } = make();
    lobby.update(summary("ZZZZ"));
    expect(lobby.has("ZZZZ")).toBe(false);
  });
});
