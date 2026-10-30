import * as THREE from "three";
import type { EnemyKind, WeaponId } from "@kampung/game-core";
import { CHARACTERS, HEROES, type Character } from "../../game/characters";
import type { BoxBatch } from "./batch";

/**
 * Voxel characters. A rig is a list of boxes, each attached to a joint group. Every frame the
 * entity view builds one matrix per group from a Pose and pushes every part into the shared
 * instanced batches, so all characters together cost two draw calls.
 */
export const G = { Body: 0, LegL: 1, LegR: 2, ArmL: 3, ArmR: 4, Head: 5 } as const;
export type G = (typeof G)[keyof typeof G];
const GROUPS = 6;

interface PartDef {
  g: G;
  c: number;
  /** centre x, y, z (model space, feet at y = 0, front faces +z) */
  p: [number, number, number];
  /** size w, h, d */
  s: [number, number, number];
  glow?: boolean;
}

export interface RigDef {
  parts: PartDef[];
  hip: number;
  shoulder: number;
  shoulderX: number;
  neck: number;
  /** Arm length, for attaching held items to the right hand. */
  arm: number;
}

interface Part {
  g: G;
  color: THREE.Color;
  local: THREE.Matrix4;
  glow: boolean;
}

export interface Rig {
  def: RigDef;
  parts: Part[];
}

export interface Pose {
  legL: number;
  legR: number;
  armL: number;
  armR: number;
  headYaw: number;
  headPitch: number;
  bodyPitch: number;
}

export const neutralPose = (): Pose => ({ legL: 0, legR: 0, armL: 0, armR: 0, headYaw: 0, headPitch: 0, bodyPitch: 0 });

const mirror = (parts: PartDef[], g: G): PartDef[] => parts.map((p) => ({ ...p, g, p: [-p.p[0], p.p[1], p.p[2]] }));

function compile(def: RigDef): Rig {
  return {
    def,
    parts: def.parts.map((d) => ({
      g: d.g,
      color: new THREE.Color(d.c),
      glow: d.glow ?? false,
      local: new THREE.Matrix4().compose(new THREE.Vector3(...d.p), new THREE.Quaternion(), new THREE.Vector3(...d.s)),
    })),
  };
}

// ---------- players ----------
const SKIN = 0xc68a5a;

function abu(): RigDef {
  const baju = 0x2f62c0;
  const seluar = 0x2850a0;
  const legL: PartDef[] = [
    { g: G.LegL, c: seluar, p: [-0.09, 0.2, 0], s: [0.14, 0.34, 0.16] },
    { g: G.LegL, c: 0x2a1a10, p: [-0.09, 0.03, 0.02], s: [0.15, 0.06, 0.2] },
  ];
  const armL: PartDef[] = [
    { g: G.ArmL, c: baju, p: [-0.26, 0.55, 0], s: [0.12, 0.34, 0.14] },
    { g: G.ArmL, c: SKIN, p: [-0.26, 0.35, 0], s: [0.11, 0.08, 0.12] },
  ];
  return {
    hip: 0.36, shoulder: 0.71, shoulderX: 0.26, neck: 0.74, arm: 0.4,
    parts: [
      ...legL, ...mirror(legL, G.LegR),
      { g: G.Body, c: baju, p: [0, 0.57, 0], s: [0.4, 0.36, 0.24] },
      { g: G.Body, c: 0x7a1f2a, p: [0, 0.41, 0], s: [0.42, 0.16, 0.26] },
      { g: G.Body, c: 0xc9a23a, p: [0, 0.455, 0], s: [0.43, 0.03, 0.27] },
      { g: G.Body, c: 0x2550a8, p: [0, 0.75, 0.01], s: [0.2, 0.05, 0.2] },
      { g: G.Body, c: 0xe0c060, p: [0, 0.66, 0.122], s: [0.03, 0.03, 0.01] },
      { g: G.Body, c: 0xe0c060, p: [0, 0.6, 0.122], s: [0.03, 0.03, 0.01] },
      ...armL, ...mirror(armL, G.ArmR),
      { g: G.Head, c: SKIN, p: [0, 0.9, 0], s: [0.32, 0.31, 0.3] },
      { g: G.Head, c: 0x111111, p: [0, 1.1, -0.005], s: [0.33, 0.13, 0.31] },
      { g: G.Head, c: 0x1a1208, p: [0, 1.03, -0.02], s: [0.335, 0.03, 0.3] },
      { g: G.Head, c: 0x1b120c, p: [-0.075, 0.91, 0.151], s: [0.05, 0.06, 0.01] },
      { g: G.Head, c: 0x1b120c, p: [0.075, 0.91, 0.151], s: [0.05, 0.06, 0.01] },
      { g: G.Head, c: 0x9a5a3a, p: [0, 0.82, 0.151], s: [0.08, 0.02, 0.01] },
    ],
  };
}

function siti(): RigDef {
  const baju = 0xe06a9a;
  const kain = 0xb84876;
  const tudung = 0xf4e2ec;
  const legL: PartDef[] = [
    { g: G.LegL, c: kain, p: [-0.08, 0.2, 0], s: [0.15, 0.32, 0.17] },
    { g: G.LegL, c: 0x3a1a20, p: [-0.08, 0.03, 0.03], s: [0.14, 0.06, 0.19] },
  ];
  const armL: PartDef[] = [
    { g: G.ArmL, c: baju, p: [-0.25, 0.54, 0], s: [0.12, 0.36, 0.14] },
    { g: G.ArmL, c: SKIN, p: [-0.25, 0.33, 0], s: [0.1, 0.07, 0.11] },
  ];
  return {
    hip: 0.36, shoulder: 0.7, shoulderX: 0.25, neck: 0.74, arm: 0.42,
    parts: [
      ...legL, ...mirror(legL, G.LegR),
      { g: G.Body, c: kain, p: [0, 0.3, 0], s: [0.38, 0.2, 0.26] },
      { g: G.Body, c: 0xf0b0c8, p: [0.08, 0.3, 0.131], s: [0.05, 0.05, 0.01] },
      { g: G.Body, c: 0xf0b0c8, p: [-0.1, 0.26, 0.131], s: [0.04, 0.04, 0.01] },
      { g: G.Body, c: baju, p: [0, 0.55, 0], s: [0.41, 0.42, 0.25] },
      { g: G.Body, c: tudung, p: [0, 0.74, 0.0], s: [0.42, 0.12, 0.29] },
      { g: G.Body, c: tudung, p: [0, 0.67, 0.1], s: [0.3, 0.14, 0.08] },
      ...armL, ...mirror(armL, G.ArmR),
      { g: G.Head, c: SKIN, p: [0, 0.9, 0.0], s: [0.29, 0.28, 0.3] },
      { g: G.Head, c: tudung, p: [0, 0.94, -0.03], s: [0.34, 0.37, 0.3] },
      { g: G.Head, c: tudung, p: [0, 1.08, 0.04], s: [0.32, 0.08, 0.24] },
      { g: G.Head, c: 0x1b120c, p: [-0.065, 0.9, 0.151], s: [0.05, 0.06, 0.01] },
      { g: G.Head, c: 0x1b120c, p: [0.065, 0.9, 0.151], s: [0.05, 0.06, 0.01] },
      { g: G.Head, c: 0xb85060, p: [0, 0.82, 0.151], s: [0.07, 0.02, 0.01] },
    ],
  };
}

interface PersonOpts {
  skin: number;
  top: number;
  bottom: number;
  shoe: number;
  sleeves: "long" | "short";
  /** A skirt, sarung or long top drawn over the upper legs. */
  skirt?: { color: number; length: number };
  hair: "short" | "bun" | "braid" | "none";
  hairColor: number;
  hat?: { kind: "kopiah" | "cap" | "tudung"; color: number };
  beard?: number;
  glasses?: boolean;
  bindi?: boolean;
}

/** Shared build for the extra heroes: same proportions and joints as Abu and Siti, different outfits. */
function person(o: PersonOpts): RigDef {
  const legL: PartDef[] = [
    { g: G.LegL, c: o.bottom, p: [-0.085, 0.2, 0], s: [0.14, 0.34, 0.16] },
    { g: G.LegL, c: o.shoe, p: [-0.085, 0.03, 0.025], s: [0.15, 0.06, 0.2] },
  ];
  const armL: PartDef[] =
    o.sleeves === "long"
      ? [
          { g: G.ArmL, c: o.top, p: [-0.26, 0.54, 0], s: [0.12, 0.34, 0.14] },
          { g: G.ArmL, c: o.skin, p: [-0.26, 0.35, 0], s: [0.11, 0.08, 0.12] },
        ]
      : [
          { g: G.ArmL, c: o.top, p: [-0.26, 0.63, 0], s: [0.125, 0.16, 0.15] },
          { g: G.ArmL, c: o.skin, p: [-0.26, 0.45, 0], s: [0.11, 0.2, 0.12] },
        ];
  const parts: PartDef[] = [
    ...legL,
    ...mirror(legL, G.LegR),
    { g: G.Body, c: o.top, p: [0, 0.55, 0], s: [0.4, 0.4, 0.24] },
    ...armL,
    ...mirror(armL, G.ArmR),
    { g: G.Head, c: o.skin, p: [0, 0.9, 0], s: [0.31, 0.3, 0.3] },
    { g: G.Head, c: 0x1b120c, p: [-0.07, 0.91, 0.151], s: [0.05, 0.06, 0.01] },
    { g: G.Head, c: 0x1b120c, p: [0.07, 0.91, 0.151], s: [0.05, 0.06, 0.01] },
    { g: G.Head, c: 0x8a4a38, p: [0, 0.82, 0.151], s: [0.08, 0.02, 0.01] },
  ];
  if (o.skirt) {
    const h = o.skirt.length;
    parts.push({ g: G.Body, c: o.skirt.color, p: [0, 0.4 - h / 2 + 0.1, 0], s: [0.4, h, 0.27] });
  }
  if (o.hair !== "none") {
    parts.push(
      { g: G.Head, c: o.hairColor, p: [0, 1.07, -0.01], s: [0.33, 0.12, 0.31] },
      { g: G.Head, c: o.hairColor, p: [0, 0.97, -0.1], s: [0.32, 0.22, 0.1] },
    );
    if (o.hair === "bun") {
      parts.push(
        { g: G.Head, c: o.hairColor, p: [-0.14, 1.17, -0.02], s: [0.1, 0.1, 0.1] },
        { g: G.Head, c: o.hairColor, p: [0.14, 1.17, -0.02], s: [0.1, 0.1, 0.1] },
      );
    }
    if (o.hair === "braid") {
      parts.push({ g: G.Body, c: o.hairColor, p: [0, 0.55, -0.16], s: [0.07, 0.5, 0.07] });
    }
  }
  if (o.hat?.kind === "kopiah") parts.push({ g: G.Head, c: o.hat.color, p: [0, 1.1, 0], s: [0.32, 0.11, 0.3] });
  if (o.hat?.kind === "cap") {
    parts.push(
      { g: G.Head, c: o.hat.color, p: [0, 1.1, 0], s: [0.34, 0.1, 0.32] },
      { g: G.Head, c: o.hat.color, p: [0, 1.04, 0.18], s: [0.28, 0.02, 0.12] },
    );
  }
  if (o.hat?.kind === "tudung") {
    parts.push(
      { g: G.Body, c: o.hat.color, p: [0, 0.74, 0], s: [0.42, 0.12, 0.29] },
      { g: G.Head, c: o.hat.color, p: [0, 0.95, -0.03], s: [0.34, 0.37, 0.3] },
      { g: G.Head, c: o.hat.color, p: [0, 1.08, 0.04], s: [0.32, 0.08, 0.24] },
    );
  }
  if (o.beard !== undefined) parts.push({ g: G.Head, c: o.beard, p: [0, 0.79, 0.12], s: [0.22, 0.1, 0.1] });
  if (o.glasses) {
    parts.push(
      { g: G.Head, c: 0x3a2a20, p: [-0.075, 0.915, 0.154], s: [0.1, 0.075, 0.01] },
      { g: G.Head, c: 0x3a2a20, p: [0.075, 0.915, 0.154], s: [0.1, 0.075, 0.01] },
      { g: G.Head, c: 0x3a2a20, p: [0, 0.92, 0.154], s: [0.04, 0.02, 0.01] },
    );
  }
  if (o.bindi) parts.push({ g: G.Head, c: 0xd02030, p: [0, 0.99, 0.152], s: [0.03, 0.03, 0.01] });
  return { hip: 0.36, shoulder: 0.7, shoulderX: 0.26, neck: 0.74, arm: 0.4, parts };
}

const RIG_BUILDERS: Record<Character, () => RigDef> = {
  abu,
  siti,
  ahmeng: () =>
    person({ ...look("ahmeng"), shoe: 0xe8e8e8, sleeves: "short", hair: "short", hairColor: 0x15110d, hat: { kind: "cap", color: 0x2a4a8a } }),
  meiling: () =>
    person({ ...look("meiling"), shoe: 0xf0f0f0, sleeves: "short", bottom: 0xe6bf9a, skirt: { color: 0x2a6a80, length: 0.18 }, hair: "bun", hairColor: 0x15110d }),
  muthu: () => person({ ...look("muthu"), shoe: 0x2a1a10, sleeves: "long", hair: "short", hairColor: 0x15110d }),
  kavitha: () =>
    person({ ...look("kavitha"), shoe: 0x4a2a14, sleeves: "long", skirt: { color: 0x2e8a52, length: 0.34 }, hair: "braid", hairColor: 0x15110d, bindi: true }),
  hamid: () =>
    person({ ...look("hamid"), shoe: 0x2a1a10, sleeves: "long", skirt: { color: 0x6a3a2a, length: 0.32 }, hair: "none", hairColor: 0xf2f2f2, hat: { kind: "kopiah", color: 0xf4f0e6 }, beard: 0xd8d8d8 }),
  kiah: () =>
    person({ ...look("kiah"), shoe: 0x3a1a20, sleeves: "long", skirt: { color: 0x5a2a6a, length: 0.32 }, hair: "none", hairColor: 0x000000, hat: { kind: "tudung", color: 0xd8c0e8 }, glasses: true }),
};

/** Outfit colours come from the shared hero table so the select screen and the 3D model always match. */
function look(c: Character): { skin: number; top: number; bottom: number } {
  const l = HEROES[c].look;
  return { skin: l.skin, top: l.top, bottom: l.bottom };
}

// ---------- enemies ----------
function pocong(): RigDef {
  const kain = 0xe9e4d4;
  const tie = 0xa8a290;
  return {
    hip: 0.3, shoulder: 0.8, shoulderX: 0.2, neck: 0.86, arm: 0.3,
    parts: [
      { g: G.Body, c: 0xd8d2c0, p: [0, 0.07, 0], s: [0.34, 0.14, 0.3] },
      { g: G.Body, c: kain, p: [0, 0.46, 0], s: [0.42, 0.78, 0.36] },
      { g: G.Body, c: tie, p: [0, 0.15, 0], s: [0.44, 0.05, 0.38] },
      { g: G.Body, c: tie, p: [0, 0.5, 0], s: [0.44, 0.04, 0.38] },
      { g: G.Body, c: tie, p: [0, 0.85, 0], s: [0.4, 0.05, 0.36] },
      { g: G.Body, c: 0xd8d2c0, p: [0.05, 0.5, 0.185], s: [0.02, 0.6, 0.01] },
      { g: G.Head, c: kain, p: [0, 1.02, 0], s: [0.38, 0.32, 0.36] },
      { g: G.Head, c: 0x2a2a20, p: [0, 1.0, 0.181], s: [0.25, 0.22, 0.01] },
      { g: G.Head, c: 0x8c9478, p: [0, 1.0, 0.184], s: [0.19, 0.17, 0.01] },
      { g: G.Head, c: 0x050505, p: [-0.05, 1.03, 0.188], s: [0.05, 0.05, 0.01] },
      { g: G.Head, c: 0x050505, p: [0.05, 1.03, 0.188], s: [0.05, 0.05, 0.01] },
      { g: G.Head, c: 0x30302a, p: [0, 0.94, 0.188], s: [0.08, 0.025, 0.01] },
      { g: G.Head, c: tie, p: [0, 1.2, 0], s: [0.13, 0.06, 0.13] },
      { g: G.Head, c: kain, p: [0, 1.27, 0], s: [0.2, 0.09, 0.07] },
    ],
  };
}

function toyol(): RigDef {
  const skin = 0x5fa04a;
  const dark = 0x3f7a34;
  const legL: PartDef[] = [{ g: G.LegL, c: dark, p: [-0.07, 0.1, 0], s: [0.1, 0.2, 0.11] }];
  const armL: PartDef[] = [
    { g: G.ArmL, c: skin, p: [-0.18, 0.3, 0], s: [0.08, 0.2, 0.09] },
    { g: G.ArmL, c: dark, p: [-0.18, 0.18, 0.02], s: [0.09, 0.06, 0.1] },
  ];
  return {
    hip: 0.2, shoulder: 0.39, shoulderX: 0.18, neck: 0.4, arm: 0.24,
    parts: [
      ...legL, ...mirror(legL, G.LegR),
      { g: G.Body, c: skin, p: [0, 0.3, 0], s: [0.27, 0.22, 0.21] },
      { g: G.Body, c: 0x8a2020, p: [0, 0.205, 0], s: [0.28, 0.07, 0.22] },
      { g: G.Body, c: 0x6ab055, p: [0, 0.3, 0.1], s: [0.15, 0.12, 0.03] },
      ...armL, ...mirror(armL, G.ArmR),
      { g: G.Head, c: skin, p: [0, 0.54, 0], s: [0.33, 0.28, 0.28] },
      { g: G.Head, c: dark, p: [-0.2, 0.57, -0.02], s: [0.07, 0.13, 0.04] },
      { g: G.Head, c: dark, p: [0.2, 0.57, -0.02], s: [0.07, 0.13, 0.04] },
      { g: G.Head, c: 0xff3a18, p: [-0.075, 0.57, 0.142], s: [0.08, 0.07, 0.01], glow: true },
      { g: G.Head, c: 0xff3a18, p: [0.075, 0.57, 0.142], s: [0.08, 0.07, 0.01], glow: true },
      { g: G.Head, c: 0x1a0c08, p: [0, 0.46, 0.142], s: [0.16, 0.035, 0.01] },
      { g: G.Head, c: 0xf0f0e0, p: [-0.04, 0.47, 0.145], s: [0.025, 0.02, 0.01] },
      { g: G.Head, c: 0xf0f0e0, p: [0.04, 0.47, 0.145], s: [0.025, 0.02, 0.01] },
      { g: G.Head, c: 0x223318, p: [0, 0.71, 0], s: [0.05, 0.07, 0.05] },
    ],
  };
}

function pontianak(): RigDef {
  const dress = 0xe6e6ee;
  const pale = 0xd8d6cc;
  const hair = 0x0b0b10;
  const armL: PartDef[] = [
    { g: G.ArmL, c: dress, p: [-0.25, 0.86, 0], s: [0.12, 0.36, 0.13] },
    { g: G.ArmL, c: pale, p: [-0.25, 0.64, 0], s: [0.1, 0.1, 0.1] },
    { g: G.ArmL, c: 0x202018, p: [-0.25, 0.57, 0], s: [0.1, 0.06, 0.05] },
  ];
  const hem: PartDef[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    hem.push({ g: G.Body, c: i % 2 ? 0xcfcfd8 : dress, p: [Math.sin(a) * 0.2, 0.04 + (i % 3) * 0.02, Math.cos(a) * 0.16], s: [0.13, 0.1 + (i % 2) * 0.06, 0.12] });
  }
  return {
    hip: 0.6, shoulder: 1.04, shoulderX: 0.25, neck: 1.06, arm: 0.48,
    parts: [
      { g: G.Body, c: dress, p: [0, 0.38, 0], s: [0.5, 0.62, 0.42] },
      ...hem,
      { g: G.Body, c: dress, p: [0, 0.86, 0], s: [0.4, 0.4, 0.3] },
      { g: G.Body, c: 0x9a2a2a, p: [0.06, 0.8, 0.152], s: [0.08, 0.12, 0.01] },
      ...armL, ...mirror(armL, G.ArmR),
      { g: G.Head, c: pale, p: [0, 1.22, 0], s: [0.31, 0.32, 0.3] },
      { g: G.Head, c: 0xff1a10, p: [-0.065, 1.25, 0.151], s: [0.07, 0.04, 0.01], glow: true },
      { g: G.Head, c: 0xff1a10, p: [0.065, 1.25, 0.151], s: [0.07, 0.04, 0.01], glow: true },
      { g: G.Head, c: 0x400808, p: [0, 1.12, 0.151], s: [0.11, 0.04, 0.01] },
      { g: G.Head, c: 0xffffff, p: [-0.03, 1.105, 0.153], s: [0.02, 0.025, 0.01] },
      { g: G.Head, c: 0xffffff, p: [0.03, 1.105, 0.153], s: [0.02, 0.025, 0.01] },
      { g: G.Head, c: hair, p: [0, 1.4, -0.02], s: [0.36, 0.07, 0.34] },
      { g: G.Head, c: hair, p: [0, 1.0, -0.17], s: [0.4, 0.84, 0.08] },
      { g: G.Head, c: hair, p: [-0.175, 1.06, 0.03], s: [0.05, 0.62, 0.26] },
      { g: G.Head, c: hair, p: [0.175, 1.06, 0.03], s: [0.05, 0.62, 0.26] },
      { g: G.Head, c: hair, p: [-0.115, 1.27, 0.155], s: [0.07, 0.22, 0.02] },
      { g: G.Head, c: hair, p: [0.12, 1.3, 0.155], s: [0.06, 0.16, 0.02] },
    ],
  };
}

/** Indexed by `characterIndex`. */
export const PLAYER_RIGS: Rig[] = CHARACTERS.map((c) => compile(RIG_BUILDERS[c]()));
export const ENEMY_RIGS: Record<EnemyKind, Rig> = {
  pocong: compile(pocong()),
  toyol: compile(toyol()),
  pontianak: compile(pontianak()),
};

// ---------- held weapons (right-hand space: hand at y = -arm, local -y points forward when aiming) ----------
type Held = { c: number; p: [number, number, number]; s: [number, number, number]; glow?: boolean }[];
const HELD: Record<WeaponId, Held> = {
  lastik: [
    { c: 0x7a5232, p: [0, -0.06, 0.0], s: [0.05, 0.16, 0.05] },
    { c: 0x7a5232, p: [-0.05, -0.17, 0], s: [0.04, 0.1, 0.04] },
    { c: 0x7a5232, p: [0.05, -0.17, 0], s: [0.04, 0.1, 0.04] },
    { c: 0xa03028, p: [0, -0.2, 0], s: [0.12, 0.02, 0.02] },
  ],
  uzi: [
    { c: 0x202024, p: [0, -0.1, 0.02], s: [0.08, 0.26, 0.1] },
    { c: 0x2c2c30, p: [0, -0.04, 0.09], s: [0.06, 0.06, 0.12] },
  ],
  senapangPatah: [
    { c: 0x5a3a20, p: [0, 0.02, 0.02], s: [0.08, 0.18, 0.1] },
    { c: 0x2a2a2e, p: [0, -0.24, 0.03], s: [0.06, 0.42, 0.06] },
  ],
  pagarBuluh: [
    { c: 0x9a8a44, p: [-0.06, -0.12, 0.05], s: [0.05, 0.05, 0.4] },
    { c: 0x8a7a3e, p: [0.0, -0.12, 0.05], s: [0.05, 0.05, 0.4] },
    { c: 0x9a8a44, p: [0.06, -0.12, 0.05], s: [0.05, 0.05, 0.4] },
  ],
  tongGas: [
    { c: 0xc0302a, p: [0, -0.12, 0.05], s: [0.18, 0.22, 0.18] },
    { c: 0xd0d0d0, p: [0, -0.12, 0.15], s: [0.06, 0.06, 0.04] },
  ],
  bomIkan: [
    { c: 0x2a2a20, p: [0, -0.1, 0.03], s: [0.12, 0.12, 0.12] },
    { c: 0xffa040, p: [0, -0.1, 0.11], s: [0.03, 0.03, 0.05], glow: true },
  ],
  mercunBola: [
    { c: 0xb02020, p: [0, -0.1, 0.03], s: [0.13, 0.13, 0.13] },
    { c: 0xe0c040, p: [0, -0.1, 0.03], s: [0.14, 0.03, 0.14] },
  ],
  meriamBuluh: [
    { c: 0x6a8a3a, p: [0, -0.18, 0.08], s: [0.13, 0.55, 0.13] },
    { c: 0x4a6a2a, p: [0, -0.06, 0.08], s: [0.15, 0.04, 0.15] },
    { c: 0x4a6a2a, p: [0, -0.34, 0.08], s: [0.15, 0.04, 0.15] },
  ],
};

const heldCache = new Map<WeaponId, { m: THREE.Matrix4; c: THREE.Color; glow: boolean }[]>();
function heldParts(w: WeaponId) {
  let v = heldCache.get(w);
  if (!v) {
    v = HELD[w].map((h) => ({
      m: new THREE.Matrix4().compose(new THREE.Vector3(...h.p), new THREE.Quaternion(), new THREE.Vector3(...h.s)),
      c: new THREE.Color(h.c),
      glow: h.glow ?? false,
    }));
    heldCache.set(w, v);
  }
  return v;
}

// ---------- posing ----------
const groupM: THREE.Matrix4[] = Array.from({ length: GROUPS }, () => new THREE.Matrix4());
const tmp = new THREE.Matrix4();
const tmp2 = new THREE.Matrix4();
const rot = new THREE.Matrix4();
const outM = new THREE.Matrix4();
const flashC = new THREE.Color(0xffffff);
const tintC = new THREE.Color();

function jointMatrix(out: THREE.Matrix4, root: THREE.Matrix4, px: number, py: number, rx: number, ry = 0): void {
  // root * T(pivot) * R * T(-pivot)
  out.copy(root).multiply(tmp.makeTranslation(px, py, 0));
  if (ry !== 0) out.multiply(rot.makeRotationY(ry));
  if (rx !== 0) out.multiply(rot.makeRotationX(rx));
  out.multiply(tmp2.makeTranslation(-px, -py, 0));
}

export interface DrawOpts {
  /** 0 = normal, 1 = full white flash */
  flash: number;
  /** multiply colour (e.g. darken when downed) */
  shade: number;
  held?: WeaponId;
}

/** Pushes every box of the rig with the given root transform and pose. */
export function drawRig(rig: Rig, root: THREE.Matrix4, pose: Pose, lit: BoxBatch, glow: BoxBatch, o: DrawOpts): void {
  const d = rig.def;
  const body = groupM[G.Body]!;
  jointMatrix(body, root, 0, d.hip, pose.bodyPitch);
  jointMatrix(groupM[G.LegL]!, root, 0, d.hip, pose.legL);
  jointMatrix(groupM[G.LegR]!, root, 0, d.hip, pose.legR);
  jointMatrix(groupM[G.ArmL]!, body, 0, d.shoulder, pose.armL);
  jointMatrix(groupM[G.ArmR]!, body, 0, d.shoulder, pose.armR);
  jointMatrix(groupM[G.Head]!, body, 0, d.neck, pose.headPitch, pose.headYaw);

  for (const p of rig.parts) {
    outM.multiplyMatrices(groupM[p.g]!, p.local);
    if (p.glow) {
      glow.pushMatrix(outM, p.color);
    } else {
      tintC.copy(p.color).multiplyScalar(o.shade);
      if (o.flash > 0) tintC.lerp(flashC, o.flash);
      lit.pushMatrix(outM, tintC);
    }
  }

  if (o.held) {
    const hand = groupM[G.ArmR]!;
    tmp.makeTranslation(d.shoulderX, d.shoulder - d.arm, 0.0);
    for (const h of heldParts(o.held)) {
      outM.multiplyMatrices(hand, tmp).multiply(h.m);
      if (h.glow) glow.pushMatrix(outM, h.c);
      else {
        tintC.copy(h.c).multiplyScalar(o.shade);
        if (o.flash > 0) tintC.lerp(flashC, o.flash);
        lit.pushMatrix(outM, tintC);
      }
    }
  }
}
