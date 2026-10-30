import { describe, expect, it } from "vitest";
import {
  MAX_LEVEL,
  UPGRADE_LIST,
  WEAPONS,
  WEAPON_IDS,
  killsForLevel,
  levelForKills,
  rewardAt,
  step,
  upgradesFor,
  weaponStats,
  type PlayerInput,
  type UpgradeId,
  type WeaponId,
  type World,
} from "../src";
import { IDLE, addEnemy, makeWorld, quietWave, run, seconds } from "./helpers";

const FIRE: PlayerInput = { ...IDLE, fire: true };

function give(w: World, id: WeaponId, ammo = 50): void {
  if (!w.unlocked.includes(id)) w.unlocked.push(id);
  for (const p of w.players) p.ammo[id] = ammo;
  w.players[0]!.weapon = id;
}

describe("level curve", () => {
  it("level 1 is free, the curve only goes up, and level 125 is a long way off", () => {
    expect(killsForLevel(1)).toBe(0);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(killsForLevel(l)).toBeGreaterThan(killsForLevel(l - 1));
    expect(killsForLevel(2)).toBeLessThanOrEqual(5); // the first level comes fast
    expect(killsForLevel(MAX_LEVEL)).toBeGreaterThan(1500);
    expect(killsForLevel(MAX_LEVEL)).toBeLessThan(3000);
  });

  it("levelForKills inverts killsForLevel and stops at the cap", () => {
    for (const l of [1, 2, 5, 10, 50, 100, 125]) {
      expect(levelForKills(killsForLevel(l))).toBe(l);
      if (l > 1) expect(levelForKills(killsForLevel(l) - 1)).toBe(l - 1);
    }
    expect(levelForKills(1_000_000)).toBe(MAX_LEVEL);
  });
});

describe("upgrade list", () => {
  it("matches the screenshot at the spots that matter", () => {
    expect(rewardAt(3)).toEqual({ kind: "upgrade", weapon: "lastik", upgrade: "fastFire" });
    expect(rewardAt(5)).toEqual({ kind: "weapon", weapon: "uzi" });
    expect(rewardAt(33)).toEqual({ kind: "upgrade", weapon: "bomIkan", upgrade: "clusterExplode" });
    expect(rewardAt(61)).toEqual({ kind: "upgrade", weapon: "uzi", upgrade: "infiniteRange" });
    expect(rewardAt(70)).toEqual({ kind: "weapon", weapon: "railgun" });
    expect(rewardAt(125)).toEqual({ kind: "upgrade", weapon: "railgun", upgrade: "longShot" });
    expect(rewardAt(4)).toBeNull();
    expect(UPGRADE_LIST).toHaveLength(58); // 21 + 21 + 16 rows in the screenshot
  });

  it("levels are unique, ascending and within the cap", () => {
    const levels = UPGRADE_LIST.map((e) => e.level);
    expect(new Set(levels).size).toBe(levels.length);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
    expect(Math.max(...levels)).toBe(MAX_LEVEL);
  });

  it("every weapon but Lastik is unlocked by exactly one list entry, at the level the weapon table says", () => {
    for (const id of WEAPON_IDS) {
      const unlocks = UPGRADE_LIST.filter((e) => e.reward.kind === "weapon" && e.reward.weapon === id);
      if (id === "lastik") {
        expect(unlocks).toHaveLength(0);
        expect(WEAPONS.lastik.unlockLevel).toBe(1);
      } else {
        expect(unlocks, id).toHaveLength(1);
        expect(unlocks[0]!.level, id).toBe(WEAPONS[id].unlockLevel);
      }
    }
    expect(WEAPON_IDS.map((id) => WEAPONS[id].unlockLevel)).toEqual([1, 5, 10, 15, 20, 30, 40, 50, 55, 70]);
  });

  it("a weapon never gets an upgrade before it exists", () => {
    for (const e of UPGRADE_LIST) {
      if (e.reward.kind === "upgrade") expect(e.level, `${e.reward.weapon} ${e.reward.upgrade}`).toBeGreaterThan(WEAPONS[e.reward.weapon].unlockLevel);
    }
  });

  it("higher tiers always come after the lower tier of the same weapon", () => {
    const pairs: [UpgradeId, UpgradeId][] = [
      ["fastFire", "rapidFire"],
      ["doubleDamage", "quadDamage"],
      ["doubleAmmo", "quadAmmo"],
      ["longShot", "infiniteRange"],
      ["wideShot", "widerShot"],
      ["bigBang", "biggerBang"],
    ];
    for (const id of WEAPON_IDS) {
      const at = (u: UpgradeId) => UPGRADE_LIST.find((e) => e.reward.kind === "upgrade" && e.reward.weapon === id && e.reward.upgrade === u)?.level;
      for (const [low, high] of pairs) {
        const l = at(low);
        const h = at(high);
        if (l !== undefined && h !== undefined) expect(h, `${id} ${high} after ${low}`).toBeGreaterThan(l);
      }
    }
  });

  it("upgradesFor lists what a weapon has reached by a level", () => {
    expect(upgradesFor("uzi", 12)).toEqual([]);
    expect(upgradesFor("uzi", 13)).toEqual(["rapidFire"]);
    expect(upgradesFor("uzi", 125)).toEqual(["rapidFire", "doubleAmmo", "longShot", "quadAmmo", "doubleDamage", "infiniteRange", "quadDamage"]);
  });
});

describe("weaponStats", () => {
  it("at level 1 every weapon equals its base table", () => {
    for (const id of WEAPON_IDS) {
      const s = weaponStats(id, 1);
      const d = WEAPONS[id];
      expect(s.damage).toBe(d.damage);
      expect(s.cooldown).toBe(d.cooldown);
      expect(s.ammoMult).toBe(1);
      expect(s.blast).toBe(d.blast ?? 0);
      expect(s.cluster).toBe(false);
    }
  });

  it("Fast Fire is x0.8 cooldown, Rapid Fire x0.6 and replaces it", () => {
    expect(weaponStats("lastik", 3).cooldown).toBeCloseTo(0.24);
    expect(weaponStats("uzi", 13).cooldown).toBeCloseTo(0.048);
    expect(weaponStats("meriamBuluh", 59).cooldown).toBeCloseTo(0.88);
    expect(weaponStats("meriamBuluh", 120).cooldown).toBeCloseTo(0.66);
  });

  it("Double and Quad Damage replace each other, they do not stack", () => {
    expect(weaponStats("lastik", 8).damage).toBe(52);
    expect(weaponStats("uzi", 48).damage).toBe(26);
    expect(weaponStats("uzi", 90).damage).toBe(52);
  });

  it("Double and Quad Ammo set the ammo multiplier", () => {
    expect(weaponStats("uzi", 17).ammoMult).toBe(2);
    expect(weaponStats("uzi", 39).ammoMult).toBe(4);
    expect(weaponStats("pagarBuluh", 37).ammoMult).toBe(2);
    expect(weaponStats("pagarBuluh", 53).ammoMult).toBe(4);
  });

  it("Long Shot extends range by half, Infinite Range removes the limit", () => {
    expect(weaponStats("uzi", 23).range).toBe(900);
    expect(weaponStats("uzi", 61).range).toBe(Infinity);
    expect(weaponStats("senapangPatah", 35).range).toBe(270);
    expect(weaponStats("railgun", 125).range).toBe(1050);
  });

  it("Wide Shot and Wider Shot widen the shotgun, Wider adds pellets", () => {
    expect(weaponStats("senapangPatah", 31).spread).toBeCloseTo(0.24 * 1.4);
    expect(weaponStats("senapangPatah", 31).pellets).toBe(7);
    expect(weaponStats("senapangPatah", 51).spread).toBeCloseTo(0.24 * 1.8);
    expect(weaponStats("senapangPatah", 51).pellets).toBe(9);
  });

  it("Big Bang and Bigger Bang grow the blast; Cluster Explode only sets its flag", () => {
    expect(weaponStats("tongGas", 32).blast).toBeCloseTo(95 * 1.25);
    expect(weaponStats("tongGas", 44).blast).toBeCloseTo(95 * 1.5);
    expect(weaponStats("bomIkan", 33).cluster).toBe(true);
    expect(weaponStats("bomIkan", 32).cluster).toBe(false);
    expect(weaponStats("bomIkan", 33).blast).toBe(80);
  });

  it("an upgrade for one weapon never changes another", () => {
    expect(weaponStats("uzi", 125).cooldown).toBeCloseTo(0.048);
    expect(weaponStats("lastik", 125).cooldown).toBeCloseTo(0.24);
    expect(weaponStats("tongGas", 125).cooldown).toBe(WEAPONS.tongGas.cooldown);
  });
});

describe("levelling up in play", () => {
  function killOne(w: World) {
    const p = w.players[0]!;
    addEnemy(w, p.x + 30, p.y, "pocong", { hp: 1, maxHp: 1 });
    return run(w, 3, [FIRE]);
  }

  it("gains a level when kills reach the threshold, with a levelUp event", () => {
    const w = makeWorld();
    quietWave(w);
    w.kills = killsForLevel(2) - 1;
    const ev = killOne(w);
    expect(w.level).toBe(2);
    expect(ev.filter((e) => e.type === "levelUp")).toEqual([{ type: "levelUp", level: 2, reward: null }]);
  });

  it("an upgrade level changes numbers but unlocks nothing new", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 2;
    w.kills = killsForLevel(3) - 1;
    const ev = killOne(w);
    expect(w.level).toBe(3);
    expect(ev.find((e) => e.type === "levelUp")).toMatchObject({ reward: { kind: "upgrade", weapon: "lastik", upgrade: "fastFire" } });
    expect(w.unlocked).toEqual(["lastik"]);
    expect(weaponStats("lastik", w.level).cooldown).toBeCloseTo(0.24);
  });

  it("several levels in one kill are all reported, in order", () => {
    const w = makeWorld();
    quietWave(w);
    w.kills = killsForLevel(11) - 1; // one kill carries the team from level 1 to 11
    const ev = killOne(w);
    const levels = ev.filter((e) => e.type === "levelUp").map((e) => (e as { level: number }).level);
    expect(levels).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(w.unlocked).toEqual(["lastik", "uzi", "senapangPatah"]);
  });

  it("stops at the cap", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = MAX_LEVEL;
    w.kills = killsForLevel(MAX_LEVEL) + 500;
    expect(killOne(w).some((e) => e.type === "levelUp")).toBe(false);
    expect(w.level).toBe(MAX_LEVEL);
  });
});

describe("upgrades change how weapons behave", () => {
  it("Fast Fire shoots more often", () => {
    const shots = (level: number) => {
      const w = makeWorld();
      quietWave(w);
      w.level = level;
      return run(w, seconds(1.2), [FIRE]).filter((e) => e.type === "shotFired").length;
    };
    expect(shots(1)).toBe(4); // t = 0, 0.3, 0.6, 0.9
    expect(shots(3)).toBe(5); // t = 0, 0.24, 0.48, 0.72, 0.96
  });

  it("Double Damage hits harder", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 8;
    const p = w.players[0]!;
    const e = addEnemy(w, p.x + 60, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    run(w, 1, [FIRE]); // one shot
    run(w, 30, [IDLE]); // let it land
    expect(e.hp).toBe(1000 - 52);
  });

  it("Infinite Range makes the Uzi bullet last until it hits something", () => {
    const lifeAt = (level: number) => {
      const w = makeWorld();
      quietWave(w);
      w.level = level;
      give(w, "uzi", 100);
      run(w, 1, [FIRE]);
      return w.projectiles[0]!.life;
    };
    expect(lifeAt(1)).toBeLessThan(1.2);
    expect(lifeAt(23)).toBeGreaterThan(lifeAt(1));
    expect(lifeAt(61)).toBeGreaterThan(3.9); // capped at 4 s, and a wall ends it sooner
  });

  it("Wider Shot fires nine pellets", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 51;
    give(w, "senapangPatah", 30);
    run(w, 1, [FIRE]);
    expect(w.projectiles.filter((p) => p.kind === "pellet")).toHaveLength(9);
  });

  it("explosive upgrades travel with the projectile", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 45; // Bom Ikan: Cluster Explode (33) and Big Bang (45)
    give(w, "bomIkan", 10);
    run(w, 1, [FIRE]);
    expect(w.projectiles[0]).toMatchObject({ blast: 100, cluster: true });
  });

  it("ammo grants are multiplied by Double and Quad Ammo", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 39; // Uzi has Quad Ammo
    w.unlocked.push("uzi");
    const p = w.players[0]!;
    w.pickups.push({ id: 900, kind: "ammo", x: p.x, y: p.y, age: 0, ttl: 16 });
    // only Uzi is unlocked besides Lastik, so the box must be for Uzi: 60% of 140 = 84, times 4
    run(w, 1);
    expect(p.ammo.uzi).toBe(84 * 4);
  });

  it("a weapon unlocked after its ammo upgrade grants the multiplied amount", () => {
    const w = makeWorld();
    quietWave(w);
    w.level = 54; // Mercun Bola has Double Ammo (54), is unlocked (40) but we pretend it is not yet unlocked
    const p = w.players[0]!;
    w.kills = killsForLevel(55) - 1; // next kill: level 55 unlocks Bungkusan Bom
    addEnemy(w, p.x + 30, p.y, "pocong", { hp: 1, maxHp: 1 });
    run(w, 3, [FIRE]);
    expect(w.unlocked).toContain("chargepack");
    expect(p.ammo.chargepack).toBe(6); // no ammo upgrade yet at level 55
  });
});

describe("direct weapon select (keys 1 to 0)", () => {
  it("picks an unlocked weapon that has ammo, and ignores the rest", () => {
    const w = makeWorld();
    give(w, "uzi", 20);
    w.players[0]!.weapon = "lastik";
    step(w, [{ ...IDLE, select: 1 }]);
    expect(w.players[0]!.weapon).toBe("uzi");
    step(w, [{ ...IDLE, select: 2 }]); // Senapang Patah not unlocked
    expect(w.players[0]!.weapon).toBe("uzi");
    step(w, [{ ...IDLE, select: 0 }]);
    expect(w.players[0]!.weapon).toBe("lastik");
    w.unlocked.push("railgun"); // unlocked but no ammo
    step(w, [{ ...IDLE, select: 9 }]);
    expect(w.players[0]!.weapon).toBe("lastik");
    step(w, [{ ...IDLE, select: 42 }]); // out of range
    expect(w.players[0]!.weapon).toBe("lastik");
  });
});

describe("Senapang Kilat (railgun)", () => {
  it("pierces every enemy in line and reports the beam", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "railgun", 10);
    const p = w.players[0]!;
    const hit = [100, 200, 300].map((d) => addEnemy(w, p.x + d, p.y, "pocong", { hp: 1000, maxHp: 1000 }));
    const off = addEnemy(w, p.x + 200, p.y + 60, "pocong", { hp: 1000, maxHp: 1000 });
    const ev = run(w, 1, [FIRE]);
    for (const e of hit) expect(e.hp).toBe(1000 - 120);
    expect(off.hp).toBe(1000);
    const beam = ev.find((e) => e.type === "beam");
    expect(beam).toBeDefined();
    expect(p.ammo.railgun).toBe(9);
  });

  it("stops at the first wall", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "railgun", 10);
    const p = w.players[0]!;
    const col = Math.floor((p.x + 150) / 32);
    const row = Math.floor(p.y / 32);
    for (let r = row - 2; r <= row + 2; r++) w.map.solid[r * w.map.cols + col] = 1;
    const before = addEnemy(w, p.x + 100, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    const behind = addEnemy(w, p.x + 260, p.y, "pocong", { hp: 1000, maxHp: 1000 });
    const ev = run(w, 1, [FIRE]);
    expect(before.hp).toBe(1000 - 120);
    expect(behind.hp).toBe(1000);
    const beam = ev.find((e) => e.type === "beam") as { x2: number };
    expect(beam.x2).toBeLessThan(col * 32 + 1);
  });

  it("ignores rising enemies and respects its range, which Long Shot extends", () => {
    const hits = (level: number) => {
      const w = makeWorld({ cols: 60 });
      quietWave(w);
      w.level = level;
      give(w, "railgun", 10);
      const p = w.players[0]!;
      const rising = addEnemy(w, p.x + 100, p.y, "pocong", { hp: 1000, maxHp: 1000, rise: 1 });
      const far = addEnemy(w, p.x + 800, p.y, "pocong", { hp: 1000, maxHp: 1000 });
      run(w, 1, [FIRE]);
      expect(rising.hp).toBe(1000);
      return far.hp < 1000;
    };
    expect(hits(70)).toBe(false); // base range 700
    expect(hits(125)).toBe(true); // Long Shot: 1050
  });

  it("sets off a Tong Gas it passes through", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "railgun", 10);
    const p = w.players[0]!;
    w.placeables.push({ id: 700, kind: "barrel", x: p.x + 120, y: p.y, radius: 12, hp: 1, arm: 0, fuse: -1 });
    const ev = run(w, 5, [FIRE]);
    expect(ev.some((e) => e.type === "explosion")).toBe(true);
  });
});

describe("Bungkusan Bom (charge pack)", () => {
  it("is dropped, counts down two seconds, then explodes for 220", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "chargepack", 6);
    const p = w.players[0]!;
    run(w, 1, [FIRE]);
    expect(w.placeables).toHaveLength(1);
    expect(w.placeables[0]!.kind).toBe("charge");
    expect(p.ammo.chargepack).toBe(5);
    const c = w.placeables[0]!;
    const e = addEnemy(w, c.x + 3, c.y, "pocong", { hp: 1000, maxHp: 1000 });
    run(w, seconds(1.7), [IDLE]);
    expect(w.placeables).toHaveLength(1); // still ticking
    expect(e.hp).toBe(1000);
    run(w, seconds(0.5), [IDLE]);
    expect(w.placeables).toHaveLength(0);
    expect(e.hp).toBeLessThan(1000 - 200);
  });

  it("does not spend ammo when dropped inside a wall", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "chargepack", 6);
    const p = w.players[0]!;
    p.x = 32 + 12; // next to the left border wall
    p.y = 200;
    p.facing = { x: -1, y: 0 };
    run(w, 1, [FIRE]);
    expect(w.placeables).toHaveLength(0);
    expect(p.ammo.chargepack).toBe(6);
  });

  it("its blast chains into a Tong Gas barrel", () => {
    const w = makeWorld();
    quietWave(w);
    give(w, "chargepack", 6);
    run(w, 1, [FIRE]);
    const c = w.placeables[0]!;
    w.placeables.push({ id: 701, kind: "barrel", x: c.x + 50, y: c.y, radius: 12, hp: 1, arm: 0, fuse: -1 });
    const ev = run(w, seconds(2.6), [IDLE]);
    expect(ev.filter((e) => e.type === "explosion").length).toBe(2);
  });
});

describe("Cluster Explode", () => {
  const grenadeAt = (w: World, x: number, y: number, cluster: boolean) =>
    w.projectiles.push({ id: w.nextId++, kind: "grenade", x, y, vx: 0, vy: 0, damage: 120, radius: 4, life: 0.01, blast: 80, cluster });

  it("leaves four smaller blasts 0.12 s after the main one", () => {
    const w = makeWorld();
    quietWave(w);
    grenadeAt(w, 600, 400, true);
    const first = run(w, 2);
    expect(first.filter((e) => e.type === "explosion")).toHaveLength(1);
    expect(w.blasts).toHaveLength(4);
    const later = run(w, 12);
    const blasts = later.filter((e) => e.type === "explosion") as { radius: number }[];
    expect(blasts).toHaveLength(4);
    for (const b of blasts) expect(b.radius).toBeCloseTo(80 * 0.55);
    expect(w.blasts).toHaveLength(0);
  });

  it("without the upgrade there is a single explosion", () => {
    const w = makeWorld();
    quietWave(w);
    grenadeAt(w, 600, 400, false);
    const ev = run(w, 20);
    expect(ev.filter((e) => e.type === "explosion")).toHaveLength(1);
  });

  it("the secondary blasts reach enemies the main blast missed", () => {
    const w = makeWorld();
    quietWave(w);
    // 62px out on the 45 degree diagonal: outside nothing of the main radius edge? place beyond main radius (80) but near a ring blast
    const r = 80 * 0.6;
    const ring = { x: 600 + Math.cos(Math.PI / 4) * r, y: 400 + Math.sin(Math.PI / 4) * r };
    const e = addEnemy(w, ring.x + 30, ring.y + 30, "pocong", { hp: 1000, maxHp: 1000 });
    const mainDist = Math.hypot(e.x - 600, e.y - 400);
    expect(mainDist).toBeGreaterThan(80);
    grenadeAt(w, 600, 400, true);
    run(w, 20);
    expect(e.hp).toBeLessThan(1000);
  });
});

describe("determinism with progression", () => {
  it("same seed and inputs give the same world even across level-ups and new weapons", () => {
    const sim = () => {
      const w = makeWorld({ seed: 21, players: 2 });
      w.kills = killsForLevel(40);
      w.level = 40;
      for (const id of WEAPON_IDS) {
        w.unlocked.includes(id) || w.unlocked.push(id);
        for (const p of w.players) p.ammo[id] = 99;
      }
      for (let i = 0; i < 1500; i++) {
        step(w, [
          { moveX: Math.sin(i / 40), moveY: Math.cos(i / 55), fire: true, switchWeapon: false, select: i % 90 === 0 ? (i / 90) % 10 : undefined },
          { moveX: -1, moveY: 0.2, fire: true, switchWeapon: i % 120 === 0 },
        ]);
      }
      return JSON.stringify({ ...w, map: null, flow: null });
    };
    expect(sim()).toBe(sim());
  });
});
