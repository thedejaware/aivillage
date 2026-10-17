/**
 * Pure appearance → shape math for the chibi avatar (no three.js, unit-tested):
 *  - bodyShape: gender sets the base silhouette, build modifies it, height scales it
 *  - headShape / warpHead: face shape = head proportions + a jaw/chin warp
 *  - faceDesign: what to draw on the face texture for each feature
 *  - faceTextureKey: one cached CanvasTexture per unique face drawing
 *  - beardMask: where facial hair grows on the head (unit sphere directions)
 *  - RefPool: ref-counted cache that disposes idle entries beyond a limit
 */
import { colorHex, EYE_COLORS, LIP_COLORS, type Appearance } from "@aivillage/shared";
import { LIMB } from "./pose";

// ---------------- head dimensions (world units at scale 1) ----------------

export const HEAD_R = 0.22;
/** head centre above the neck pivot */
export const HEAD_Y = 0.21;
/** neck pivot above the hips, in the spine frame */
export const NECK_Y = 0.27;

// ---------------- body ----------------

export interface BodyShape {
  /** whole-body scale (gender × height) */
  scale: number;
  /** head scale relative to the body (the head grows less than the body) */
  headScale: number;
  /** shoulder pivot distance from the centre line */
  shoulderX: number;
  /** torso radius (side to side) at the shoulder line, under the chest, at the waist and at the hem */
  shoulder: number;
  chest: number;
  waist: number;
  hem: number;
  /** front-to-back multiplier for the torso and chest details */
  depth: number;
  /** thigh pivot distance from the centre */
  hipX: number;
  pelvisX: number;
  pelvisZ: number;
  /** 0 = flat chest, 1 = default soft bust */
  bust: number;
  /** limb thickness multipliers */
  arm: number;
  leg: number;
  hand: number;
  foot: number;
}

type Base = Omit<BodyShape, "headScale" | "shoulder">;

const GENDER_BODY: Record<string, Base> = {
  male: {
    scale: 1.0, shoulderX: 0.168, chest: 0.138, waist: 0.13, hem: 0.12, depth: 1.04, hipX: 0.062,
    pelvisX: 0.97, pelvisZ: 1.0, bust: 0, arm: 1.08, leg: 1.04, hand: 1.14, foot: 1.1
  },
  female: {
    scale: 0.955, shoulderX: 0.14, chest: 0.116, waist: 0.094, hem: 0.118, depth: 0.95, hipX: 0.067,
    pelvisX: 1.1, pelvisZ: 1.0, bust: 1, arm: 0.9, leg: 0.98, hand: 0.88, foot: 0.9
  },
  nonbinary: {
    scale: 0.978, shoulderX: 0.154, chest: 0.127, waist: 0.112, hem: 0.119, depth: 1.0, hipX: 0.0645,
    pelvisX: 1.035, pelvisZ: 1.0, bust: 0.3, arm: 0.99, leg: 1.01, hand: 1.0, foot: 1.0
  }
};

/** Build modifiers: `add` is added, `mul` multiplies (applied on top of the gender base). */
const BUILD: Record<string, { add?: Partial<Base>; mul?: Partial<Base> }> = {
  slim: {
    add: { shoulderX: -0.008, hipX: -0.003 },
    mul: { chest: 0.9, waist: 0.88, hem: 0.92, pelvisX: 0.93, pelvisZ: 0.94, bust: 0.7, arm: 0.85, leg: 0.88, hand: 0.96, foot: 0.97, depth: 0.92 }
  },
  average: {},
  athletic: {
    add: { shoulderX: 0.01 },
    mul: { chest: 1.08, waist: 0.97, hem: 0.98, arm: 1.14, leg: 1.08, depth: 1.03 }
  },
  curvy: {
    add: { hipX: 0.005 },
    mul: { chest: 1.04, waist: 1.02, hem: 1.08, pelvisX: 1.1, pelvisZ: 1.06, bust: 1.3, arm: 1.04, leg: 1.08, depth: 1.03 }
  },
  broad: {
    add: { shoulderX: 0.014, hipX: 0.002 },
    mul: { chest: 1.12, waist: 1.06, hem: 1.04, pelvisX: 1.04, pelvisZ: 1.05, arm: 1.14, leg: 1.1, hand: 1.06, foot: 1.04, depth: 1.1 }
  }
};

const HEIGHT: Record<string, number> = { short: 0.94, medium: 1, tall: 1.06 };
/** How much of the body's height change the head follows (0 = none, 1 = all). */
const HEAD_FOLLOW = 0.35;

export function bodyShape(a: Pick<Appearance, "gender" | "build" | "height">): BodyShape {
  const b: Base = { ...(GENDER_BODY[a.gender] ?? GENDER_BODY.nonbinary) };
  const mod = BUILD[a.build] ?? BUILD.average;
  for (const [k, v] of Object.entries(mod.add ?? {})) b[k as keyof Base] += v as number;
  for (const [k, v] of Object.entries(mod.mul ?? {})) b[k as keyof Base] *= v as number;
  const scale = b.scale * (HEIGHT[a.height] ?? 1);
  const headScale = (1 + (scale - 1) * HEAD_FOLLOW) / scale;
  return { ...b, scale, headScale, shoulder: b.shoulderX - 0.04 };
}

/** World height of the head centre (the builder's face close-up aims here). */
export function headCenterY(a: Pick<Appearance, "gender" | "build" | "height">): number {
  const s = bodyShape(a);
  return (LIMB.restHip + NECK_Y + HEAD_Y * s.headScale) * s.scale;
}

/** The original torso lathe profile [radius, y] — outfit details were placed on it. */
export const BASE_TORSO: readonly [number, number][] = [
  [0, -0.035], [0.1, -0.03], [0.122, 0.02], [0.129, 0.09], [0.127, 0.165], [0.112, 0.235], [0.085, 0.27], [0.045, 0.288], [0, 0.292]
];

/** Torso lathe profile [radius, y] for a body (same y knots as BASE_TORSO). */
export function torsoProfile(s: BodyShape): [number, number][] {
  const neck = 0.6 + 0.4 * (s.shoulder / 0.112);
  const r = [0, s.hem * 0.82, s.hem, s.waist, s.chest, s.shoulder, 0.085 * neck, 0.045 * (0.8 + 0.2 * neck), 0];
  return BASE_TORSO.map(([, y], i) => [r[i], y]);
}

function interp(profile: readonly (readonly [number, number])[], y: number): number {
  if (y <= profile[0][1]) return profile[0][0];
  for (let i = 1; i < profile.length; i++) {
    const [r1, y1] = profile[i];
    if (y <= y1) {
      const [r0, y0] = profile[i - 1];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return profile[profile.length - 1][0];
}

/** Side-to-side torso radius at height y (spine frame). */
export const torsoRadiusAt = (s: BodyShape, y: number) => interp(torsoProfile(s), y);
/** The original torso's radius at height y. */
export const baseTorsoRadiusAt = (y: number) => interp(BASE_TORSO, y);

// ---------------- head shape ----------------

export interface HeadShape {
  /** whole-head scale (applied to the head group, so hair and glasses follow) */
  sx: number;
  sy: number;
  sz: number;
  /** lower-face width at the chin (1 = sphere) */
  jaw: number;
  /** cheek fullness bulge */
  cheek: number;
  /** chin length (+ = longer) */
  chin: number;
  /** flattens the chin bottom (square jaw) */
  flat: number;
}

const HEAD_SHAPES: Record<string, HeadShape> = {
  round: { sx: 1.07, sy: 0.96, sz: 1.0, jaw: 1.08, cheek: 0.05, chin: -0.04, flat: 0 },
  oval: { sx: 0.95, sy: 1.03, sz: 0.98, jaw: 0.9, cheek: 0, chin: 0.05, flat: 0 },
  heart: { sx: 1.04, sy: 1.0, sz: 1.0, jaw: 0.7, cheek: 0.03, chin: 0.1, flat: 0 },
  square: { sx: 1.03, sy: 0.98, sz: 1.0, jaw: 1.2, cheek: 0, chin: -0.02, flat: 0.8 },
  long: { sx: 0.9, sy: 1.1, sz: 0.98, jaw: 0.9, cheek: -0.02, chin: 0.11, flat: 0 },
  soft: { sx: 1.03, sy: 0.98, sz: 1.02, jaw: 1.08, cheek: 0.1, chin: -0.05, flat: 0.25 }
};

export const headShape = (id: string): HeadShape => HEAD_SHAPES[id] ?? HEAD_SHAPES.oval;

/**
 * Jaw/chin warp for a head-frame point (centre at 0, face toward +z). Only the
 * lower half moves, so hair and the eye line stay put.
 */
export function warpHead(s: HeadShape, x: number, y: number, z: number): [number, number, number] {
  if (y >= 0) return [x, y, z];
  const t = Math.min(1, -y / HEAD_R);
  const t15 = Math.pow(t, 1.5);
  const bulge = Math.sin(Math.PI * t);
  const kx = (1 + (s.jaw - 1) * t15) * (1 + s.cheek * bulge);
  const kz = 1 + (s.jaw - 1) * 0.35 * t15 + s.cheek * 0.5 * bulge;
  const ky = (1 + s.chin * t * t) * (1 - s.flat * 0.12 * t * t * t);
  return [x * kx, y * ky, z * kz];
}

// ---------------- face drawing ----------------

export interface EyeDesign {
  shape: string;
  /** opening half-width / half-height (canvas px at feature scale 1) */
  rx: number;
  ry: number;
  /** outer-corner lift (radians) */
  tilt: number;
  /** pointed corners (almond-like) */
  pointed: boolean;
  /** share of the opening covered by a heavy upper lid */
  lid: number;
  iris: string;
  lashes: 0 | 1 | 2;
}

export interface BrowDesign {
  /** stroke thickness at the inner end */
  thick: number;
  /** arch height and where along the brow it peaks (0 inner → 1 outer) */
  peak: number;
  peakAt: number;
  /** outer end drop */
  outer: number;
  bushy: boolean;
}

export interface MouthDesign {
  /** width multiplier */
  w: number;
  /** lip fullness 0..1 (filled lips) */
  full: number;
  /** line width */
  line: number;
}

export interface FaceDesign {
  eye: EyeDesign;
  brow: BrowDesign;
  nose: string;
  mouth: MouthDesign;
  /** lipstick colour, null for natural lips */
  lip: string | null;
  /** 0..1 cheek blush strength */
  blush: number;
}

const EYES: Record<string, Omit<EyeDesign, "shape" | "iris" | "lashes">> = {
  round: { rx: 28, ry: 35, tilt: 0, pointed: false, lid: 0 },
  almond: { rx: 33, ry: 24, tilt: 0.08, pointed: true, lid: 0 },
  wide: { rx: 33, ry: 41, tilt: 0, pointed: false, lid: 0 },
  narrow: { rx: 31, ry: 16, tilt: 0.02, pointed: true, lid: 0 },
  upturned: { rx: 31, ry: 25, tilt: 0.3, pointed: true, lid: 0 },
  hooded: { rx: 30, ry: 30, tilt: -0.06, pointed: false, lid: 0.4 }
};

const BROW: Record<string, BrowDesign> = {
  thin: { thick: 5, peak: 10, peakAt: 0.55, outer: 3, bushy: false },
  natural: { thick: 9.5, peak: 9, peakAt: 0.5, outer: 3, bushy: false },
  arched: { thick: 8.5, peak: 19, peakAt: 0.64, outer: 7, bushy: false },
  straight: { thick: 11, peak: 2, peakAt: 0.5, outer: 0, bushy: false },
  thick: { thick: 16, peak: 8, peakAt: 0.5, outer: 2, bushy: false },
  bushy: { thick: 18, peak: 7, peakAt: 0.45, outer: 1, bushy: true }
};

const MOUTH: Record<string, MouthDesign> = {
  small: { w: 0.62, full: 0, line: 7 },
  natural: { w: 1, full: 0.25, line: 8.5 },
  wide: { w: 1.38, full: 0.15, line: 9 },
  full: { w: 1.05, full: 1, line: 8 },
  thin: { w: 0.95, full: 0, line: 5 }
};

const BLUSH_ALPHA: Record<string, number> = { none: 0, soft: 0.32, rosy: 0.62 };
const LASH_COUNT: Record<string, 0 | 1 | 2> = { none: 0, natural: 1, long: 2 };

export function faceDesign(a: Appearance): FaceDesign {
  return {
    eye: {
      shape: a.eyeShape,
      ...(EYES[a.eyeShape] ?? EYES.round),
      iris: colorHex(EYE_COLORS, a.eyeColor),
      lashes: LASH_COUNT[a.lashes] ?? 0
    },
    brow: BROW[a.brows] ?? BROW.natural,
    nose: a.nose,
    mouth: MOUTH[a.mouth] ?? MOUTH.natural,
    lip: a.lipColor === "natural" || !LIP_COLORS.some((l) => l.id === a.lipColor) ? null : colorHex(LIP_COLORS, a.lipColor),
    blush: BLUSH_ALPHA[a.blush] ?? 0
  };
}

/** Everything the face texture depends on (body, clothes, hair style and beard meshes are not in it). */
export function faceTextureKey(a: Appearance, eyes: string, mouth: string): string {
  return [a.face, eyes, mouth, a.eyeShape, a.eyeColor, a.brows, a.hairColor, a.lashes, a.nose, a.mouth, a.lipColor, a.blush, a.skin].join("|");
}

// ---------------- facial hair ----------------

const smooth01 = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};

/** The mouth opening on the unit head sphere (kept clear of hair). */
const MOUTH_HOLE = { y: -0.375, rx: 0.24, ry: 0.12 };

/**
 * Signed coverage of a facial-hair style at a unit-sphere direction (x, y, z)
 * of the head (face toward +z): > 0 inside the hair, < 0 on bare skin. It is
 * roughly a distance (head radii) to the edge, so a mesh can cut a smooth edge
 * where it crosses 0.
 */
export function beardCoverage(kind: string, x: number, y: number, z: number): number {
  if (kind === "none" || kind === "moustache") return -1;
  const a = Math.atan2(Math.abs(x), z); // 0 = front, π/2 = at the ear
  const back = (1.6 - a) * 0.3;
  const cheekTop = -y; // nothing above the head centre
  const hole = z > 0 ? (Math.hypot(x / MOUTH_HOLE.rx, (y - MOUTH_HOLE.y) / MOUTH_HOLE.ry) - 1) * 0.1 : 1;
  let region: number;
  if (kind === "goatee") {
    const ring = (1 - Math.hypot(x / 0.34, (y + 0.37) / 0.2)) * 0.15;
    const chin = Math.min((0.4 - a) * 0.3, -0.42 - y, 0.12 - Math.hypot(x / 0.4, (y + 0.62) / 0.5) * 0.12);
    region = Math.max(ring, chin);
  } else {
    // jaw line: low at the front, rising to the ears (sideburns); stubble stays lower
    const top = kind === "stubble" ? -0.34 + 0.22 * smooth01(a / 1.55) : -0.3 + 0.28 * smooth01(a / 1.55);
    const upperLip = z > 0 ? (1 - Math.hypot(x / 0.34, (y + 0.29) / 0.075)) * 0.075 : -1;
    region = Math.max(top - y, upperLip);
  }
  return Math.min(region, hole, back, cheekTop);
}

/** How thick the facial hair is there, as a share of the head radius. 0 = bare skin. */
export function beardMask(kind: string, x: number, y: number, z: number): number {
  const cov = beardCoverage(kind, x, y, z);
  if (cov <= 0) return 0;
  const edge = smooth01(cov / 0.06);
  const chinBulk = smooth01((-y - 0.4) / 0.55);
  const base =
    kind === "full_beard" ? 0.045 + 0.06 * chinBulk
    : kind === "short_beard" ? 0.022 + 0.008 * chinBulk
    : kind === "goatee" ? 0.03 + 0.015 * chinBulk
    : 0.006;
  return 0.004 + base * edge;
}

// ---------------- ref-counted cache ----------------

/**
 * A keyed cache with reference counts: entries in use are never disposed;
 * released entries wait in an idle list (most recent last) and the oldest
 * are disposed once there are more than `maxIdle`.
 */
export class RefPool<V> {
  private items = new Map<string, { v: V; refs: number }>();
  private idle = new Map<string, true>();

  constructor(private maxIdle: number, private create: (key: string) => V, private dispose: (v: V) => void) {}

  acquire(key: string): V {
    let it = this.items.get(key);
    if (!it) {
      it = { v: this.create(key), refs: 0 };
      this.items.set(key, it);
    }
    it.refs++;
    this.idle.delete(key);
    return it.v;
  }

  release(key: string): void {
    const it = this.items.get(key);
    if (!it || it.refs === 0) return;
    it.refs--;
    if (it.refs > 0) return;
    this.idle.set(key, true);
    while (this.idle.size > this.maxIdle) {
      const oldest = this.idle.keys().next().value as string;
      this.idle.delete(oldest);
      const gone = this.items.get(oldest);
      this.items.delete(oldest);
      if (gone) this.dispose(gone.v);
    }
  }

  get size(): number {
    return this.items.size;
  }
}
