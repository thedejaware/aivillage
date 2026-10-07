/**
 * Shared palette, materials and geometries for the village scene.
 * Everything is cached module-wide so hundreds of props share a handful of
 * GPU resources. Glow/beam materials are registered so night can brighten them.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** "WareTrack" palette — bright, clean, toy-like. */
export const P = {
  ground: "#eef2f7",
  groundSide: "#dfe6ef",
  groundBase: "#cfd8e4",
  road: "#d5dce6",
  roadDash: "#ffffff",
  roadEdge: "#f2c14e",
  grass: "#cfe9d6",
  grassDark: "#a9d8b8",
  foliage: "#7cc79a",
  foliageDark: "#5fb383",
  accent: "#2f6bff",
  deepBlue: "#1f3c88",
  wood: "#c9a27a",
  woodDark: "#a07c58",
  cafeRoof: "#ff8f6b",
  cafeWall: "#fff6ee",
  stage: "#ffd27a",
  stageRim: "#f4b860",
  blanket: "#ff8fa3",
  lampGlow: "#ffe9a8",
  text: "#1b2433",
  muted: "#6b7a90",
  metal: "#8c9bb0",
  white: "#ffffff",
  pad: "#f7f9fc"
} as const;

/** Venue accent colours (signs + ground decals). */
export const ZONE_ACCENT: Record<string, string> = {
  plaza: "#2fbfa5",
  maker_space: "#ff9a4d",
  network_hub: "#3dbf7a",
  event_space: "#ff7a8a"
};

export const FLOWER_COLORS = ["#ff8fa3", "#ffd27a", "#ffffff", "#b9a5ff", "#ff9a4d"] as const;

// ---------------- materials ----------------

const solids = new Map<string, THREE.MeshStandardMaterial>();

/** Matte, lit material. `flat` gives faceted low-poly shading (foliage). */
export function solid(color: string, rough = 0.85, flat = false): THREE.MeshStandardMaterial {
  const key = `${color}|${rough}|${flat}`;
  let m = solids.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, flatShading: flat });
    solids.set(key, m);
  }
  return m;
}

const decals = new Map<string, THREE.MeshStandardMaterial>();

/** Translucent ground marking (no depth write, pulled toward the camera to avoid z-fighting). */
export function decal(color: string, opacity: number): THREE.MeshStandardMaterial {
  const key = `${color}|${opacity}`;
  let m = decals.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 1, metalness: 0, transparent: true, opacity, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    decals.set(key, m);
  }
  return m;
}

let nightness = 0;

interface Ramp<M> { m: M; day: number; night: number }
const glows = new Map<string, Ramp<THREE.MeshStandardMaterial>>();
const beams = new Map<string, Ramp<THREE.MeshBasicMaterial>>();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Emissive material whose intensity ramps from `day` to `night` as dusk falls. */
export function glow(color: string, day = 0.35, night = 1.9): THREE.MeshStandardMaterial {
  const key = `${color}|${day}|${night}`;
  let e = glows.get(key);
  if (!e) {
    const m = new THREE.MeshStandardMaterial({
      color, emissive: color, roughness: 0.4, metalness: 0, emissiveIntensity: lerp(day, night, nightness)
    });
    e = { m, day, night };
    glows.set(key, e);
  }
  return e.m;
}

/** Soft light-beam material (stage spots) that is faint by day and visible at night. */
export function beam(color: string, day = 0.04, night = 0.16): THREE.MeshBasicMaterial {
  const key = `${color}|${day}|${night}`;
  let e = beams.get(key);
  if (!e) {
    const m = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: lerp(day, night, nightness), depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false
    });
    e = { m, day, night };
    beams.set(key, e);
  }
  return e.m;
}

/** 0 = noon, 1 = midnight. Drives every registered glow/beam material. */
export function setNightness(n: number): void {
  nightness = Math.min(1, Math.max(0, n));
  for (const e of glows.values()) e.m.emissiveIntensity = lerp(e.day, e.night, nightness);
  for (const e of beams.values()) e.m.opacity = lerp(e.day, e.night, nightness);
}

// ---------------- geometries ----------------

const geos = new Map<string, THREE.BufferGeometry>();

export function cachedGeo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geos.get(key) as T | undefined;
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

/** Unit primitives, scaled per mesh so every prop of a kind shares one buffer. */
export const unit = {
  box: () => cachedGeo("u:box", () => new THREE.BoxGeometry(1, 1, 1)),
  cyl: () => cachedGeo("u:cyl", () => new THREE.CylinderGeometry(1, 1, 1, 20)),
  cyl8: () => cachedGeo("u:cyl8", () => new THREE.CylinderGeometry(1, 1, 1, 8)),
  ball: () => cachedGeo("u:ball", () => new THREE.SphereGeometry(1, 16, 12)),
  ico: () => cachedGeo("u:ico", () => new THREE.IcosahedronGeometry(1, 0)),
  cone: () => cachedGeo("u:cone", () => new THREE.ConeGeometry(1, 1, 7)),
  dome: () => cachedGeo("u:dome", () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2))
};

/** Rounded box cached by size (rounded corners can't be scaled non-uniformly). */
export function roundedBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
  return cachedGeo(`rb:${w}:${h}:${d}:${rr}`, () => new RoundedBoxGeometry(w, h, d, 3, Math.max(rr, 1e-3)));
}

/** Rounded-rectangle outline in the XY plane (used for flat lawns and pads). */
export function roundedRectShape(w: number, d: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  const rr = Math.min(r, w / 2, d / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + d - rr);
  s.quadraticCurveTo(x + w, y + d, x + w - rr, y + d);
  s.lineTo(x + rr, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/** Flat slab from a shape, lying on the ground with its top at `h`. */
export function flatSlab(key: string, shape: THREE.Shape, h: number): THREE.BufferGeometry {
  return cachedGeo(`slab:${key}:${h}`, () => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: h * 0.6, bevelEnabled: true, bevelThickness: h * 0.2, bevelSize: Math.min(0.03, h), bevelSegments: 2,
      curveSegments: 8
    });
    g.rotateX(-Math.PI / 2);
    g.translate(0, h * 0.2, 0);
    return g;
  });
}
