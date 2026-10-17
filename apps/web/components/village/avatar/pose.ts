/**
 * Pure pose math for the chibi avatar: every body animation is a function of
 * time that writes joint angles into a flat `Rig`. No three.js here, so it is
 * cheap and unit-testable. Avatar.tsx maps the semantic values onto groups.
 *
 * Semantic sign conventions (both sides use the same meaning; Avatar mirrors):
 *  - shoulder f: raise forward (π = straight up), o: out to the side, t: twist
 *  - elbow e: bend (hand comes forward/up), ez: forearm swings out (+) / in (−)
 *  - wrist w: flex forward
 *  - thigh f: forward, o: out to the side; knee k: bend backward
 *  - spine/head x: lean/nod forward, y: turn to the character's left, z: tilt to its right
 */
import type { BodyAnim } from "@aivillage/shared";
import type { AvatarPose } from "./types";

export const RIG_KEYS = [
  "y", "z", "g", "bx", "by", "bz",
  "sx", "sy", "sz",
  "hx", "hy", "hz",
  "lsf", "lso", "lst", "le", "lez", "lw",
  "rsf", "rso", "rst", "re", "rez", "rw",
  "ltf", "lto", "lk",
  "rtf", "rto", "rk"
] as const;
export type RigKey = (typeof RIG_KEYS)[number];
export type Rig = Record<RigKey, number>;

/** Skeleton lengths (world units at scale 1). */
export const LIMB = { thigh: 0.14, shin: 0.13, hipDrop: 0.02, restHip: 0.31 } as const;

export type EyeState = "base" | "closed" | "happy" | "cry";
export type MouthState = "base" | "open" | "o" | "pucker" | "frown" | "flat";
export type PropId = "cup" | "book" | "phone" | "broom" | "can" | "food" | "bubbles" | "finger" | "zzz";

export interface FaceState { eyes: EyeState; mouth: MouthState }

const TAU = Math.PI * 2;
const osc = (t: number, hz: number, phase = 0) => Math.sin((t * hz + phase) * TAU);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};
/** 0→1 over [a, a+fade], 1 until b-fade, then back to 0 at b. */
const window_ = (t: number, a: number, b: number, fade: number) =>
  smooth((t - a) / fade) * (1 - smooth((t - (b - fade)) / fade));

export function restRig(out: Rig = {} as Rig): Rig {
  for (const k of RIG_KEYS) out[k] = 0;
  out.g = 1;
  out.lso = out.rso = 0.16;
  out.le = out.re = 0.18;
  return out;
}

export function copyRig(src: Rig, dst: Rig): Rig {
  for (const k of RIG_KEYS) dst[k] = src[k];
  return dst;
}

/** How far the hips must drop so the straighter leg's foot stays on the floor. */
export function legDrop(r: Rig): number {
  const L1 = LIMB.thigh;
  const L2 = LIMB.shin;
  const d = (f: number, o: number, k: number) =>
    L1 * (1 - Math.cos(f)) + L2 * (1 - Math.cos(f - k)) + (L1 + L2) * (1 - Math.cos(o));
  return Math.min(d(r.ltf, r.lto, r.lk), d(r.rtf, r.rto, r.rk));
}

/** Hip height above the avatar origin after grounding. */
export function hipHeight(r: Rig): number {
  return LIMB.restHip + r.y - r.g * legDrop(r);
}

type AnimFn = (t: number, seed: number, r: Rig) => void;

const breathe = (t: number, r: Rig) => {
  const b = osc(t, 0.25);
  r.sx += 0.025 * b;
  r.hx -= 0.02 * b;
  r.lso += 0.025 * b;
  r.rso += 0.025 * b;
};

const lookAround = (t: number, seed: number, r: Rig, amount = 1) => {
  const c = (t + seed * 9) % 9;
  r.hy += amount * (0.4 * window_(c, 3, 4.8, 0.45) - 0.32 * window_(c, 6, 7.6, 0.45));
  r.hx += amount * -0.08 * window_(c, 6, 7.6, 0.45);
};

const ANIMS: Record<BodyAnim, AnimFn> = {
  idle(t, s, r) {
    breathe(t, r);
    lookAround(t, s, r);
    r.bz += 0.018 * osc(t, 0.11, s);
  },
  talk(t, _s, r) {
    breathe(t, r);
    r.hx += 0.07 * osc(t, 1.7);
    r.hz += 0.06 * osc(t, 0.55);
    r.hy += 0.16 * osc(t, 0.27);
    r.rsf = 0.5 + 0.2 * osc(t, 0.9);
    r.re = 1.35 + 0.25 * osc(t, 1.8);
    r.rso = 0.3;
    r.rez = 0.35 + 0.25 * osc(t, 0.9, 0.3);
    r.lsf = 0.3 + 0.2 * osc(t, 0.7, 0.5);
    r.le = 1.1 + 0.25 * osc(t, 1.4, 0.2);
    r.lso = 0.28;
    r.lez = 0.2 + 0.2 * osc(t, 0.7, 0.1);
  },
  jump(t, _s, r) {
    const p = t % 1.8;
    // crouch in, push, fly, land, then a calm pause
    const crouch = p < 0.28 ? smooth(p / 0.28) : p < 0.36 ? 1 - smooth((p - 0.28) / 0.08) : p > 0.84 && p < 1.1 ? Math.sin((Math.PI * (p - 0.84)) / 0.26) * 0.8 : 0;
    const air = p > 0.32 && p < 0.86 ? Math.sin((Math.PI * (p - 0.32)) / 0.54) : 0;
    r.y = 0.35 * air;
    r.ltf = r.rtf = 0.75 * crouch + 0.35 * air;
    r.lk = r.rk = 1.4 * crouch + 0.75 * air;
    r.sx = 0.35 * crouch - 0.08 * air;
    r.hx = -0.1 * crouch - 0.15 * air;
    r.lsf = r.rsf = -0.65 * crouch + 2.7 * air;
    r.lso = r.rso = 0.2 + 0.25 * air;
    r.le = r.re = 0.35;
  },
  wave(t, _s, r) {
    breathe(t, r);
    r.rso = 2.5;
    r.rsf = 0.3;
    r.re = 0.35;
    r.rez = 0.5 * osc(t, 2.1);
    r.hz = -0.1;
    r.hy = -0.12;
    r.sz = 0.05;
  },
  dance(t, _s, r) {
    const b = osc(t, 1.0);
    const bounce = osc(t, 2.0);
    r.bz = 0.07 * b;
    r.sz = -0.14 * b;
    r.sy = 0.18 * osc(t, 0.5);
    r.hz = 0.14 * b;
    r.lk = r.rk = 0.4 + 0.3 * bounce;
    r.ltf = r.rtf = 0.2 + 0.15 * bounce;
    r.lsf = 1.7 + 1.2 * b;
    r.rsf = 1.7 - 1.2 * b;
    r.lso = r.rso = 0.55;
    r.le = r.re = 0.75;
    r.lez = 0.3 * b;
    r.rez = -0.3 * b;
  },
  sit(t, s, r) {
    // hips stay at standing height (0.31): thighs rest on a seat whose top is ~0.24–0.26
    r.g = 0;
    r.y = 0;
    const kick = osc(t, 0.45);
    r.ltf = r.rtf = 1.55;
    r.lk = 1.5 + 0.2 * kick;
    r.rk = 1.5 - 0.2 * kick;
    r.lto = r.rto = 0.07;
    r.sx = -0.06;
    r.lsf = r.rsf = 0.55;
    r.le = r.re = 0.65;
    r.lso = r.rso = 0.1;
    breathe(t, r);
    lookAround(t, s, r, 0.8);
  },
  sleep(t, _s, r) {
    r.g = 0;
    r.y = 0.135 - LIMB.restHip;
    r.z = 0.2;
    r.bx = -Math.PI / 2;
    r.sx = 0.03 * osc(t, 0.2);
    r.hx = 0.42;
    r.hz = 0.12;
    r.lsf = 0.85;
    r.le = 1.45;
    r.lso = -0.05;
    r.rso = 0.22;
    r.re = 0.15;
    r.lto = 0.08;
    r.rto = 0.12;
  },
  clap(t, _s, r) {
    const c = 0.5 + 0.5 * osc(t, 2.4);
    r.lsf = r.rsf = 1.05;
    r.le = r.re = 1.05;
    r.lso = r.rso = 0.2 + 0.25 * c;
    r.lez = r.rez = -0.7 - 0.2 * (1 - c);
    r.lk = r.rk = 0.12 + 0.1 * osc(t, 1.2);
    r.ltf = r.rtf = 0.06;
    r.hz = 0.06 * osc(t, 0.6);
  },
  point(t, _s, r) {
    breathe(t, r);
    r.rsf = 1.5 + 0.07 * osc(t, 1.4);
    r.rso = 0.05;
    r.re = 0.05;
    r.hx = -0.05;
    r.hy = -0.1;
    r.sy = -0.12;
    // other hand on the hip
    r.lso = 0.75;
    r.lsf = -0.15;
    r.le = 0.2;
    r.lez = -1.9;
  },
  cheer(t, _s, r) {
    const hop = Math.abs(Math.sin((Math.PI * t) / 0.7));
    r.y = 0.07 * hop;
    r.lsf = r.rsf = 2.75 + 0.15 * osc(t, 1 / 0.7);
    r.lso = r.rso = 0.5;
    r.le = r.re = 0.25;
    r.hx = -0.12;
    r.lk = r.rk = 0.15 * (1 - hop);
  },
  stretch(t, _s, r) {
    const side = osc(t, 0.22);
    r.lsf = r.rsf = 3.0;
    r.lso = r.rso = 0.12;
    r.le = r.re = 0.12;
    r.lez = r.rez = -0.2;
    r.sz = 0.28 * side;
    r.bz = -0.04 * side;
    r.hx = -0.22;
    r.hz = 0.12 * side;
    r.y = 0.015;
  },
  laugh(t, _s, r) {
    const shake = osc(t, 6);
    r.sx = -0.2 + 0.05 * shake;
    r.hx = -0.32 + 0.06 * osc(t, 6, 0.25);
    r.y = 0.008 * shake;
    // hands holding the belly
    r.lsf = r.rsf = 0.3 + 0.05 * shake;
    r.le = r.re = 1.35;
    r.lso = r.rso = 0.12;
    r.lez = r.rez = -0.75;
    r.hz = 0.08 * osc(t, 0.5);
  },
  cry(t, _s, r) {
    const sob = osc(t, 2.6);
    r.hx = 0.42 + 0.04 * sob;
    r.sx = 0.22 + 0.04 * sob;
    r.lsf = r.rsf = 1.35;
    r.le = r.re = 2.3;
    r.lso = r.rso = 0.05;
    r.lez = r.rez = -0.35;
    r.hy = 0.06 * osc(t, 0.4);
    r.y = 0.006 * sob;
  },
  think(t, _s, r) {
    breathe(t, r);
    r.rsf = 0.75;
    r.re = 2.35 + 0.06 * osc(t, 1.2);
    r.rso = 0.05;
    r.rez = -0.45;
    r.lsf = 0.55;
    r.le = 1.7;
    r.lso = 0.1;
    r.lez = -0.75;
    r.hz = 0.2 + 0.04 * osc(t, 0.3);
    r.hx = -0.14;
    r.hy = 0.12;
    r.bz = 0.03;
  },
  wash(t, _s, r) {
    const rub = osc(t, 3);
    r.lsf = r.rsf = 0.8;
    r.le = r.re = 1.05;
    r.lso = r.rso = 0.15;
    r.lez = -0.65 + 0.12 * rub;
    r.rez = -0.65 - 0.12 * rub;
    r.lw = 0.2 * rub;
    r.rw = -0.2 * rub;
    r.hx = 0.38;
    r.sx = 0.1;
  },
  eat(t, _s, r) {
    const p = t % 1.4;
    const q = p < 0.45 ? smooth(p / 0.45) : p < 0.75 ? 1 : 1 - smooth((p - 0.75) / 0.4);
    r.rsf = 0.5 + 0.6 * q;
    r.re = 1.2 + 1.15 * q;
    r.rso = 0.1;
    r.rez = -0.2 - 0.35 * q;
    r.lsf = 0.6;
    r.le = 1.4;
    r.lso = 0.12;
    r.lez = -0.4;
    r.hx = 0.12 - 0.12 * q;
    breathe(t, r);
  },
  drink(t, _s, r) {
    const p = t % 3.6;
    const q = p < 0.6 ? smooth(p / 0.6) : p < 1.9 ? 1 : 1 - smooth((p - 1.9) / 0.6);
    r.rsf = 0.5 + 0.7 * q;
    r.re = 1.25 + 1.1 * q;
    r.rso = 0.1;
    r.rez = -0.2 - 0.3 * q;
    r.hx = -0.28 * q;
    r.sx = -0.05 * q;
    r.lso = 0.75;
    r.lsf = -0.15;
    r.le = 0.2;
    r.lez = -1.9;
    breathe(t, r);
  },
  read(t, _s, r) {
    const flip = window_(t % 6, 4.4, 5.2, 0.3);
    r.lsf = r.rsf = 0.95;
    r.le = r.re = 1.15;
    r.lso = r.rso = 0.1;
    r.lez = r.rez = -0.45;
    r.rez -= 0.5 * flip;
    r.hx = 0.36;
    r.hy = 0.06 * osc(t, 0.3);
    breathe(t, r);
  },
  phone(t, _s, r) {
    breathe(t, r);
    // elbow out to the side, forearm folded up so the hand sits at the ear
    r.rsf = 0.35;
    r.rso = 1.45;
    r.re = 0.35;
    r.rez = 1.65;
    r.hz = 0.2;
    r.hx = 0.04 * osc(t, 1.3);
    r.by = 0.25 * osc(t, 0.12);
    r.lso = 0.25;
    r.lsf = 0.35 + 0.2 * osc(t, 0.6);
    r.le = 1.2;
  },
  sweep(t, _s, r) {
    const sw = osc(t, 0.9);
    r.sy = 0.35 * sw;
    r.sx = 0.15;
    r.hx = 0.25;
    r.hy = 0.15 * sw;
    r.rsf = 0.55;
    r.re = 0.55;
    r.rso = 0.05;
    r.rez = -0.35;
    r.lsf = 0.85;
    r.le = 0.65;
    r.lso = 0.1;
    r.lez = -0.6;
    r.lk = r.rk = 0.15;
    r.ltf = r.rtf = 0.08;
  },
  water(t, _s, r) {
    breathe(t, r);
    r.rsf = 0.8;
    r.re = 0.35;
    r.rso = 0.12;
    r.hx = 0.25;
    r.sx = 0.08;
    r.sy = -0.1 + 0.08 * osc(t, 0.25);
  },
  exercise(t, _s, r) {
    const p = (1 - Math.cos((TAU * t) / 0.9)) / 2;
    r.lso = r.rso = 0.25 + 2.6 * p;
    r.lsf = r.rsf = 0.1;
    r.le = r.re = 0.15;
    r.lto = r.rto = 0.05 + 0.32 * p;
    r.y = 0.05 * Math.abs(Math.sin((TAU * t) / 0.9));
    r.hx = -0.05;
  },
  hug(t, _s, r) {
    // arms around the partner's sides; heads tilt aside so the big heads don't collide
    // step in a little so the short chibi arms reach the partner's back
    r.z = 0.05;
    r.lsf = r.rsf = 1.3;
    r.lso = r.rso = 0.75;
    r.lez = r.rez = -1.1;
    r.le = r.re = 0.1;
    r.sx = 0.04;
    r.hz = 0.42;
    r.hy = 0.45;
    r.hx = 0.05;
    r.bz = 0.035 * osc(t, 0.5);
    r.by = 0.05 * osc(t, 0.5, 0.25);
  },
  kiss(t, _s, r) {
    const lean = 0.5 + 0.5 * osc(t, 0.4);
    // a gentle lean toward the cheek (big heads: keep the lean small)
    r.sx = 0.07 + 0.05 * lean;
    r.hz = 0.3;
    r.hy = 0.35;
    r.hx = 0.04;
    r.lsf = r.rsf = -0.45;
    r.lso = r.rso = 0.1;
    r.le = r.re = 0.5;
    r.lez = r.rez = -0.55;
    r.y = 0.015;
  },
  highfive(t, _s, r) {
    // double high-five beside the (big) heads: partners' palms meet halfway
    const p = t % 2.4;
    const up = p < 0.45 ? smooth(p / 0.45) : p < 1.6 ? 1 : 1 - smooth((p - 1.6) / 0.5);
    const slap = window_(p, 0.45, 0.8, 0.12);
    r.lsf = r.rsf = 2.0 * up + 0.15 * slap;
    r.lso = r.rso = 0.16 + 0.56 * up;
    r.le = r.re = 0.45 * up - 0.25 * slap;
    r.lez = r.rez = -0.15 * up;
    r.sx = 0.1 * slap;
    r.hx = -0.08 * up;
    breathe(t, r);
  },
  handshake(t, _s, r) {
    r.rsf = 0.95 + 0.14 * osc(t, 2.2);
    r.re = 0.5;
    r.rso = 0.05;
    r.rez = -0.45;
    r.sx = 0.06;
    breathe(t, r);
  }
};

/** Anims that keep their arm pose while walking (the hands are busy). */
const BUSY_ARMS = new Set<BodyAnim>(["wave", "point", "phone", "drink", "eat", "read", "sweep", "water", "think", "cry", "wash", "clap"]);

const ARM_KEYS: RigKey[] = ["lsf", "lso", "lst", "le", "lez", "lw", "rsf", "rso", "rst", "re", "rez", "rw"];
const HEAD_KEYS: RigKey[] = ["hx", "hy", "hz"];

const scratch = restRig();

/** Target rig for a pose (no blending). */
export function samplePose(p: AvatarPose, seed: number, out: Rig): Rig {
  restRig(out);
  const fn = ANIMS[p.anim] ?? ANIMS.idle;
  fn(Math.max(0, p.animTime), seed, out);
  if (!p.walking) return out;

  // walking: keep busy arms + head, the rest of the body follows the walk cycle
  copyRig(out, scratch);
  restRig(out);
  if (BUSY_ARMS.has(p.anim)) for (const k of ARM_KEYS) out[k] = scratch[k];
  if (p.anim !== "sleep") for (const k of HEAD_KEYS) out[k] = scratch[k];
  applyWalk(p.walkPhase, p.speed, out, !BUSY_ARMS.has(p.anim));
  return out;
}

export function applyWalk(phase: number, speed: number, r: Rig, arms: boolean): void {
  const run = Math.max(0, Math.min(1.2, speed - 1));
  const sw = Math.sin(phase);
  const amp = 0.5 + 0.28 * run;
  r.ltf = amp * sw;
  r.rtf = -amp * sw;
  // knee bends while the leg swings forward
  r.lk = 0.12 + (0.65 + 0.6 * run) * Math.max(0, Math.cos(phase));
  r.rk = 0.12 + (0.65 + 0.6 * run) * Math.max(0, -Math.cos(phase));
  r.sx += 0.05 + 0.12 * run;
  r.sy += 0.08 * sw;
  r.hy -= 0.05 * sw;
  r.y += 0.035 * run * Math.abs(Math.cos(phase));
  if (arms) {
    r.lsf = -(0.55 + 0.35 * run) * sw;
    r.rsf = (0.55 + 0.35 * run) * sw;
    r.le = r.re = 0.3 + 0.9 * run;
  }
}

/** Eyes + mouth for an anim at time t (before blinking). */
export function faceFor(p: AvatarPose): FaceState {
  const t = p.animTime;
  const chat = osc(t, 3.3) > 0 ? "open" : "base";
  switch (p.anim) {
    case "talk":
    case "phone":
      return { eyes: "base", mouth: chat };
    case "jump": {
      const ph = t % 1.8;
      return ph > 0.34 && ph < 0.86 ? { eyes: "happy", mouth: "open" } : { eyes: "base", mouth: "base" };
    }
    case "wave":
    case "point":
    case "handshake":
      return { eyes: "base", mouth: "open" };
    case "dance":
    case "clap":
    case "cheer":
    case "laugh":
    case "highfive":
      return { eyes: "happy", mouth: "open" };
    case "sleep":
      return { eyes: "closed", mouth: "o" };
    case "stretch":
      return { eyes: "closed", mouth: "o" };
    case "cry":
      return { eyes: "cry", mouth: "frown" };
    case "think":
      return { eyes: "base", mouth: "flat" };
    case "eat":
      return { eyes: "base", mouth: osc(t, 4) > 0.2 ? "o" : "base" };
    case "drink": {
      const ph = t % 3.6;
      return { eyes: ph > 0.6 && ph < 1.9 ? "closed" : "base", mouth: "base" };
    }
    case "exercise":
      return { eyes: "base", mouth: "o" };
    case "hug":
      return { eyes: "happy", mouth: "base" };
    case "kiss":
      return { eyes: "closed", mouth: "pucker" };
    default:
      return { eyes: "base", mouth: "base" };
  }
}

/** Which prop the anim shows (null = none). Props stay while walking only for busy-arm anims. */
export function propFor(p: AvatarPose): PropId | null {
  if (p.walking && !BUSY_ARMS.has(p.anim)) return null;
  switch (p.anim) {
    case "drink": return "cup";
    case "read": return "book";
    case "phone": return "phone";
    case "sweep": return "broom";
    case "water": return "can";
    case "eat": return "food";
    case "wash": return "bubbles";
    case "point": return "finger";
    case "sleep": return "zzz";
    default: return null;
  }
}

/** Crossfades joint values between anims so nothing snaps (~0.25 s). */
export class PoseBlender {
  readonly current: Rig = restRig();
  private from: Rig = restRig();
  private target: Rig = restRig();
  private t = 1;
  private key = "";

  constructor(readonly seed: number, readonly blendSeconds = 0.25) {}

  update(p: AvatarPose, dt: number): Rig {
    const key = `${p.anim}|${p.walking ? 1 : 0}`;
    if (key !== this.key) {
      if (this.key) {
        copyRig(this.current, this.from);
        this.t = 0;
      }
      this.key = key;
    }
    samplePose(p, this.seed, this.target);
    this.t = Math.min(1, this.t + Math.max(0, dt) / this.blendSeconds);
    const e = smooth(this.t);
    for (const k of RIG_KEYS) this.current[k] = this.from[k] + (this.target[k] - this.from[k]) * e;
    return this.current;
  }
}
