/**
 * Shared GPU resources for avatars: every geometry/material/texture is cached
 * module-wide (keyed by shape or colour), so ten villagers share a handful of
 * buffers. Nothing touches the DOM until first use (SSR-safe).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { colorHex, HAIR_COLORS, SKIN_TONES, type Appearance } from "@aivillage/shared";
import type { EyeState, MouthState } from "./pose";
import {
  HEAD_R, HEAD_Y, NECK_Y, RefPool, baseTorsoRadiusAt, torsoRadiusAt, beardCoverage, beardMask, faceDesign, faceTextureKey, headShape, torsoProfile, warpHead,
  type BodyShape, type HeadShape
} from "./features";
import { drawFace, EYE_X, EYE_Y, FACE_H, FACE_W, MOUTH_CANVAS_Y, type FaceArt } from "./faceArt";

export { HEAD_R, HEAD_Y, NECK_Y, EYE_X, EYE_Y };

// ---------------- dimensions (world units at scale 1) ----------------

export const SHOULDER_Y = 0.222;
export const UPPER_ARM = 0.115;
export const FOREARM = 0.1;

// ---------------- colours ----------------

export function shade(hex: string, amount: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${c.getHexString()}`;
}

/** Perceived lightness 0..1 (to pick contrasting details). */
export function lightness(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// ---------------- materials ----------------

const mats = new Map<string, THREE.Material>();

export function mat(color: string, opts: { rough?: number; metal?: number; side?: THREE.Side; opacity?: number } = {}): THREE.MeshStandardMaterial {
  const rough = opts.rough ?? 0.7;
  const metal = opts.metal ?? 0;
  const side = opts.side ?? THREE.FrontSide;
  const opacity = opts.opacity ?? 1;
  const key = `s|${color}|${rough}|${metal}|${side}|${opacity}`;
  let m = mats.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: rough, metalness: metal, side,
      transparent: opacity < 1, opacity, depthWrite: opacity >= 1
    });
    mats.set(key, m);
  }
  return m;
}

// ---------------- geometries ----------------

const geos = new Map<string, THREE.BufferGeometry>();

export function geo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geos.get(key);
  if (!g) {
    g = build();
    g.computeBoundingSphere();
    geos.set(key, g);
  }
  return g;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Clone + transform a primitive so many can be merged into one buffer. */
export function place(
  g: THREE.BufferGeometry,
  pos: [number, number, number],
  rot: [number, number, number] = [0, 0, 0],
  scl: [number, number, number] = [1, 1, 1]
): THREE.BufferGeometry {
  tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2]));
  tmpM.compose(new THREE.Vector3(...pos), tmpQ, new THREE.Vector3(...scl));
  const out = g.clone();
  out.applyMatrix4(tmpM);
  return out;
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const clean = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p;
    for (const name of Object.keys(q.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") q.deleteAttribute(name);
    return q;
  });
  const m = mergeGeometries(clean, false);
  if (!m) throw new Error("avatar: merge failed");
  return m;
}

export const sphere = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 5, 12);
export const rbox = (w: number, h: number, d: number, r = 0.01) => new RoundedBoxGeometry(w, h, d, 2, r);

/** Body geometries shared by every avatar. */
export const G = {
  ear: () => geo("ear", () => sphere(0.045, 12, 10)),
  pelvis: () => geo("pelvis", () => sphere(0.115, 20, 12).scale(1, 0.62, 0.8)),
  upperArm: () => geo("upperArm", () => capsule(0.037, 0.075).translate(0, -0.055, 0)),
  forearm: () => geo("forearm", () => capsule(0.033, 0.06).translate(0, -0.045, 0)),
  hand: () => geo("hand", () => sphere(0.043, 14, 10).scale(1, 1.05, 0.85).translate(0, -0.03, 0)),
  shortSleeve: () => geo("shortSleeve", () => capsule(0.047, 0.025).translate(0, -0.03, 0)),
  puffSleeve: () => geo("puffSleeve", () => sphere(0.058, 14, 10).scale(1, 0.85, 1).translate(0, -0.02, 0)),
  thigh: () => geo("thigh", () => capsule(0.052, 0.085).translate(0, -0.07, 0)),
  shorts: () => geo("shorts", () => capsule(0.06, 0.035).translate(0, -0.045, 0)),
  shin: () => geo("shin", () => capsule(0.045, 0.07).translate(0, -0.065, 0)),
  shoe: () => geo("shoe", () => rbox(0.09, 0.058, 0.145, 0.026).translate(0, 0.008, 0.025)),
  finger: () => geo("finger", () => capsule(0.014, 0.04).translate(0, -0.075, 0.0)),
  skirt: (len: number, flare: number) =>
    geo(`skirt|${len}|${flare}`, () => {
      const pts = [
        [0.112, 0.035], [0.124, 0.0], [0.124 + flare * 0.45, -len * 0.5], [0.124 + flare, -len], [0.118 + flare, -len - 0.008]
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const g = new THREE.LatheGeometry(pts, 28);
      g.scale(1, 1, 0.85);
      g.computeVertexNormals();
      return g;
    })
};

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Torso for a body shape: a lathe of the shape's profile (side-to-side), the
 * original front-to-back depth (so outfit details stay on the surface) and a
 * soft cartoon bust merged in when the shape has one.
 */
export function torsoGeometry(s: BodyShape): THREE.BufferGeometry {
  const prof = torsoProfile(s);
  const key = `torso|${prof.map(([r]) => r3(r)).join(",")}|${r3(s.depth)}|${r3(s.bust)}|${r3(s.chest)}`;
  return geo(key, () => {
    // subdivide the profile so the bust bump has rows to bend
    const pts: [number, number][] = [];
    for (let i = 0; i < prof.length - 1; i++) {
      const [r0, y0] = prof[i];
      const [r1, y1] = prof[i + 1];
      const steps = y1 - y0 > 0.03 ? 4 : 1;
      for (let k = 0; k < steps; k++) pts.push([r0 + ((r1 - r0) * k) / steps, y0 + ((y1 - y0) * k) / steps]);
    }
    pts.push(prof[prof.length - 1]);
    const lathe = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), 40);
    const pos = lathe.attributes.position as THREE.BufferAttribute;
    const amp = 0.024 * Math.min(s.bust, 1.4);
    const bx = s.chest * 0.42;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const rNew = torsoRadiusAt(s, y);
      const k = rNew > 1e-4 ? baseTorsoRadiusAt(y) / rNew : 1;
      let z = pos.getZ(i) * 0.78 * s.depth * k;
      if (amp > 0 && z > 0) {
        // soft cartoon bust: two smooth bumps on the front of the chest
        const dy = y - 0.158;
        const gy = Math.exp(-((dy / (dy > 0 ? 0.05 : 0.032)) ** 2));
        const gx = Math.exp(-(((x - bx) / 0.04) ** 2)) + Math.exp(-(((x + bx) / 0.04) ** 2));
        z += amp * gy * Math.min(1, gx) * Math.min(1, z / 0.05);
      }
      pos.setZ(i, z);
    }
    lathe.computeVertexNormals();
    return lathe;
  });
}

// ---------------- hair ----------------

export interface HairBuild {
  main: THREE.BufferGeometry | null;
  /** separately swaying locks (ponytail/pigtails), pivot at `pos` */
  tails: { geo: THREE.BufferGeometry; pos: [number, number, number]; rot: [number, number, number] }[];
}

/** Head-wear fit per style: scale + offset so hats sit over big hair. */
export const HAT_FIT: Record<string, { s: number; dy: number; dz: number }> = {
  afro: { s: 1.32, dy: 0.05, dz: -0.06 },
  curly: { s: 1.13, dy: 0.015, dz: -0.015 }
};
export const hatFit = (style: string) => HAT_FIT[style] ?? { s: 1, dy: 0, dz: 0 };

/** Hair shell: a sphere a bit larger than the head, shifted up/back so the face stays clear. */
const shell = (r: number, cy: number, cz: number, w = 40, h = 28) => place(sphere(r, w, h), [0, cy, cz]);

/** Hair hanging around the sides/back (bob, long), leaving the face open. */
const curtain = (profile: [number, number][], gap: number) => {
  const pts = profile.map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 28, gap, Math.PI * 2 - gap * 2);
};

/** Golden-spiral points on a sphere, skipping the face window. */
function bumps(count: number, radius: number, r: number, center: [number, number, number], faceLimit: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 1.6;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = ga * i;
    const d = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad);
    if (d.z > faceLimit && d.y < 0.55) continue;
    if (d.y < -0.45) continue;
    out.push(place(sphere(r, 10, 8), [center[0] + d.x * radius, center[1] + d.y * radius, center[2] + d.z * radius]));
  }
  return out;
}

/**
 * Bangs: thin locks of a shell around the forehead with a scalloped lower edge.
 * `ends` = how far down each lock reaches (theta from the top, ~1.0–1.3), left → right.
 */
function bangs(ends: number[], spread = 1.9, r = 0.236, center = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const w = spread / ends.length;
  ends.forEach((end, i) => {
    const phi = Math.PI / 2 - spread / 2 + center + i * w;
    parts.push(new THREE.SphereGeometry(r + (i % 2) * 0.002, 8, 18, phi - 0.02, w + 0.04, 0, end));
  });
  return merge(parts);
}

export function hairGeometry(style: string): HairBuild {
  const key = `hair|${style}`;
  const cached = hairCache.get(key);
  if (cached) return cached;
  const tails: HairBuild["tails"] = [];
  let parts: THREE.BufferGeometry[] = [];
  switch (style) {
    case "bald":
      break;
    case "buzz":
      parts = [shell(0.229, 0.014, -0.016)];
      break;
    case "short":
      parts = [
        shell(0.234, 0.022, -0.022),
        bangs([1.02, 1.12, 1.06, 1.14, 1.04], 1.7),
        place(sphere(0.06, 12, 10), [0.04, 0.2, 0.06], [0, 0, 0], [1.2, 0.6, 1]),
        place(sphere(0.05, 12, 10), [-0.05, 0.198, 0.08], [0, 0, 0], [1.2, 0.6, 1])
      ];
      break;
    case "side_part":
      parts = [
        shell(0.235, 0.024, -0.022),
        bangs([1.22, 1.16, 1.08, 1.0, 0.92, 0.86], 1.9, 0.238, -0.12),
        place(sphere(0.1, 20, 14), [-0.06, 0.185, 0.07], [-0.3, 0.0, 0.5], [1.7, 0.55, 1.2]),
        place(sphere(0.08, 16, 12), [-0.17, 0.08, 0.06], [0, 0, 0.2], [0.6, 1.1, 1.0])
      ];
      break;
    case "curly":
      parts = [shell(0.226, 0.02, -0.02), ...bumps(46, 0.228, 0.058, [0, 0.02, -0.02], 0.5)];
      break;
    case "afro":
      parts = [place(sphere(0.3, 24, 18), [0, 0.07, -0.1]), ...bumps(44, 0.29, 0.07, [0, 0.07, -0.1], 0.62)];
      break;
    case "mohawk": {
      parts = [shell(0.226, 0.01, -0.014, 40, 28)];
      const fin = [0.62, 0.3, -0.02, -0.34, -0.66, -0.98, -1.3];
      fin.forEach((a, i) => {
        const R = 0.2;
        const h = 1.75 - Math.abs(i - 2.2) * 0.17;
        parts.push(place(sphere(0.07, 12, 10), [0, Math.cos(a) * R, Math.sin(a) * R], [a, 0, 0], [0.38, h, 0.95]));
      });
      break;
    }
    case "bob":
      parts = [
        shell(0.234, 0.024, -0.022),
        bangs([1.16, 1.2, 1.18, 1.2, 1.17, 1.2, 1.16], 2.0),
        curtain([[0.17, 0.17], [0.228, 0.1], [0.245, 0.0], [0.243, -0.08], [0.235, -0.135], [0.215, -0.155], [0.2, -0.14]], 1.15)
      ];
      break;
    case "long":
      parts = [
        shell(0.235, 0.024, -0.022),
        bangs([1.2, 1.1, 0.98, 0.86, 0.98, 1.1, 1.2], 2.0),
        curtain([[0.17, 0.17], [0.23, 0.1], [0.245, 0.0], [0.242, -0.1], [0.232, -0.2], [0.222, -0.3], [0.212, -0.38], [0.19, -0.42], [0.175, -0.405]], 1.32)
      ];
      break;
    case "ponytail":
      parts = [
        shell(0.234, 0.026, -0.02),
        bangs([0.95, 1.0, 0.97, 1.0, 0.95], 1.7),
        place(new THREE.TorusGeometry(0.035, 0.014, 8, 16), [0, 0.1, -0.225], [0.35, 0, 0])
      ];
      tails.push({
        geo: merge([
          place(sphere(0.06, 14, 10), [0, -0.05, 0], [0, 0, 0], [1, 1.2, 1]),
          place(capsule(0.05, 0.2), [0, -0.15, 0]),
          place(sphere(0.04, 12, 10), [0, -0.27, 0.0])
        ]),
        pos: [0, 0.1, -0.245],
        rot: [0.7, 0, 0]
      });
      break;
    case "bun":
      parts = [
        shell(0.234, 0.026, -0.02),
        bangs([1.0, 0.94, 0.9, 0.94, 1.0], 1.6),
        place(sphere(0.088, 18, 14), [0, 0.215, -0.13]),
        place(new THREE.TorusGeometry(0.06, 0.014, 8, 18), [0, 0.18, -0.1], [-0.9, 0, 0])
      ];
      break;
    case "pigtails":
      parts = [
        shell(0.234, 0.024, -0.02),
        bangs([1.1, 1.16, 1.12, 1.16, 1.1], 1.8),
        place(new THREE.TorusGeometry(0.03, 0.013, 8, 14), [0.215, 0.04, -0.07], [0, Math.PI / 2, 0]),
        place(new THREE.TorusGeometry(0.03, 0.013, 8, 14), [-0.215, 0.04, -0.07], [0, Math.PI / 2, 0])
      ];
      for (const side of [1, -1]) {
        tails.push({
          geo: merge([place(capsule(0.05, 0.12), [0, -0.09, 0]), place(sphere(0.042, 12, 10), [0, -0.17, 0])]),
          pos: [side * 0.235, 0.04, -0.07],
          rot: [0.15, 0, side * 0.4]
        });
      }
      break;
    default:
      parts = [shell(0.234, 0.022, -0.022)];
  }
  const build: HairBuild = { main: parts.length ? merge(parts) : null, tails };
  if (build.main) build.main.computeBoundingSphere();
  hairCache.set(key, build);
  return build;
}
const hairCache = new Map<string, HairBuild>();

// ---------------- face (CanvasTexture decal) ----------------

/** The face decal is a patch of a sphere just outside the head. */
export const FACE = { r: HEAD_R * 1.007, phiLen: 1.6, thetaStart: Math.PI / 2 - 0.55, thetaLen: 1.2, w: FACE_W, h: FACE_H } as const;

/** Bend a geometry's vertices with the face shape's jaw warp (head frame). */
function warpGeometry(g: THREE.BufferGeometry, shape: HeadShape): THREE.BufferGeometry {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = warpHead(shape, pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, x, y, z);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const headGeometry = (faceShape: string) =>
  geo(`head|${faceShape}`, () => warpGeometry(sphere(HEAD_R, 32, 24), headShape(faceShape)));

export const faceGeometry = (faceShape: string) =>
  geo(`face|${faceShape}`, () =>
    warpGeometry(
      new THREE.SphereGeometry(FACE.r, 36, 28, Math.PI / 2 - FACE.phiLen / 2, FACE.phiLen, FACE.thetaStart, FACE.thetaLen),
      headShape(faceShape)
    ));

/** Head-frame position of a canvas pixel (for glasses etc.), on the unwarped sphere. */
export function facePoint(px: number, py: number, lift = 0): [number, number, number] {
  const phi = Math.PI / 2 - FACE.phiLen / 2 + (px / FACE.w) * FACE.phiLen;
  const theta = FACE.thetaStart + (py / FACE.h) * FACE.thetaLen;
  const r = FACE.r + lift;
  return [-r * Math.cos(phi) * Math.sin(theta), r * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta)];
}

/** Like facePoint, but on the face shape's warped head. */
export const headPoint = (faceShape: string, px: number, py: number, lift = 0) => {
  const [x, y, z] = facePoint(px, py, lift);
  return warpHead(headShape(faceShape), x, y, z);
};

/** Transparent stand-in until the first frame picks the real face texture. */
let blank: THREE.MeshBasicMaterial | null = null;
export const blankFace = () => (blank ??= new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));

let pending: FaceArt | null = null;

/**
 * One CanvasTexture per unique face drawing, shared by every avatar that shows
 * it. Ref-counted: avatars release a face when it changes or they unmount, and
 * the pool disposes idle faces beyond a small reserve (so the builder can try
 * hundreds of combinations without leaking GPU memory).
 */
const facePool = new RefPool<THREE.MeshStandardMaterial>(
  48,
  () => {
    const canvas = document.createElement("canvas");
    canvas.width = FACE.w;
    canvas.height = FACE.h;
    const ctx = canvas.getContext("2d");
    if (ctx && pending) drawFace(ctx, pending);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.75, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
    });
  },
  (m) => {
    m.map?.dispose();
    m.dispose();
  }
);

/** Get (and hold) the face material for a look + expression state. Pair with releaseFace(key). */
export function acquireFace(a: Appearance, eyes: EyeState, mouth: MouthState): { key: string; material: THREE.MeshStandardMaterial } {
  const key = faceTextureKey(a, eyes, mouth);
  const skin = colorHex(SKIN_TONES, a.skin);
  const hair = colorHex(HAIR_COLORS, a.hairColor);
  pending = {
    expr: a.face, eyes, mouth, d: faceDesign(a), skin,
    browColor: shade(hair, a.hairColor === "black" ? 0 : a.hairColor === "blonde" || a.hairColor === "grey" ? -0.2 : -0.14),
    lipInk: lightness(skin) < 0.5 ? "#1e0d10" : "#7d2e36"
  };
  const material = facePool.acquire(key);
  pending = null;
  return { key, material };
}

export const releaseFace = (key: string) => facePool.release(key);

// ---------------- facial hair ----------------

/**
 * Beard / stubble shell over the jaw (null when that style has none). A
 * per-vertex alpha from the signed coverage gives a smooth edge: beards cut it
 * with alphaTest, stubble fades into the skin.
 */
export function beardGeometry(kind: string, faceShape: string): THREE.BufferGeometry | null {
  if (kind === "none" || kind === "moustache") return null;
  return geo(`beard|${kind}|${faceShape}`, () => {
    const stubble = kind === "stubble";
    const src = new THREE.SphereGeometry(1, 96, 56, 0, Math.PI * 2, Math.PI / 2 - 0.05, Math.PI / 2 + 0.05);
    const pos = src.attributes.position as THREE.BufferAttribute;
    const cov = new Float32Array(pos.count);
    const rgba = new Float32Array(pos.count * 4);
    const shape = headShape(faceShape);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const c = beardCoverage(kind, x, y, z);
      cov[i] = c;
      const alpha = stubble ? Math.min(1, Math.max(0, c / 0.05)) : Math.min(1, Math.max(0, 0.5 + c / 0.02));
      rgba.set([1, 1, 1, alpha], i * 4);
      const r = HEAD_R * (1.006 + (stubble ? 0.004 : beardMask(kind, x, y, z)));
      const [wx, wy, wz] = warpHead(shape, x * r, y * r, z * r);
      pos.setXYZ(i, wx, wy, wz);
    }
    const index = src.index!;
    const keep: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i);
      const b = index.getX(i + 1);
      const c = index.getX(i + 2);
      if (Math.max(cov[a], cov[b], cov[c]) > 0) keep.push(a, b, c);
    }
    src.setIndex(keep);
    src.setAttribute("color", new THREE.BufferAttribute(rgba, 4));
    src.computeVertexNormals();
    return src;
  });
}

const beardMats = new Map<string, THREE.MeshStandardMaterial>();
/** Opaque facial hair with a smooth alpha-tested edge. */
export function beardMaterial(color: string): THREE.MeshStandardMaterial {
  let m = beardMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide });
    beardMats.set(color, m);
  }
  return m;
}

/** Moustache on the upper lip: a tapered curved tube, bold on its own, slimmer with a beard. */
export function moustacheGeometry(kind: string, faceShape: string): THREE.BufferGeometry | null {
  if (kind === "none" || kind === "stubble") return null;
  return geo(`moustache|${kind}|${faceShape}`, () => {
    const bold = kind === "moustache";
    const y = MOUTH_CANVAS_Y;
    const w = bold ? 60 : 42;
    const lift = bold ? 0.012 : 0.009;
    const ctrl: [number, number][] = bold
      ? [[-w, y + 12], [-w * 0.72, y - 8], [-w * 0.3, y - 16], [0, y - 14], [w * 0.3, y - 16], [w * 0.72, y - 8], [w, y + 12]]
      : [[-w, y + 2], [-w * 0.5, y - 12], [0, y - 15], [w * 0.5, y - 12], [w, y + 2]];
    const curve = new THREE.CatmullRomCurve3(ctrl.map(([dx, py]) => new THREE.Vector3(...headPoint(faceShape, 256 + dx, py, lift))));
    const SEG = 32;
    const RAD = 10;
    const r = bold ? 0.014 : 0.011;
    const tube = new THREE.TubeGeometry(curve, SEG, r, RAD, false);
    const pos = tube.attributes.position as THREE.BufferAttribute;
    const p = new THREE.Vector3();
    const v = new THREE.Vector3();
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      curve.getPointAt(t, p);
      // thick on each side, a small dip in the middle, thin tips
      const taper = (0.2 + 0.8 * Math.pow(Math.sin(Math.PI * t), 0.5)) * (1 - 0.3 * Math.exp(-(((t - 0.5) / 0.07) ** 2)));
      for (let j = 0; j <= RAD; j++) {
        const k = i * (RAD + 1) + j;
        v.fromBufferAttribute(pos, k).sub(p).multiplyScalar(taper);
        // flatter front-to-back so it lies on the lip
        v.z *= 0.7;
        pos.setXYZ(k, p.x + v.x, p.y + v.y, p.z + v.z);
      }
    }
    tube.computeVertexNormals();
    return tube;
  });
}

let stubbleTex: THREE.CanvasTexture | null = null;
/** Speckled alpha map so stubble reads as short hairs, not a flat shadow. */
function stubbleMap(): THREE.CanvasTexture {
  if (stubbleTex) return stubbleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgb(70,70,70)";
    ctx.fillRect(0, 0, 128, 128);
    let s = 12345;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + Math.floor(rnd() * 105);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.floor(rnd() * 128), Math.floor(rnd() * 128), 1, 1);
    }
  }
  stubbleTex = new THREE.CanvasTexture(c);
  stubbleTex.wrapS = stubbleTex.wrapT = THREE.RepeatWrapping;
  stubbleTex.repeat.set(10, 5);
  return stubbleTex;
}

const stubbleMats = new Map<string, THREE.MeshStandardMaterial>();
export function stubbleMaterial(color: string): THREE.MeshStandardMaterial {
  let m = stubbleMats.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: 1, transparent: true, opacity: 0.45, alphaMap: stubbleMap(), vertexColors: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    stubbleMats.set(color, m);
  }
  return m;
}

// ---------------- sprite text (sleep "z") ----------------

let zMat: THREE.SpriteMaterial | null = null;
export function zzzMaterial(): THREE.SpriteMaterial {
  if (zMat) return zMat;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.font = "bold 52px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#ffffff";
    ctx.strokeText("z", 32, 34);
    ctx.fillStyle = "#2f6bff";
    ctx.fillText("z", 32, 34);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  zMat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  return zMat;
}
