/**
 * Pure placement data for the kitchen and the library (positions relative to
 * each place's centre), plus the small helpers their 3D code uses: book rows,
 * steam puffs and reading the sim's kitchen state. No React, no three.js, so
 * tests can prove props stay off the paths and the spots twins use.
 */
import type { DishLook } from "@aivillage/shared";
import { rng } from "../scenery";

// ---------------- the kitchen ----------------

/** Tiled cooking floor under the island, the range and the pergola (it reaches a little past the round pad). */
export const KITCHEN_FLOOR = { x: 0, z: -1.22, w: 3.9, d: 1.96, r: 0.45 };
/** Slatted pergola over the cooking area: four posts at its corners, roof at `y`. */
export const KITCHEN_PERGOLA = { x0: -1.5, x1: 1.5, z0: -2.0, z1: -0.35, y: 1.45 };
/** Worktop height of the island and the range (above the pad). */
export const KITCHEN_TOP = 0.34;
/** Where a board sits on the island (z) and a pan on its burner (z), relative. */
export const BOARD_Z = -0.76;
export const BURNER_Z = -1.7;
/** Long-table top height (above the pad). */
export const TABLE_TOP = 0.34;

/** Free-standing kitchen props, each with a footprint radius. */
export const KITCHEN_PROPS: { id: string; x: number; z: number; r: number }[] = [
  { id: "oven", x: -1.6, z: 0.15, r: 0.3 },
  { id: "fridge", x: -1.72, z: -1.25, r: 0.2 },
  { id: "herbs-east", x: 1.72, z: -1.2, r: 0.2 },
  { id: "herbs-front", x: -1.15, z: 1.25, r: 0.2 },
  { id: "pot-plant", x: -0.75, z: 1.85, r: 0.14 },
  { id: "light-pole", x: 1.2, z: 1.95, r: 0.06 }
];

export const kitchenProp = (id: string): { x: number; z: number; r: number } => {
  const p = KITCHEN_PROPS.find((k) => k.id === id);
  if (!p) throw new Error(`no kitchen prop ${id}`);
  return p;
};

// ---------------- the library ----------------

/** Slatted roof over the back half (shelves, back armchairs, back desks); the front stays open. */
export const LIBRARY_ROOF = { x0: -1.45, x1: 1.5, z0: -1.62, z1: -0.35, y: 1.35 };
/** Bookcase size: height and depth (width comes from LIBRARY.shelves). */
export const SHELF = { h: 0.86, d: 0.22, rows: 3 };
/** Desk size: along x (toward the sitter) and along z. */
export const DESK = { w: 0.3, d: 0.46, top: 0.34 };
/** Round rug under the reading corner. */
export const LIBRARY_RUG = { x: -0.62, z: -0.2, r: 0.55 };

export const LIBRARY_PROPS: { id: string; x: number; z: number; r: number }[] = [
  { id: "side-table", x: -0.9, z: -0.97, r: 0.1 },
  { id: "floor-lamp", x: -1.2, z: 0.45, r: 0.08 },
  { id: "plant-front", x: -0.35, z: 1.35, r: 0.13 },
  { id: "plant-desk", x: 0.95, z: 1.45, r: 0.11 }
];

export const libraryProp = (id: string): { x: number; z: number; r: number } => {
  const p = LIBRARY_PROPS.find((k) => k.id === id);
  if (!p) throw new Error(`no library prop ${id}`);
  return p;
};

export const BOOK_COLORS = [
  "#e2574c", "#2f6bff", "#f5a623", "#3dbf7a", "#8a7cf6", "#ff8fa3", "#1fb5c9", "#ffd27a", "#a07c58", "#1f3c88", "#f2efe6"
] as const;

/** A book spine: x = centre from the row's left end; tilt > 0 leans its top to the right by that angle. */
export interface Book { x: number; w: number; h: number; color: string; tilt: number }

/**
 * One shelf row of book spines, packed left to right inside `width` (x is the
 * spine's centre, measured from the row's left end). Books are shorter than
 * `rowH`; now and then a gap, and the last book may lean on its neighbour.
 */
export function bookRow(seed: number, width: number, rowH: number): Book[] {
  const rand = rng(seed);
  const out: Book[] = [];
  let x = 0.01;
  while (true) {
    const w = 0.026 + rand() * 0.022;
    const h = rowH * (0.62 + rand() * 0.3);
    const gap = rand() < 0.12 ? 0.04 + rand() * 0.05 : 0.002;
    const color = BOOK_COLORS[Math.floor(rand() * BOOK_COLORS.length)];
    if (x + gap + w > width - 0.01) break;
    x += gap;
    out.push({ x: x + w / 2, w, h, color, tilt: 0 });
    x += w;
  }
  // the end book leans to the right (pivoting on its bottom-left corner) when there is room
  const last = out[out.length - 1];
  if (last && width - 0.01 - (last.x + last.w / 2) > Math.sin(0.28) * last.h) last.tilt = 0.28;
  return out;
}

// ---------------- steam ----------------

/**
 * One steam puff over a pan, k of n, at time t (s): rises and grows, then fades.
 * y is the height above the pan, s the radius, o the opacity.
 */
export function steamPuff(t: number, k: number, n: number): { y: number; s: number; o: number; dx: number } {
  const u = (((t * 0.45 + k / n) % 1) + 1) % 1;
  return {
    y: 0.03 + u * 0.32,
    s: 0.022 + u * 0.045,
    o: 0.55 * Math.sin(Math.PI * u),
    dx: Math.sin((t + k * 1.7) * 1.3) * 0.02 * u
  };
}

// ---------------- the sim's kitchen state ----------------

const LOOKS = new Set<string>(["burger", "chicken", "steak", "pasta", "dessert", "salad", "drink", "plate"]);

/**
 * Copy `raw` (whatever the sim returned) into `out` as exactly `out.length`
 * looks or nulls; unknown values count as null. Returns true when `out` changed.
 */
export function copySlots(raw: unknown, out: (DishLook | null)[]): boolean {
  const src = Array.isArray(raw) ? raw : [];
  let changed = false;
  for (let i = 0; i < out.length; i++) {
    const v = src[i];
    const look = typeof v === "string" && LOOKS.has(v) ? (v as DishLook) : null;
    if (out[i] !== look) {
      out[i] = look;
      changed = true;
    }
  }
  return changed;
}


// ---------------- the quiet corner ----------------

/**
 * Quiet Corner props (relative). The path to the library now runs north–south
 * through its centre, the bench sits east of it (BENCH): the lamp stands at the
 * bench's front-right corner, the tree and the flowers on the west side.
 */
export const QUIET_PROPS = {
  lamp: { x: 1.2, z: 0.3, r: 0.06 },
  tree: { x: -0.95, z: -0.62, r: 0.2 },
  flowers: { x: -0.7, z: 0.35, r: 0.26 }
};
