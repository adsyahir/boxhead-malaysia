import { describe, expect, it } from "vitest";
import { BALANCE, WEAPONS, createBoxMap, createWorld, step, type WeaponId } from "../src";
import { damageEnemy } from "../src/systems/combat";
import { IDLE, addEnemy, makeWorld, quietWave, run, seconds } from "./helpers";

const FIRE = { ...IDLE, fire: true };

function unlock(w: ReturnType<typeof makeWorld>, id: WeaponId) {
  w.score = Math.max(w.score, WEAPONS[id].unlockScore);
  step(w, [IDLE]); // unlock check runs on score change; trigger via a kill-free path below
}

function giveWeapon(w: ReturnType<typeof makeWorld>, id: WeaponId, ammo = WEAPONS[id].startAmmo) {
  if (!w.unlocked.includes(id)) w.unlocked.push(id);
  for (const p of w.players) p.ammo[id] = ammo;
  w.players[0]!.weapon = id;
}

describe("unlocks", () => {
  it("unlocks by team score and grants starting ammo to living players only", () => {
    const w = makeWorld({ players: 2 });
    quietWave(w);
    w.players[1]!.alive = false;
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 30, p.y, "pontianak", { hp: 1, maxHp: 1, points: 1500 });
    const ev = run(w, 3, [FIRE]);
    expect(ev.some((x) => x.type === "weaponUnlocked" && x.weapon === "uzi")).toBe(true);
    expect(w.unlocked).toContain("uzi");
    expect(w.players[0]!.ammo.uzi).toBe(140);
    expect(w.players[1]!.ammo.uzi).toBe(0);
    expect(e.hp).toBeLessThanOrEqual(0);
  });

  it("switch cycles unlocked weapons with ammo and skips empty ones", () => {
    const w = makeWorld();
    giveWeapon(w, "uzi", 10);
    giveWeapon(w, "tongGas", 0);
    w.players[0]!.weapon = "lastik";
    run(w, 1, [{ ...IDLE, switchWeapon: true }]);
    expect(w.players[0]!.weapon).toBe("uzi");
    run(w, 1, [{ ...IDLE, switchWeapon: true }]); // held: no second switch
    expect(w.players[0]!.weapon).toBe("uzi");
    run(w, 1, [IDLE]);
    run(w, 1, [{ ...IDLE, switchWeapon: true }]);
    expect(w.players[0]!.weapon).toBe("lastik"); // tongGas has 0 ammo
  });

  it("auto-switches when ammo runs out", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "uzi", 1);
    run(w, 1, [FIRE]);
    expect(w.players[0]!.ammo.uzi).toBe(0);
    expect(w.players[0]!.weapon).toBe("lastik");
  });
});

describe("Uzi and Senapang Patah", () => {
  it("uzi fires every 0.08s and spends ammo", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "uzi", 140);
    const shots = run(w, seconds(1), [FIRE]).filter((e) => e.type === "shotFired").length;
    expect(shots).toBeGreaterThanOrEqual(12);
    expect(shots).toBeLessThanOrEqual(13);
    expect(w.players[0]!.ammo.uzi).toBe(140 - shots);
  });

  it("shotgun fires 7 pellets for one ammo, short range", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "senapangPatah", 30);
    run(w, 1, [FIRE]);
    expect(w.projectiles.filter((p) => p.kind === "pellet")).toHaveLength(7);
    expect(w.players[0]!.ammo.senapangPatah).toBe(29);
    const p = w.players[0]!;
    const far = addEnemy(w, p.x + 320, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    run(w, seconds(1), [IDLE]);
    expect(far.hp).toBe(1000); // pellets expired before reaching it
  });
});

describe("explosions", () => {
  it("falls off to 50% at the edge and pushes enemies away", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "bomIkan", 10);
    const p = w.players[0]!;
    const near = addEnemy(w, p.x + 5, p.y + 0, "pocong", { hp: 1000, maxHp: 1000 });
    const edge = addEnemy(w, p.x + 5, p.y + 78, "pocong", { hp: 1000, maxHp: 1000 });
    const proj = { x: p.x + 5, y: p.y };
    p.facing = { x: 0, y: 1 };
    // detonate directly through a grenade placed at known spot
    w.projectiles.push({ id: 999, kind: "grenade", x: proj.x, y: proj.y, vx: 0, vy: 0, damage: 120, radius: 4, life: 0.01, blast: 80 });
    run(w, 2);
    expect(near.hp).toBeCloseTo(1000 - 120, 0);
    expect(edge.hp).toBeCloseTo(1000 - 120 * (1 - (0.5 * 78) / 80), 0);
    expect(edge.y).toBeGreaterThan(p.y + 78);
  });

  it("does not damage players", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    w.projectiles.push({ id: 998, kind: "grenade", x: p.x, y: p.y, vx: 0, vy: 0, damage: 500, radius: 4, life: 0.01, blast: 100 });
    run(w, 3);
    expect(p.hp).toBe(100);
  });

  it("Tong Gas explodes when shot and chains to neighbours after 0.14s", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "tongGas", 8);
    const p = w.players[0]!;
    p.facing = { x: 1, y: 0 };
    run(w, 1, [FIRE]); // places barrel at +30
    expect(w.placeables).toHaveLength(1);
    const b1 = w.placeables[0]!;
    w.placeables.push({ ...b1, id: 5000, x: b1.x + 60 });
    const victim = addEnemy(w, b1.x + 120, b1.y, "pocong", { hp: 1000, maxHp: 1000 });
    giveWeapon(w, "lastik");
    p.cooldown = 0;
    // the bullet reaches the first barrel on the very first tick, so keep those events
    const events = [...run(w, 1, [FIRE]), ...run(w, seconds(0.6), [IDLE])];
    expect(events.filter((e) => e.type === "explosion")).toHaveLength(2);
    expect(victim.hp).toBeLessThan(1000);
    expect(w.placeables).toHaveLength(0);
  });

  it("Mercun Bola arms after 0.6s then blows on contact", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "mercunBola", 8);
    const p = w.players[0]!;
    run(w, 1, [FIRE]);
    const mine = w.placeables[0]!;
    const e = addEnemy(w, mine.x, mine.y, "pocong", { hp: 1000, maxHp: 1000 });
    run(w, seconds(0.3));
    expect(w.placeables).toHaveLength(1); // not armed yet
    run(w, seconds(0.5));
    expect(w.placeables).toHaveLength(0);
    expect(e.hp).toBeLessThan(1000);
    void p;
  });

  it("Meriam Buluh rocket explodes on hit", () => {
    const w = makeWorld();
    quietWave(w);
    giveWeapon(w, "meriamBuluh", 12);
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 150, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    const ev = run(w, seconds(1), [FIRE]);
    expect(ev.filter((x) => x.type === "explosion").length).toBeGreaterThanOrEqual(1);
    expect(e.hp).toBeLessThan(1000 - 100);
  });
});

describe("pickups", () => {
  it("ketupat heals 30 capped at 100", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    p.hp = 50;
    w.pickups.push({ id: 1, kind: "ketupat", x: p.x, y: p.y, age: 0, ttl: 16 });
    w.pickups.push({ id: 2, kind: "ketupat", x: p.x, y: p.y, age: 0, ttl: 16 });
    w.pickups.push({ id: 3, kind: "ketupat", x: p.x, y: p.y, age: 0, ttl: 16 });
    run(w, 1);
    expect(p.hp).toBe(100);
  });

  it("ammo box gives 60% of start ammo, or 250 score if nothing unlocked", () => {
    const w = makeWorld();
    quietWave(w);
    const p = w.players[0]!;
    w.pickups.push({ id: 1, kind: "ammo", x: p.x, y: p.y, age: 0, ttl: 16 });
    run(w, 1);
    expect(w.score).toBe(BALANCE.ammoFallbackScore);

    w.unlocked.push("uzi");
    w.pickups.push({ id: 2, kind: "ammo", x: p.x, y: p.y, age: 0, ttl: 16 });
    run(w, 1);
    expect(p.ammo.uzi).toBe(84);
  });

  it("despawn after ttl (16s, crate 25s)", () => {
    const w = makeWorld();
    quietWave(w);
    const far = { x: 100, y: 100 };
    w.pickups.push({ id: 1, kind: "ketupat", ...far, age: 0, ttl: 16 });
    w.pickups.push({ id: 2, kind: "crate", ...far, age: 0, ttl: 25 });
    run(w, seconds(17));
    expect(w.pickups.map((p) => p.id)).toEqual([2]);
    run(w, seconds(9));
    expect(w.pickups).toHaveLength(0);
  });
});

describe("Pagar Buluh", () => {
  it("places a barricade that blocks and is chewed by enemies", () => {
    // one-tile-high corridor so the barricade seals it
    const w = createWorld({ seed: 3, map: createBoxMap(20, 3), playerCount: 1 });
    quietWave(w);
    giveWeapon(w, "pagarBuluh", 6);
    const p = w.players[0]!;
    p.x = 100;
    p.y = 48;
    p.facing = { x: 1, y: 0 };
    run(w, 1, [FIRE]);
    const b = w.placeables[0]!;
    expect(b.kind).toBe("barricade");
    expect(w.players[0]!.ammo.pagarBuluh).toBe(5);
    const e = addEnemy(w, b.x + 40, b.y, "pocong", { speed: 62, hp: 1e6, maxHp: 1e6 });
    p.x = 40;
    run(w, seconds(3));
    expect(e.x).toBeGreaterThan(b.x); // never passed through
    expect(b.hp).toBeLessThan(150);
  });
});

describe("loot drops", () => {
  function dropsFor(unlocked: boolean): string[] {
    const w = makeWorld({ seed: 11 });
    quietWave(w);
    if (unlocked) w.unlocked.push("uzi");
    const seen: string[] = [];
    for (let i = 0; i < 600; i++) {
      // points 0 so the score never unlocks anything by itself
      const e = addEnemy(w, 500, 300, "toyol", { hp: 1, maxHp: 1, points: 0 });
      damageEnemy(w, e, 5, []);
      for (const pk of w.pickups) seen.push(pk.kind);
      w.pickups = [];
    }
    return seen;
  }

  it("about 5% ketupat; no ammo boxes while only Lastik is unlocked", () => {
    const seen = dropsFor(false);
    expect(seen).not.toContain("ammo");
    const ketupat = seen.filter((k) => k === "ketupat").length;
    expect(ketupat).toBeGreaterThan(10);
    expect(ketupat).toBeLessThan(60);
  });

  it("about 7% ammo boxes once another weapon is unlocked", () => {
    const ammo = dropsFor(true).filter((k) => k === "ammo").length;
    expect(ammo).toBeGreaterThan(20);
    expect(ammo).toBeLessThan(70);
  });
});
