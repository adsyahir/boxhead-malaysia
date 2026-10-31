import { describe, expect, it } from "vitest";
import { NET } from "@kampung/protocol";
import { createBoxMap } from "@kampung/game-core";
import { RoomLogic } from "../src/room-logic";
import { FakeConn, input, makeRoom, runFor, startedGame } from "./helpers";

describe("joining", () => {
  it("seats two players, host first, then refuses a third", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    const c = new FakeConn();
    expect(room.join(a, "Abu")).toBe(0);
    expect(room.join(b, "Siti")).toBe(1);
    expect(room.join(c, "Muthu")).toBeNull();
    expect(a.last("welcome")).toMatchObject({ slot: 0, code: "ABCD" });
    expect(c.last("error")).toMatchObject({ code: "room_full" });
    expect(c.closed).toBe(true);
    const lobby = b.last("lobby")!;
    expect(lobby.host).toBe(0);
    expect(lobby.players.map((p) => p?.name)).toEqual(["Abu", "Siti"]);
  });

  it("gives each player a different default hero", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, "Abu");
    room.join(b, "Siti");
    const [p0, p1] = b.last("lobby")!.players;
    expect(p0!.hero).not.toBe(p1!.hero);
  });

  it.each(["", "ab", "x".repeat(17), "<script>", "Babi"])("rejects the name %j", (name) => {
    const { room } = makeRoom();
    const a = new FakeConn();
    expect(room.join(a, name)).toBeNull();
    expect(a.last("error")).toMatchObject({ code: "bad_name" });
    expect(a.closed).toBe(true);
  });
});

describe("lobby rules", () => {
  it("ignores picking the other player's hero", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, "Abu");
    room.join(b, "Siti");
    const mine = a.last("lobby")!.players[0]!.hero;
    room.message(1, { t: "hero", hero: mine });
    expect(b.last("lobby")!.players[1]!.hero).not.toBe(mine);
  });

  it("only the host picks the map", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, "Abu");
    room.join(b, "Siti");
    room.message(1, { t: "map", map: "kebun-getah" });
    expect(b.last("error")).toMatchObject({ code: "not_host" });
    room.message(0, { t: "map", map: "kebun-getah" });
    expect(b.last("lobby")!.map).toBe("kebun-getah");
  });

  it("start needs a second player who is ready, and only the host can press it", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    room.join(a, "Abu");
    room.message(0, { t: "start" });
    expect(a.last("error")).toMatchObject({ code: "not_ready" });

    const b = new FakeConn();
    room.join(b, "Siti");
    room.message(0, { t: "start" });
    expect(a.last("error")).toMatchObject({ code: "not_ready" }); // Siti not ready yet
    room.message(1, { t: "ready", ready: true });
    room.message(1, { t: "start" });
    expect(b.last("error")).toMatchObject({ code: "not_host" });
    room.message(0, { t: "start" });
    expect(a.last("start")).toMatchObject({ you: 0, map: "kampung-pisang" });
    expect(b.last("start")).toMatchObject({ you: 1 });
    expect(room.phase).toBe("playing");
  });

  it("when the host leaves the lobby, the other player becomes host", () => {
    const { room } = makeRoom();
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, "Abu");
    room.join(b, "Siti");
    room.disconnect(0, a);
    expect(b.last("lobby")!.host).toBe(1);
    expect(b.last("lobby")!.players).toEqual([null, expect.objectContaining({ name: "Siti" })]);
  });

  it("refuses new players once the game has started", () => {
    const { rig } = startedGame();
    const c = new FakeConn();
    expect(rig.room.join(c, "Muthu")).toBeNull();
    expect(c.last("error")).toMatchObject({ code: "in_progress" });
  });

  it("answers pings and tells the lobby registry about changes", () => {
    const rig = makeRoom();
    const a = new FakeConn();
    rig.room.join(a, "Abu");
    const before = rig.changes;
    rig.room.message(0, { t: "ping", n: 41 });
    expect(a.last("pong")).toEqual({ t: "pong", n: 41 });
    rig.room.message(0, { t: "map", map: "kebun-getah" });
    expect(rig.changes).toBeGreaterThan(before);
    expect(rig.room.summary()).toMatchObject({ code: "ABCD", players: 1, hostName: "Abu", map: "kebun-getah", state: "lobby" });
  });
});

describe("running game", () => {
  it("sends a snapshot every third tick and applies each player's input", () => {
    const { rig, a, b } = startedGame();
    const first = a.last("snap");
    expect(first).toBeUndefined();
    rig.room.message(0, input({ mx: 1 }));
    rig.room.message(1, input({ mx: -1 }));
    runFor(rig, 1000);
    const snaps = a.of("snap");
    expect(snaps.length).toBeGreaterThanOrEqual(15); // ~20 per second
    expect(snaps.length).toBeLessThanOrEqual(22);
    const last = snaps.at(-1)!.s;
    expect(last.players[0]!.x).toBeGreaterThan(last.players[1]!.x);
    expect(b.of("snap").length).toBe(snaps.length);
  });

  it("clients get the same state", () => {
    const { rig, a, b } = startedGame();
    runFor(rig, 500);
    expect(a.last("snap")!.s.tick).toBe(b.last("snap")!.s.tick);
  });

  it("a flooding client is throttled instead of crashing the room", () => {
    const { rig, a } = startedGame();
    for (let i = 0; i < 1000; i++) rig.room.message(0, { t: "ping", n: i });
    expect(a.of("pong").length).toBeLessThan(200);
    runFor(rig, 200);
    expect(a.of("snap").length).toBeGreaterThan(0);
  });

  it("a dropped player is downed, and returns with the same token", () => {
    const { rig, a, b } = startedGame();
    runFor(rig, 300);
    const token = b.last("welcome")!.token;
    rig.room.disconnect(1, b);
    runFor(rig, 100);
    expect(a.last("snap")!.s.players[1]).toMatchObject({ away: true, alive: false });

    const b2 = new FakeConn();
    expect(rig.room.join(b2, "Siti", token)).toBe(1);
    expect(b2.last("welcome")).toMatchObject({ slot: 1, token });
    expect(b2.last("start")).toMatchObject({ you: 1 });
    expect(b2.last("snap")).toBeDefined();
    runFor(rig, 100);
    expect(a.last("snap")!.s.players[1]!.away).toBe(false);
  });

  it("a stale socket cannot disconnect the player who replaced it", () => {
    const { rig, b } = startedGame();
    const token = b.last("welcome")!.token;
    const b2 = new FakeConn();
    rig.room.join(b2, "Siti", token);
    rig.room.disconnect(1, b);
    expect(rig.room.connectedCount).toBe(2);
  });

  it("ends the run when everyone has been gone longer than the reconnect window", () => {
    const { rig, a, b } = startedGame();
    runFor(rig, 200);
    rig.room.disconnect(0, a);
    rig.room.disconnect(1, b);
    expect(rig.room.isDead()).toBe(false); // still inside the grace period
    runFor(rig, NET.reconnectGraceMs + 500, 250);
    expect(rig.room.phase).toBe("over");
    expect(rig.room.isDead()).toBe(true);
  });

  it("after the game is over, a lobby message takes everyone back to the lobby", () => {
    const { rig, a, b } = startedGame();
    rig.room.disconnect(1, b);
    // player 0 is alone: let the world end by letting enemies kill them
    for (let i = 0; i < 400 && rig.room.phase === "playing"; i++) runFor(rig, 1000, 100);
    expect(rig.room.phase).toBe("over");
    expect(a.last("over")!.run).toMatchObject({ map: "kampung-pisang" });
    rig.room.message(0, { t: "ready", ready: false });
    expect(rig.room.phase).toBe("lobby");
    expect(a.last("lobby")!.state).toBe("lobby");
  });
});

describe("direct weapon pick over the network", () => {
  it("applies a pick once, and the snapshot carries level and weapon", () => {
    const { rig, a } = startedGame();
    runFor(rig, 100);
    // unlock and arm the Uzi on the running world through the public step path: use a pick for a weapon with no ammo first
    rig.room.message(0, input({ sel: 1 }));
    runFor(rig, 100);
    // Uzi is locked at level 1, so the pick is ignored and Lastik stays selected
    expect(a.last("snap")!.s.players[0]!.w).toBe(0);
    expect(a.last("snap")!.s.level).toBe(1);
  });
});

describe("saving the online score", () => {
  function savedGame(save: (run: unknown, names: string[]) => Promise<number | null>) {
    const clock = { ms: 1_000 };
    let n = 0;
    const room = new RoomLogic({
      code: "ABCD",
      public: true,
      now: () => clock.ms,
      loadMap: () => createBoxMap(60, 40),
      seed: () => 12345,
      token: () => `tok${++n}`,
      onChange: () => undefined,
      saveScore: save as never,
    });
    const a = new FakeConn();
    const b = new FakeConn();
    room.join(a, "Abu");
    room.join(b, "Siti");
    room.message(1, { t: "ready", ready: true });
    room.message(0, { t: "start" });
    return { room, a, b, clock };
  }

  async function finishRun(g: ReturnType<typeof savedGame>) {
    // player 1 leaves, player 0 stands still until the ghosts get them
    g.room.disconnect(1, g.b);
    for (let i = 0; i < 400 && g.room.phase === "playing"; i++) {
      for (let t = 0; t < 1000; t += 100) {
        g.clock.ms += 100;
        g.room.tick();
      }
    }
    await Promise.resolve();
    await Promise.resolve();
  }

  it("hands the finished run and both names to saveScore, then tells the players the rank", async () => {
    const calls: { run: unknown; names: string[] }[] = [];
    const g = savedGame(async (run, names) => {
      calls.push({ run, names });
      return 4;
    });
    await finishRun(g);
    expect(g.room.phase).toBe("over");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.names).toEqual(["Abu", "Siti"]);
    expect(calls[0]!.run).toMatchObject({ map: "kampung-pisang" });
    expect(g.a.last("saved")).toEqual({ t: "saved", rank: 4 });
  });

  it("tells the players it could not be saved when the write fails", async () => {
    const g = savedGame(async () => {
      throw new Error("db down");
    });
    await finishRun(g);
    expect(g.a.last("saved")).toEqual({ t: "saved", rank: null });
  });

  it("says nothing about saving when there is no leaderboard configured", async () => {
    const { rig, a, b } = startedGame();
    rig.room.disconnect(1, b);
    for (let i = 0; i < 400 && rig.room.phase === "playing"; i++) runFor(rig, 1000, 100);
    expect(rig.room.phase).toBe("over");
    expect(a.of("saved")).toHaveLength(0);
  });
});

describe("input acknowledgement (for client-side prediction)", () => {
  it("echoes the highest input sequence each player has sent in every snapshot", () => {
    const { rig, a, b } = startedGame();
    rig.room.message(0, input({ seq: 5, mx: 1 }));
    rig.room.message(1, input({ seq: 9, mx: -1 }));
    rig.room.message(0, input({ seq: 7, mx: 1 }));
    rig.room.message(0, input({ seq: 6, mx: 0 })); // an old, reordered message never lowers the ack
    runFor(rig, 200);
    const s = a.last("snap")!.s;
    expect(s.players[0]!.ack).toBe(7);
    expect(s.players[1]!.ack).toBe(9);
    expect(b.last("snap")!.s.players[0]!.ack).toBe(7);
  });

  it("starts again from zero in a new game", () => {
    const { rig, a } = startedGame();
    rig.room.message(0, input({ seq: 40 }));
    runFor(rig, 100);
    expect(a.last("snap")!.s.players[0]!.ack).toBe(40);
  });
});
