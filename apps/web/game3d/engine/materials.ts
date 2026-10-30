import * as THREE from "three";

/**
 * Shared uniforms for the "see-through" effect: static decor that sits between the camera
 * and a player is dithered away in a soft circle, so houses and canopies never hide the players.
 */
export const fadeUniforms = {
  uFadeA: { value: new THREE.Vector3() },
  uFadeB: { value: new THREE.Vector3() },
  uFadeOn: { value: new THREE.Vector2(0, 0) },
  uFadeR: { value: 1.9 },
  uFadeMinY: { value: 0.3 },
};

const FADE_VERT_HEAD = /* glsl */ `
varying vec3 vFadeWorld;
`;
const FADE_VERT_BODY = /* glsl */ `
vec4 fadeWp = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fadeWp = instanceMatrix * fadeWp;
#endif
vFadeWorld = (modelMatrix * fadeWp).xyz;
`;
const FADE_FRAG_HEAD = /* glsl */ `
varying vec3 vFadeWorld;
uniform vec3 uFadeA;
uniform vec3 uFadeB;
uniform vec2 uFadeOn;
uniform float uFadeR;
uniform float uFadeMinY;
#define FADE_BAYER2(a) fract(dot(floor(a), vec2(0.5, floor(a).y * 0.75)))
#define FADE_BAYER4(a) (FADE_BAYER2(0.5 * (a)) * 0.25 + FADE_BAYER2(a))
float fadeAmount(vec3 target) {
  vec3 toT = target - cameraPosition;
  float lenT = length(toT);
  vec3 dir = toT / lenT;
  vec3 toP = vFadeWorld - cameraPosition;
  float along = dot(toP, dir);
  if (along > lenT - 0.25) return 0.0;
  float perp = length(toP - dir * along);
  return 1.0 - smoothstep(uFadeR * 0.5, uFadeR, perp);
}
`;
const FADE_FRAG_BODY = /* glsl */ `
if (vFadeWorld.y > uFadeMinY) {
  float fadeF = max(uFadeOn.x * fadeAmount(uFadeA), uFadeOn.y * fadeAmount(uFadeB));
  if (fadeF > 0.0 && fadeF * 0.85 > FADE_BAYER4(gl_FragCoord.xy) + 0.02) discard;
}
`;

function withFade<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, fadeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FADE_VERT_HEAD}`)
      .replace("#include <project_vertex>", `#include <project_vertex>\n${FADE_VERT_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FADE_FRAG_HEAD}`)
      .replace("#include <clipping_planes_fragment>", `${FADE_FRAG_BODY}\n#include <clipping_planes_fragment>`);
  };
  mat.customProgramCacheKey = () => "kpp-fade";
  return mat;
}

export interface Materials {
  ground: THREE.MeshLambertMaterial;
  decor: THREE.MeshLambertMaterial;
  decorGlow: THREE.MeshBasicMaterial;
  actor: THREE.MeshLambertMaterial;
  glow: THREE.MeshBasicMaterial;
  blob: THREE.MeshBasicMaterial;
  additive: THREE.MeshBasicMaterial;
  dispose(): void;
}

function blobTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.6, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMaterials(): Materials {
  const blobTex = blobTexture();
  const m: Omit<Materials, "dispose"> = {
    ground: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    decor: withFade(new THREE.MeshLambertMaterial({ color: 0xffffff })),
    decorGlow: withFade(new THREE.MeshBasicMaterial({ color: 0xffffff })),
    actor: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blob: new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: 0.55, depthWrite: false }),
    additive: new THREE.MeshBasicMaterial({ color: 0xffffff, map: blobTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  return {
    ...m,
    dispose() {
      for (const mat of Object.values(m)) mat.dispose();
      blobTex.dispose();
    },
  };
}
