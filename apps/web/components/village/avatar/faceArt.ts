/**
 * Draws the face decal (eyes, brows, nose, mouth, blush) on a 2D canvas.
 * Features come from `faceDesign` (what the player picked); the expression
 * (`face`) and the anim's eye/mouth state change their pose on top.
 * Coordinates are drawn at feature scale 1 around the canvas centre and then
 * scaled up (bigger features read better from the village camera).
 */
import type { FaceDesign } from "./features";
import type { EyeState, MouthState } from "./pose";

export const FACE_W = 512;
export const FACE_H = 384;
/** Features are drawn at 1x and scaled up around a pivot (bigger = readable from afar). */
export const FEATURE_SCALE = 1.17;
const PIVOT_X = 256;
const PIVOT_Y = 240;
const EYE_X0 = 105;
const EYE_Y0 = 200;
/** Where the eye centres land on the canvas (for glasses). */
export const EYE_X = EYE_X0 * FEATURE_SCALE;
export const EYE_Y = PIVOT_Y + (EYE_Y0 - PIVOT_Y) * FEATURE_SCALE;
const MOUTH_Y0 = 286;
const NOSE_Y0 = 248;
/** Canvas position of a feature-space point (for meshes placed on the face, e.g. a moustache). */
export const canvasY = (y0: number) => PIVOT_Y + (y0 - PIVOT_Y) * FEATURE_SCALE;
export const canvasX = (x0: number) => PIVOT_X + (x0 - PIVOT_X) * FEATURE_SCALE;
export const MOUTH_CANVAS_Y = canvasY(MOUTH_Y0);
const INK = "#2a1f2b";

type Ctx = CanvasRenderingContext2D;

export interface FaceArt {
  /** expression id (smile, calm, cheeky, …) */
  expr: string;
  eyes: EyeState;
  mouth: MouthState;
  d: FaceDesign;
  skin: string;
  browColor: string;
  /** mouth line colour for natural lips (darker on deep skin) */
  lipInk: string;
}

// ---------------- colour helpers (no three.js) ----------------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** Mix toward black (amt < 0) or white (amt > 0). */
export function tint(hex: string, amt: number, alpha = 1): string {
  const [r, g, b] = rgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  const m = (c: number) => Math.round(c + (t - c) * k);
  return `rgba(${m(r)},${m(g)},${m(b)},${alpha})`;
}

// ---------------- primitives ----------------

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}

function stroke(ctx: Ctx, color: string, width: number, draw: () => void) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  draw();
  ctx.stroke();
}

const qPoint = (p0: number[], c: number[], p1: number[], t: number) => [
  (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
  (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1]
];

// ---------------- eyes ----------------

type EyeMode = "open" | "sparkle" | "half" | "dot" | "calm" | "closed" | "happy" | "cry" | "wink";

/** The eye opening as a path (used to clip the iris and to draw the lid line). */
function eyePath(ctx: Ctx, x: number, y: number, side: 1 | -1, rx: number, ry: number, tilt: number, pointed: boolean) {
  ctx.beginPath();
  if (pointed) {
    const inner = [x - side * rx, y + tilt * rx * 0.25];
    const outer = [x + side * rx, y - tilt * rx];
    ctx.moveTo(inner[0], inner[1]);
    ctx.quadraticCurveTo(x - side * rx * 0.1, y - ry * 2.05, outer[0], outer[1]);
    ctx.quadraticCurveTo(x + side * rx * 0.05, y + ry * 1.7, inner[0], inner[1]);
    ctx.closePath();
  } else {
    ctx.ellipse(x, y, rx, ry, -side * tilt, 0, Math.PI * 2);
  }
}

/** Upper lid line (with lashes). */
function upperLid(ctx: Ctx, x: number, y: number, side: 1 | -1, rx: number, ry: number, tilt: number, pointed: boolean, width: number, lashes: number) {
  stroke(ctx, INK, width, () => {
    if (pointed) {
      ctx.moveTo(x - side * rx, y + tilt * rx * 0.25);
      ctx.quadraticCurveTo(x - side * rx * 0.1, y - ry * 2.05, x + side * rx, y - tilt * rx);
    } else {
      ctx.ellipse(x, y, rx, ry, -side * tilt, Math.PI * 1.03, Math.PI * 1.97);
    }
  });
  if (!lashes) return;
  // outer-corner flicks: natural = 2 short, long = 3 longer + a wing
  const ox = x + side * rx * (pointed ? 0.98 : 0.92);
  const oy = pointed ? y - tilt * rx : y - ry * 0.32 - side * tilt * rx * 0.3;
  const n = lashes === 2 ? 3 : 2;
  const len = lashes === 2 ? 15 : 9;
  for (let i = 0; i < n; i++) {
    const bx = ox - side * i * rx * 0.24;
    const by = oy - i * ry * (pointed ? 0.32 : 0.28);
    const ang = -0.55 - i * 0.35;
    stroke(ctx, INK, lashes === 2 ? 4.2 : 3.4, () => {
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + side * len * 0.75, by + len * Math.sin(ang) * 0.4, bx + side * len * Math.cos(ang + 0.3), by + len * Math.sin(ang));
    });
  }
}

function drawOpenEye(ctx: Ctx, x: number, y: number, side: 1 | -1, mode: EyeMode, d: FaceDesign, skin: string, look: number) {
  const e = d.eye;
  const big = mode === "sparkle" ? 1.1 : mode === "dot" ? 0.86 : 1;
  const rx = e.rx * big;
  const ry = e.ry * big;
  const lid = Math.max(e.lid, mode === "half" ? 0.5 : mode === "dot" ? 0.22 : 0);
  ctx.save();
  eyePath(ctx, x, y, side, rx, ry, e.tilt, e.pointed);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.clip();
  // iris: a big coloured disc (readable from the village), darker at the top
  const irx = rx * 0.8;
  const iry = Math.max(ry * 0.92, irx);
  const ix = x + look;
  const iy = y + ry * 0.08;
  const g = ctx.createLinearGradient(ix, iy - iry, ix, iy + iry);
  g.addColorStop(0, tint(e.iris, -0.55));
  g.addColorStop(0.55, e.iris);
  g.addColorStop(1, tint(e.iris, 0.25));
  ellipse(ctx, ix, iy, irx, iry, g);
  ctx.lineWidth = 3;
  ctx.strokeStyle = tint(e.iris, -0.6);
  ctx.beginPath();
  ctx.ellipse(ix, iy, irx, iry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ellipse(ctx, ix, iy - iry * 0.05, irx * 0.46, iry * 0.48, "#140d10");
  // highlights
  ellipse(ctx, ix - irx * 0.38, iy - iry * 0.42, irx * 0.36, iry * 0.3, "#ffffff");
  ellipse(ctx, ix + irx * 0.4, iy + iry * 0.38, irx * 0.16, irx * 0.16, "rgba(255,255,255,0.9)");
  if (mode === "sparkle") {
    ctx.fillStyle = "#ffffff";
    const sx = ix + irx * 0.45;
    const sy = iy - iry * 0.45;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 2.5, sy - 2.5); ctx.lineTo(sx + 9, sy); ctx.lineTo(sx + 2.5, sy + 2.5);
    ctx.lineTo(sx, sy + 9); ctx.lineTo(sx - 2.5, sy + 2.5); ctx.lineTo(sx - 9, sy); ctx.lineTo(sx - 2.5, sy - 2.5);
    ctx.closePath();
    ctx.fill();
  }
  // heavy upper lid (hooded / sleepy / serious): skin-coloured cover
  const lidY = y - ry + 2 * ry * lid;
  if (lid > 0) {
    ctx.fillStyle = tint(skin, -0.08);
    ctx.fillRect(x - rx - 4, y - ry - 6, rx * 2 + 8, lidY - (y - ry - 6));
  }
  ctx.restore();
  // lower lash line (soft)
  stroke(ctx, "rgba(42,31,43,0.55)", 2.5, () => {
    if (e.pointed) {
      ctx.moveTo(x - side * rx * 0.75, y + ry * 0.55);
      ctx.quadraticCurveTo(x + side * rx * 0.05, y + ry * 1.0, x + side * rx * 0.85, y - e.tilt * rx * 0.6);
    } else {
      ctx.ellipse(x, y, rx, ry, -side * e.tilt, Math.PI * 0.18, Math.PI * 0.82);
    }
  });
  const lidW = e.lashes === 2 ? 8.5 : e.lashes === 1 ? 7 : 6;
  if (lid > 0) {
    // lid edge line + crease above it
    stroke(ctx, INK, lidW, () => {
      ctx.moveTo(x - rx * 0.98, lidY + 2);
      ctx.quadraticCurveTo(x, lidY - 5, x + rx * 0.98, lidY + 2);
    });
    if (e.lashes) upperLid(ctx, x, lidY + ry * 0.35, side, rx, ry * 0.35, e.tilt, e.pointed, 0.01, e.lashes);
    if (mode !== "half") stroke(ctx, tint(skin, -0.32, 0.8), 3, () => {
      ctx.moveTo(x - rx * 0.9, y - ry - 2);
      ctx.quadraticCurveTo(x, y - ry - 10, x + rx * 0.9, y - ry - 2);
    });
  } else {
    upperLid(ctx, x, y, side, rx, ry, e.tilt, e.pointed, lidW, e.lashes);
  }
}

/** Closed-line eyes (calm, blink, happy, cry, wink) sized by the eye shape. */
function drawLineEye(ctx: Ctx, x: number, y: number, side: 1 | -1, mode: EyeMode, d: FaceDesign) {
  const w = Math.max(22, d.eye.rx * 1.02);
  const lw = d.eye.lashes === 2 ? 11 : 10;
  const tilt = d.eye.tilt * w;
  switch (mode) {
    case "calm":
      stroke(ctx, INK, lw, () => { ctx.moveTo(x - w, y - 2 + side * tilt * 0.3); ctx.quadraticCurveTo(x, y + 24, x + w, y - 2 - side * tilt * 0.3); });
      break;
    case "happy":
      stroke(ctx, INK, lw + 1, () => { ctx.moveTo(x - w, y + 12); ctx.quadraticCurveTo(x, y - 28, x + w, y + 12); });
      break;
    case "wink":
    case "cry":
      stroke(ctx, INK, 11, () => { ctx.moveTo(x - 24 * side, y - 16); ctx.lineTo(x + 20 * side, y + 2); ctx.lineTo(x - 24 * side, y + 18); });
      break;
    default: // closed
      stroke(ctx, INK, lw, () => { ctx.moveTo(x - w, y + 4); ctx.quadraticCurveTo(x, y + 18, x + w, y + 4); });
  }
  if (d.eye.lashes && mode !== "wink" && mode !== "cry") {
    const n = d.eye.lashes === 2 ? 3 : 2;
    const ex = x + side * w;
    const ey = mode === "happy" ? y + 10 : y + 3;
    for (let i = 0; i < n; i++)
      stroke(ctx, INK, 3.6, () => {
        const bx = ex - side * i * 9;
        const by = ey + (mode === "happy" ? -i * 8 : i * 4);
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + side * (d.eye.lashes === 2 ? 13 : 9), by + (mode === "happy" ? -6 : 7));
      });
  }
  if (mode === "cry") {
    ctx.fillStyle = "rgba(110,190,255,0.92)";
    ctx.beginPath();
    ctx.ellipse(x, y + 52, 9, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 22 * side, y + 20);
    ctx.quadraticCurveTo(x + 36 * side, y + 46, x + 22 * side, y + 54);
    ctx.quadraticCurveTo(x + 8 * side, y + 46, x + 22 * side, y + 20);
    ctx.fill();
  }
}

// ---------------- brows ----------------

interface BrowPose { lift: number; inner: number; outer: number; flatten: number }

const BROW_POSE: Record<string, BrowPose> = {
  arch: { lift: 0, inner: 0, outer: 0, flatten: 0 },
  soft: { lift: 2, inner: 0, outer: 0, flatten: 0.4 },
  raised: { lift: -12, inner: 0, outer: -2, flatten: 0 },
  high: { lift: -8, inner: -2, outer: 0, flatten: 0 },
  droop: { lift: 2, inner: -3, outer: 9, flatten: 0.3 },
  flat: { lift: 3, inner: 8, outer: -2, flatten: 0.55 },
  worried: { lift: -2, inner: -11, outer: 6, flatten: 0.3 }
};

function drawBrow(ctx: Ctx, x: number, y: number, side: 1 | -1, d: FaceDesign, pose: BrowPose, color: string) {
  const b = d.brow;
  const p0 = [x - side * 25, y + pose.inner + pose.lift];
  const p1 = [x + side * 27, y + b.outer + pose.outer + pose.lift];
  const peakX = p0[0] + (p1[0] - p0[0]) * b.peakAt;
  const peakY = Math.min(p0[1], p1[1]) - b.peak * (1 - pose.flatten) + (p0[1] + p1[1]) / 2 - Math.min(p0[1], p1[1]);
  // control point so the curve passes through the peak at t≈0.5
  const c = [2 * peakX - (p0[0] + p1[0]) / 2, 2 * peakY - (p0[1] + p1[1]) / 2];
  const N = 14;
  const top: number[][] = [];
  const bot: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = qPoint(p0, c, p1, t);
    const q = qPoint(p0, c, p1, Math.min(1, t + 0.01));
    const r = qPoint(p0, c, p1, Math.max(0, t - 0.01));
    let nx = -(q[1] - r[1]);
    let ny = q[0] - r[0];
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (ny > 0) { nx = -nx; ny = -ny; } // normal points up
    const hw = (b.thick / 2) * (1 - 0.5 * t) * (t < 0.08 ? 0.75 + 3 * t : 1);
    top.push([p[0] + nx * hw, p[1] + ny * hw]);
    bot.push([p[0] - nx * hw, p[1] - ny * hw]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.stroke();
  if (b.bushy) {
    // little hairs sticking out of the brow
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const p = qPoint(p0, c, p1, t);
      const up = i % 2 ? -1 : 1;
      stroke(ctx, color, 3, () => {
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[0] + side * 6, p[1] + up * (b.thick * 0.55 + 2));
      });
    }
  }
}

// ---------------- nose ----------------

function drawNose(ctx: Ctx, kind: string, skin: string) {
  const x = 256;
  const y = NOSE_Y0;
  const ink = tint(skin, -0.42, 0.85);
  const shadow = tint(skin, -0.3, 0.4);
  const hi = "rgba(255,255,255,0.45)";
  switch (kind) {
    case "button":
      ellipse(ctx, x, y + 2, 9, 7, shadow);
      ellipse(ctx, x - 2, y - 1, 3.5, 3, hi);
      break;
    case "small":
      stroke(ctx, ink, 4, () => { ctx.moveTo(x - 5, y - 6); ctx.quadraticCurveTo(x + 9, y + 2, x - 3, y + 9); });
      break;
    case "round":
      ellipse(ctx, x, y - 1, 13, 11, tint(skin, -0.15, 0.35));
      ellipse(ctx, x - 3, y - 5, 5, 4, hi);
      stroke(ctx, ink, 4, () => { ctx.moveTo(x - 13, y + 5); ctx.quadraticCurveTo(x, y + 16, x + 13, y + 5); });
      ellipse(ctx, x - 7, y + 8, 3, 2.4, ink);
      ellipse(ctx, x + 7, y + 8, 3, 2.4, ink);
      break;
    case "straight":
      // bridge line down one side, then a small hook at the tip
      stroke(ctx, tint(skin, -0.3, 0.55), 3.5, () => { ctx.moveTo(x + 7, y - 32); ctx.lineTo(x + 8, y + 2); });
      stroke(ctx, ink, 4, () => { ctx.moveTo(x + 8, y + 2); ctx.quadraticCurveTo(x + 9, y + 11, x - 4, y + 10); });
      ellipse(ctx, x - 6, y + 9, 2.6, 2, ink);
      break;
    case "wide":
      stroke(ctx, ink, 4.5, () => { ctx.moveTo(x - 19, y + 2); ctx.quadraticCurveTo(x, y + 18, x + 19, y + 2); });
      for (const s of [-1, 1])
        stroke(ctx, ink, 4, () => { ctx.moveTo(x + s * 19, y + 2); ctx.quadraticCurveTo(x + s * 24, y - 6, x + s * 15, y - 9); });
      ellipse(ctx, x, y - 2, 7, 5, hi);
      break;
    case "pointed":
      ctx.fillStyle = shadow;
      ctx.beginPath();
      ctx.moveTo(x + 2, y - 26); ctx.lineTo(x + 12, y + 8); ctx.lineTo(x - 2, y + 9);
      ctx.closePath();
      ctx.fill();
      stroke(ctx, ink, 4, () => { ctx.moveTo(x + 2, y - 26); ctx.lineTo(x + 12, y + 8); ctx.lineTo(x - 3, y + 10); });
      break;
    default:
      ellipse(ctx, x, y + 2, 8, 6, shadow);
  }
}

// ---------------- mouth ----------------

/** The mouth line for a closed-mouth state, as a quadratic (start, control, end). */
function mouthCurve(kind: string, w: number): [number[], number[], number[]] | null {
  const x = 256;
  const y = MOUTH_Y0;
  switch (kind) {
    case "smile": return [[x - 26 * w, y - 2], [x, y + 22], [x + 26 * w, y - 2]];
    case "small": return [[x - 13 * w, y + 2], [x, y + 11], [x + 13 * w, y + 2]];
    case "wide": return [[x - 34 * w, y - 4], [x, y + 26], [x + 34 * w, y - 4]];
    case "frown": return [[x - 24 * w, y + 14], [x, y - 10], [x + 24 * w, y + 14]];
    case "flat": return [[x - 18 * w, y + 4], [x - 2, y + 2], [x + 15 * w, y + 1]];
    case "smirk": return [[x - 26 * w, y + 2], [x + 2, y + 18], [x + 26 * w, y - 8]];
    default: return null;
  }
}

function drawLips(ctx: Ctx, curve: [number[], number[], number[]], full: number, fill: string) {
  const [p0, c, p1] = curve;
  const up = 5 + 7 * full;
  const low = 6 + 12 * full;
  const N = 16;
  const top: number[][] = [];
  const bot: number[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const p = qPoint(p0, c, p1, t);
    const s = Math.sin(Math.PI * t);
    const bow = 1 - 0.45 * Math.exp(-Math.pow((t - 0.5) / 0.08, 2)); // cupid's bow dip
    top.push([p[0], p[1] - up * Math.pow(s, 0.6) * bow]);
    bot.push([p[0], p[1] + low * Math.pow(s, 0.8)]);
  }
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]);
  for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
  ctx.closePath();
  ctx.fill();
  // lower-lip shine
  const m = qPoint(p0, c, p1, 0.5);
  ellipse(ctx, m[0] - 3, m[1] + low * 0.5, 6 + 4 * full, 2.2 + full, "rgba(255,255,255,0.35)");
}

function drawMouth(ctx: Ctx, kind: string, f: FaceArt) {
  const x = 256;
  const y = MOUTH_Y0;
  const m = f.d.mouth;
  const w = m.w * 1.15;
  // lipstick, or natural-toned full lips
  const fill = f.d.lip ?? (m.full >= 0.9 ? "#c9776b" : null);
  const line = fill ? tint(fill, -0.45) : f.lipInk;
  const curve = mouthCurve(kind, w);
  if (curve) {
    if (fill) drawLips(ctx, curve, m.full, fill);
    else if (m.full > 0) {
      // a soft lower-lip hint under the line
      const mid = qPoint(curve[0], curve[1], curve[2], 0.5);
      ellipse(ctx, mid[0], mid[1] + 7 + 3 * m.full, 9 * w, 3 + 2 * m.full, tint(f.lipInk, 0.4, 0.28));
    }
    stroke(ctx, line, fill ? Math.max(3.5, m.line * 0.55) : m.line, () => {
      ctx.moveTo(curve[0][0], curve[0][1]);
      ctx.quadraticCurveTo(curve[1][0], curve[1][1], curve[2][0], curve[2][1]);
    });
    if (kind === "smirk") {
      ctx.fillStyle = "#ff7d93";
      ctx.beginPath();
      ctx.ellipse(x + 8 * w, y + 15, 10, 13, 0.2, 0, Math.PI);
      ctx.fill();
    }
    return;
  }
  const lipRing = fill ? 3 + 4 * m.full : 0;
  switch (kind) {
    case "open": {
      const hw = 30 * Math.max(0.75, w);
      ctx.fillStyle = f.lipInk;
      ctx.beginPath();
      ctx.moveTo(x - hw, y - 8);
      ctx.quadraticCurveTo(x, y - 2, x + hw, y - 8);
      ctx.quadraticCurveTo(x + hw * 0.87, y + 34, x, y + 34);
      ctx.quadraticCurveTo(x - hw * 0.87, y + 34, x - hw, y - 8);
      ctx.fill();
      if (lipRing && fill) {
        ctx.strokeStyle = fill;
        ctx.lineWidth = lipRing;
        ctx.stroke();
      }
      ellipse(ctx, x, y + 22, 15 * Math.max(0.75, w), 9, "#ff8f9e");
      break;
    }
    case "o":
      ellipse(ctx, x, y + 6, 13 + lipRing * 0.5, 16 + lipRing * 0.5, fill ?? f.lipInk);
      ellipse(ctx, x, y + 8, 8, 10, f.lipInk);
      ellipse(ctx, x, y + 12, 6, 5, "#ff8f9e");
      break;
    case "pucker":
      stroke(ctx, fill ?? f.lipInk, 8 + lipRing, () => {
        ctx.moveTo(x - 8, y - 10); ctx.quadraticCurveTo(x + 14, y - 6, x - 2, y + 4);
        ctx.quadraticCurveTo(x + 14, y + 12, x - 8, y + 18);
      });
      break;
    case "wavy":
      stroke(ctx, fill ?? f.lipInk, m.line, () => {
        ctx.moveTo(x - 16 * w, y + 4); ctx.quadraticCurveTo(x - 8 * w, y - 2, x, y + 4); ctx.quadraticCurveTo(x + 8 * w, y + 10, x + 16 * w, y + 4);
      });
      break;
  }
}

// ---------------- expressions ----------------

/** Per-expression recipe: eye modes (character's right, left), brow pose, resting mouth, extra blush. */
const EXPR: Record<string, { eyes: [EyeMode, EyeMode]; brow: string; mouth: string; blush: number }> = {
  smile: { eyes: ["open", "open"], brow: "arch", mouth: "smile", blush: 0 },
  calm: { eyes: ["calm", "calm"], brow: "soft", mouth: "small", blush: 0 },
  cheeky: { eyes: ["open", "open"], brow: "raised", mouth: "smirk", blush: 0 },
  sleepy: { eyes: ["half", "half"], brow: "droop", mouth: "wavy", blush: 0 },
  bright: { eyes: ["sparkle", "sparkle"], brow: "high", mouth: "open", blush: 0.15 },
  serious: { eyes: ["dot", "dot"], brow: "flat", mouth: "flat", blush: 0 },
  shy: { eyes: ["open", "open"], brow: "worried", mouth: "small", blush: 0.55 },
  wink: { eyes: ["open", "wink"], brow: "arch", mouth: "wide", blush: 0 }
};

function blush(ctx: Ctx, a: number) {
  if (a <= 0) return;
  for (const s of [-1, 1]) {
    const cx = 256 + s * 148;
    const g = ctx.createRadialGradient(cx, 254, 2, cx, 254, 40);
    g.addColorStop(0, `rgba(255,105,135,${a})`);
    g.addColorStop(0.6, `rgba(255,120,150,${a * 0.6})`);
    g.addColorStop(1, "rgba(255,120,150,0)");
    ctx.save();
    ctx.translate(cx, 254);
    ctx.scale(1, 0.55);
    ctx.translate(-cx, -254);
    ellipse(ctx, cx, 254, 42, 42, g);
    ctx.restore();
  }
}

export function drawFace(ctx: Ctx, f: FaceArt) {
  const rc = EXPR[f.expr] ?? EXPR.smile;
  ctx.clearRect(0, 0, FACE_W, FACE_H);
  ctx.save();
  ctx.translate(PIVOT_X, PIVOT_Y);
  ctx.scale(FEATURE_SCALE, FEATURE_SCALE);
  ctx.translate(-PIVOT_X, -PIVOT_Y);
  const happy = f.eyes === "happy";
  blush(ctx, Math.max(f.d.blush, rc.blush, happy || f.mouth === "pucker" ? 0.4 : 0));
  if (f.expr === "shy") {
    for (const s of [-1, 1])
      for (let i = 0; i < 3; i++)
        stroke(ctx, "rgba(230,90,120,0.75)", 4, () => { const bx = 256 + s * 148 - 14 + i * 12; ctx.moveTo(bx + 6, 244); ctx.lineTo(bx - 2, 264); });
  }
  drawNose(ctx, f.d.nose, f.skin);
  // eyes: index 0 = viewer's left = the character's right eye
  for (const [i, side] of [[0, -1], [1, 1]] as const) {
    const x = 256 + side * EYE_X0;
    let mode: EyeMode = rc.eyes[i];
    if (f.eyes === "closed") mode = "closed";
    else if (f.eyes === "happy") mode = "happy";
    else if (f.eyes === "cry") mode = "cry";
    const look = f.expr === "shy" && mode === "open" ? 6 : 0;
    if (mode === "open" || mode === "sparkle" || mode === "half" || mode === "dot") drawOpenEye(ctx, x + look, EYE_Y0, side, mode, f.d, f.skin, 0);
    else drawLineEye(ctx, x, EYE_Y0, side, mode, f.d);
  }
  // brows sit above the eye opening
  const browY = EYE_Y0 - Math.max(48, f.d.eye.ry * (rc.eyes[0] === "sparkle" ? 1.1 : 1) + 24);
  const browPose = f.eyes === "cry" ? "worried" : rc.brow;
  for (const side of [-1, 1] as const) {
    const k = f.expr === "cheeky" ? (side === 1 ? "raised" : "arch") : browPose;
    drawBrow(ctx, 256 + side * (EYE_X0 + 4), browY, side, f.d, BROW_POSE[k] ?? BROW_POSE.arch, f.browColor);
  }
  drawMouth(ctx, f.mouth === "base" ? rc.mouth : f.mouth, f);
  ctx.restore();
}
