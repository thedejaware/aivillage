"use client";

/**
 * Small low-poly food for the kitchen (and a twin's hands), ~0.1–0.2 world
 * units across. One model per DishLook, in three stages:
 *  - "raw":   the ingredients on a cutting board (chopped veg, raw meat, dough…)
 *  - "pan":   cooking in a frying pan (a drink shows its blender jug)
 *  - "plate": served on a white plate (a drink is a glass with a straw)
 * The origin is the centre of the bottom of the board / pan / plate. With
 * `bare` only the food is drawn, sitting on y = 0 (the kitchen puts it on its
 * own boards and pans). Every geometry and material is shared.
 */
import * as THREE from "three";
import type { ReactNode } from "react";
import type { DishLook } from "@aivillage/shared";
import { cachedGeo, glass, solid, unit } from "./materials";
import { Ball, Box, Cyl, RBox, type V3 } from "./parts";

export type DishStage = "raw" | "pan" | "plate";

/** Height of the surface the food sits on, per stage (board top, pan floor, plate top). */
export const DISH_BASE_TOP: Record<DishStage, number> = { raw: 0.012, pan: 0.006, plate: 0.009 };
/** Footprints: board w × d, pan and plate radius. */
export const BOARD_SIZE = { w: 0.2, d: 0.13 };
export const PAN_R = 0.07;
export const PLATE_R = 0.075;

const C = {
  bun: "#e0a35a", bunTop: "#e8a95c", sesame: "#fff3d0", rawMeat: "#e88a8a", patty: "#6e4128", cheese: "#ffc93c",
  lettuce: "#7cc451", tomato: "#e8473f", fries: "#ffd25a",
  rawChicken: "#f2b0a6", chicken: "#d08436", bone: "#fbf6ea",
  rawSteak: "#d9474f", fat: "#f6dcc6", steak: "#7b4326", grill: "#3e2214", potato: "#f2c45a", greens: "#4f9e3a", herb: "#3f8f3a",
  pasta: "#f2d48a", sauce: "#c8352c", meatball: "#7a3b22",
  dough: "#f6e3b4", egg: "#fffaf0", berry: "#e8364a", butter: "#ffe58a", sponge: "#f2cf8f", cream: "#ffd3dc", icing: "#ff9fb4", cakeTop: "#c98a45",
  leaf: "#8fd16a", cucumber: "#c9e8a8", carrot: "#ff9a3d", bowl: "#9fd9b0", feta: "#fbfbf3",
  orange: "#ff9a2e", juice: "#ffa733", straw: "#ff5f7e", purple: "#c2185b",
  rice: "#f7f4ea", salmon: "#ff8c69", pea: "#7cc451",
  board: "#d9b48a", boardEdge: "#c49a6c", plate: "#ffffff", plateIn: "#eef6ff", dark: "#3a4558", handle: "#a07c58"
} as const;

/** Frying-pan metal: seen from inside too, so double-sided (and not folded into a static batch's plain colours). */
let panMat: THREE.MeshStandardMaterial | null = null;
export function panMaterial(): THREE.MeshStandardMaterial {
  panMat ??= new THREE.MeshStandardMaterial({ color: C.dark, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
  return panMat;
}

const panWall = () => cachedGeo("dish:pan-wall", () => new THREE.CylinderGeometry(1, 0.88, 1, 16, 1, true));
const bowlGeo = () => cachedGeo("dish:bowl", () => new THREE.CylinderGeometry(1, 0.62, 1, 14));
/** A tangle of noodles lying flat. */
const noodles = () => cachedGeo("dish:noodles", () => new THREE.TorusKnotGeometry(1, 0.24, 40, 5, 2, 7).rotateX(-Math.PI / 2));
/** A 60° slice of cake (radius 1, height 1), apex at the origin, pointing −z, bottom on y = 0. */
const wedge = () =>
  cachedGeo("dish:wedge", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.absarc(0, 0, 1, Math.PI / 2 - Math.PI / 6, Math.PI / 2 + Math.PI / 6, false);
    s.lineTo(0, 0);
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 6 }).rotateX(-Math.PI / 2);
  });

// tiny shorthands: food never casts shadows (too small to read, and it saves the shadow pass)
const box = (size: V3, p: V3, c: string, r?: V3, rough = 0.75) => <Box size={size} p={p} r={r} m={solid(c, rough)} cast={false} />;
const ball = (rad: number, p: V3, c: string, scale?: V3, rough = 0.7) => <Ball rad={rad} p={p} scale={scale} m={solid(c, rough)} cast={false} low />;
const disc = (rad: number, h: number, p: V3, c: string, r?: V3) => <Cyl rad={rad} h={h} p={p} r={r} m={solid(c, 0.7)} cast={false} />;
const dome = (rad: number, hgt: number, p: V3, c: string) => (
  <mesh geometry={unit.dome()} position={p} scale={[rad, hgt, rad]} material={solid(c, 0.7)} />
);

// ---------------- bases ----------------

export function BoardBase() {
  return (
    <group>
      <RBox size={[BOARD_SIZE.w, 0.012, BOARD_SIZE.d]} radius={0.004} p={[0, 0.006, 0]} m={solid(C.board, 0.8)} cast={false} />
      <Box size={[0.012, 0.004, 0.012]} p={[-BOARD_SIZE.w / 2 + 0.014, 0.0125, BOARD_SIZE.d / 2 - 0.014]} m={solid(C.boardEdge, 0.8)} cast={false} />
    </group>
  );
}

/** Frying pan; the handle points along +x. */
export function PanBase() {
  const m = panMaterial();
  return (
    <group>
      <Cyl rad={PAN_R - 0.007} h={0.006} p={[0, 0.003, 0]} m={m} cast={false} />
      <mesh geometry={panWall()} position={[0, 0.015, 0]} scale={[PAN_R, 0.03, PAN_R]} material={m} />
      <Box size={[0.07, 0.008, 0.014]} p={[PAN_R + 0.03, 0.026, 0]} r={[0, 0, 0.12]} m={m} cast={false} />
      <RBox size={[0.05, 0.012, 0.018]} radius={0.004} p={[PAN_R + 0.085, 0.032, 0]} r={[0, 0, 0.12]} m={solid(C.handle, 0.8)} cast={false} />
    </group>
  );
}

export function PlateBase() {
  return (
    <group>
      <Cyl rad={PLATE_R} h={0.008} p={[0, 0.004, 0]} m={solid(C.plate, 0.45)} cast={false} />
      <Cyl rad={PLATE_R - 0.016} h={0.002} p={[0, 0.0085, 0]} m={solid(C.plateIn, 0.5)} cast={false} />
    </group>
  );
}

// ---------------- food parts ----------------

/** A drumstick lying flat, meat at the origin, bone toward +z. */
function Drum({ p, yaw, c }: { p: V3; yaw: number; c: string }) {
  return (
    <group position={p} rotation={[0, yaw, 0]}>
      {ball(0.021, [0, 0, 0], c, [1, 0.8, 1.45])}
      <Cyl rad={0.005} h={0.022} p={[0, 0, 0.038]} r={[Math.PI / 2, 0, 0]} m={solid(C.bone, 0.6)} cast={false} low />
      {ball(0.007, [0, 0, 0.05], C.bone)}
    </group>
  );
}

function Steak({ c, marks, p = [0, 0, 0] }: { c: string; marks: boolean; p?: V3 }) {
  return (
    <group position={p}>
      <RBox size={[0.08, 0.014, 0.055]} radius={0.006} p={[0, 0.007, 0]} m={solid(c, 0.7)} cast={false} />
      {!marks && box([0.078, 0.01, 0.008], [0, 0.006, -0.026], C.fat)}
      {marks && [-0.02, 0, 0.02].map((x) => <group key={x}>{box([0.004, 0.002, 0.05], [x, 0.0145, 0], C.grill, [0, 0.5, 0])}</group>)}
    </group>
  );
}

function Burger({ p = [0, 0, 0] }: { p?: V3 }) {
  return (
    <group position={p}>
      {disc(0.034, 0.014, [0, 0.007, 0], C.bun)}
      {disc(0.036, 0.012, [0, 0.02, 0], C.patty)}
      {box([0.05, 0.003, 0.05], [0, 0.0275, 0], C.cheese, [0, Math.PI / 4, 0])}
      {disc(0.038, 0.004, [0, 0.031, 0], C.lettuce)}
      {disc(0.03, 0.005, [0, 0.0355, 0], C.tomato)}
      {dome(0.035, 0.026, [0, 0.038, 0], C.bunTop)}
      {ball(0.004, [0.01, 0.062, 0.006], C.sesame)}
      {ball(0.004, [-0.008, 0.061, -0.01], C.sesame)}
    </group>
  );
}

function Pasta({ s, p = [0, 0, 0] }: { s: number; p?: V3 }) {
  return (
    <group position={p}>
      {/* the knot is ±1.74 wide and ±0.74 tall before scaling */}
      <mesh geometry={noodles()} position={[0, s * 0.3, 0]} scale={[s, s * 0.4, s]} material={solid(C.pasta, 0.75)} />
      {ball(s * 0.85, [0, s * 0.6, 0], C.sauce, [1, 0.32, 1])}
    </group>
  );
}

function Leaves({ n, r, y, seed = 1 }: { n: number; r: number; y: number; seed?: number }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + seed;
    const d = r * Math.sqrt((i + 0.5) / n);
    out.push(
      <mesh
        key={i} geometry={unit.ico()} position={[Math.cos(a) * d, y + (i % 3) * 0.004, Math.sin(a) * d]}
        scale={[0.016, 0.009, 0.014]} rotation={[0.3 * i, a, 0.2]} material={solid(i % 3 ? C.leaf : C.greens, 0.8, true)}
      />
    );
  }
  return <>{out}</>;
}

// ---------------- each look, each stage ----------------

function raw(look: DishLook): ReactNode {
  switch (look) {
    case "burger":
      return <>
        {disc(0.034, 0.014, [-0.05, 0.007, -0.01], C.rawMeat)}
        {dome(0.032, 0.022, [0.045, 0, -0.02], C.bun)}
        {disc(0.018, 0.005, [0.03, 0.0025, 0.038], C.tomato)}
        {disc(0.018, 0.005, [0.062, 0.0025, 0.03], C.tomato)}
        {ball(0.022, [-0.055, 0.005, 0.042], C.lettuce, [1, 0.3, 0.8])}
      </>;
    case "chicken":
      return <>
        <Drum p={[-0.045, 0.015, -0.01]} yaw={0.4} c={C.rawChicken} />
        <Drum p={[0.0, 0.015, -0.02]} yaw={-0.5} c={C.rawChicken} />
        {ball(0.011, [0.06, 0.008, 0.02], "#c98bd1")}
        {box([0.016, 0.01, 0.016], [0.07, 0.005, -0.03], C.tomato, [0, 0.4, 0])}
        {box([0.016, 0.01, 0.016], [0.045, 0.005, 0.04], C.lettuce, [0, 0.9, 0])}
      </>;
    case "steak":
      return <>
        <Steak c={C.rawSteak} marks={false} p={[-0.03, 0, 0]} />
        <Cyl rad={0.003} h={0.05} p={[0.055, 0.004, 0.03]} r={[0, 0.3, Math.PI / 2]} m={solid(C.herb, 0.8)} cast={false} low />
        {ball(0.009, [0.06, 0.008, -0.02], C.egg)}
        {ball(0.008, [0.074, 0.007, -0.035], C.egg)}
      </>;
    case "pasta":
      return <>
        {[-0.008, -0.004, 0, 0.004, 0.008].map((z, i) => (
          <Cyl key={z} rad={0.0025} h={0.12} p={[-0.025, 0.003 + (i % 2) * 0.004, z]} r={[0, 0, Math.PI / 2]} m={solid(C.pasta, 0.7)} cast={false} low />
        ))}
        {ball(0.014, [0.055, 0.014, 0.035], C.tomato)}
        {ball(0.013, [0.075, 0.013, 0.008], C.tomato)}
        {ball(0.013, [0.06, 0.004, -0.035], C.herb, [1, 0.25, 0.6])}
      </>;
    case "dessert":
      return <>
        {ball(0.026, [-0.045, 0.019, 0], C.dough, [1, 0.75, 1])}
        {ball(0.011, [0.025, 0.012, -0.03], C.egg, [0.85, 1.15, 0.85])}
        {ball(0.011, [0.048, 0.012, -0.018], C.egg, [0.85, 1.15, 0.85])}
        {ball(0.01, [0.055, 0.01, 0.035], C.berry)}
        {box([0.022, 0.014, 0.016], [0.01, 0.007, 0.038], C.butter)}
      </>;
    case "salad":
      return <>
        {ball(0.026, [-0.05, 0.014, 0], C.leaf, [1, 0.55, 1])}
        {dome(0.014, 0.012, [0.0, 0, 0.03], C.tomato)}
        {dome(0.014, 0.012, [0.022, 0, 0.042], C.tomato)}
        {[0.035, 0.052, 0.069].map((x) => <group key={x}>{disc(0.012, 0.004, [x, 0.002, -0.025], C.cucumber)}</group>)}
        {[0.05, 0.062].map((x) => <group key={x}>{box([0.004, 0.004, 0.035], [x, 0.002, 0.03], C.carrot, [0, 0.3, 0])}</group>)}
      </>;
    case "drink":
      return <>
        {dome(0.02, 0.018, [-0.06, 0, -0.01], C.orange)}
        {ball(0.019, [-0.03, 0.019, 0.03], C.orange)}
        {ball(0.007, [-0.02, 0.007, -0.035], C.purple)}
        {ball(0.007, [-0.008, 0.007, -0.03], C.purple)}
        <Blender p={[0.05, 0, 0]} />
      </>;
    default:
      return <>
        {ball(0.024, [-0.045, 0.01, 0], C.rice, [1, 0.45, 1])}
        <RBox size={[0.05, 0.012, 0.03]} radius={0.005} p={[0.03, 0.006, -0.01]} m={solid(C.salmon, 0.7)} cast={false} />
        <Cyl rad={0.003} h={0.06} p={[0.03, 0.003, 0.04]} r={[0, 0.2, Math.PI / 2]} m={solid(C.lettuce, 0.8)} cast={false} low />
      </>;
  }
}

function inPan(look: DishLook): ReactNode {
  switch (look) {
    case "burger":
      return <>
        {disc(0.027, 0.012, [-0.024, 0.006, 0], C.patty)}
        {disc(0.027, 0.012, [0.026, 0.006, 0.005], C.patty)}
        {box([0.038, 0.003, 0.038], [0.026, 0.0135, 0.005], C.cheese, [0, Math.PI / 4, 0])}
      </>;
    case "chicken":
      return <>
        <Drum p={[-0.02, 0.014, -0.015]} yaw={0.5} c={C.chicken} />
        <Drum p={[0.022, 0.014, -0.005]} yaw={-0.6} c={C.chicken} />
        {ball(0.006, [0.0, 0.006, 0.035], C.herb)}
      </>;
    case "steak":
      return <Steak c={C.steak} marks />;
    case "pasta":
      return <Pasta s={0.03} />;
    case "dessert":
      return <>
        {disc(0.05, 0.026, [0, 0.013, 0], C.sponge)}
        {disc(0.049, 0.004, [0, 0.028, 0], C.cakeTop)}
      </>;
    case "salad":
      return <>
        {[[-0.025, 0.01, C.greens], [0.0, -0.02, C.tomato], [0.024, 0.012, C.carrot], [-0.005, 0.028, C.lettuce], [0.03, -0.018, C.greens], [-0.035, -0.02, C.cheese]].map(([x, z, c], i) => (
          <group key={i}>{ball(0.011, [x as number, 0.007, z as number], c as string)}</group>
        ))}
      </>;
    case "drink":
      return <Blender p={[0, 0, 0]} />;
    default:
      return <>
        {ball(0.04, [0, 0.006, 0], C.rice, [1, 0.3, 1])}
        {[[0.015, 0.01, C.pea], [-0.018, 0.012, C.carrot], [0.005, -0.02, C.pea], [-0.01, -0.006, C.salmon]].map(([x, z, c], i) => (
          <group key={i}>{ball(0.006, [x as number, 0.016, z as number], c as string)}</group>
        ))}
      </>;
  }
}

function onPlate(look: DishLook): ReactNode {
  switch (look) {
    case "burger":
      return <>
        <Burger p={[-0.012, 0, 0]} />
        {[-0.012, 0, 0.012].map((z, i) => <group key={z}>{box([0.006, 0.006, 0.034], [0.045 + i * 0.004, 0.004, z], C.fries, [0, 0.2 * (i - 1), 0])}</group>)}
      </>;
    case "chicken":
      return <>
        <Drum p={[-0.02, 0.013, -0.012]} yaw={0.6} c={C.chicken} />
        <Drum p={[0.018, 0.013, -0.002]} yaw={-0.4} c={C.chicken} />
        {ball(0.013, [0.035, 0.007, 0.038], C.cheese, [1, 0.6, 0.6])}
        {ball(0.01, [-0.035, 0.008, 0.035], C.herb)}
      </>;
    case "steak":
      return <>
        <Steak c={C.steak} marks p={[-0.014, 0, 0]} />
        {ball(0.011, [0.045, 0.009, 0.02], C.potato)}
        {ball(0.01, [0.034, 0.008, 0.038], C.potato)}
        {ball(0.012, [0.045, 0.01, -0.03], C.greens)}
      </>;
    case "pasta":
      return <>
        <Pasta s={0.033} />
        {ball(0.009, [0.022, 0.026, 0.01], C.meatball)}
        {ball(0.01, [-0.01, 0.03, -0.012], C.herb, [1, 0.25, 0.6])}
      </>;
    case "dessert":
      return <group position={[0, 0, 0.03]}>
        <mesh geometry={wedge()} scale={[0.06, 0.022, 0.06]} material={solid(C.sponge, 0.75)} />
        <mesh geometry={wedge()} position={[0, 0.022, 0]} scale={[0.06, 0.006, 0.06]} material={solid(C.cream, 0.75)} />
        <mesh geometry={wedge()} position={[0, 0.028, 0]} scale={[0.06, 0.008, 0.06]} material={solid(C.sponge, 0.75)} />
        <mesh geometry={wedge()} position={[0, 0.036, 0]} scale={[0.061, 0.004, 0.061]} material={solid(C.icing, 0.6)} />
        {ball(0.009, [0, 0.046, -0.04], C.berry)}
      </group>;
    case "salad":
      return <>
        <mesh geometry={bowlGeo()} position={[0, 0.02, 0]} scale={[0.058, 0.04, 0.058]} material={solid(C.bowl, 0.5)} />
        <Leaves n={9} r={0.045} y={0.044} />
        {ball(0.008, [0.015, 0.052, 0.01], C.tomato)}
        {ball(0.008, [-0.02, 0.05, -0.012], C.tomato)}
        {box([0.012, 0.012, 0.012], [0.0, 0.052, -0.022], C.feta, [0.3, 0.5, 0])}
      </>;
    case "drink":
      return <Glass />;
    default:
      return <>
        {ball(0.03, [-0.018, 0.006, 0], C.rice, [1, 0.6, 1])}
        <RBox size={[0.045, 0.014, 0.028]} radius={0.005} p={[0.03, 0.007, 0.005]} m={solid(C.salmon, 0.7)} cast={false} />
        {ball(0.01, [0.022, 0.008, 0.042], C.greens)}
      </>;
  }
}

/** Blender jug with juice (drinks are blended at the counter). */
function Blender({ p }: { p: V3 }) {
  return (
    <group position={p}>
      <RBox size={[0.042, 0.022, 0.042]} radius={0.006} p={[0, 0.011, 0]} m={solid(C.dark, 0.5)} cast={false} />
      {disc(0.019, 0.034, [0, 0.039, 0], C.juice)}
      <Cyl rad={0.022} h={0.06} p={[0, 0.052, 0]} m={glass("#dff4ff", 0.35)} cast={false} receive={false} />
      {disc(0.023, 0.006, [0, 0.085, 0], C.dark)}
    </group>
  );
}

/** A tall glass of juice with a straw and an orange slice on the rim. */
function Glass() {
  return (
    <group>
      {disc(0.018, 0.055, [0, 0.0285, 0], C.juice)}
      <Cyl rad={0.021} h={0.075} p={[0, 0.0375, 0]} m={glass("#dff4ff", 0.35)} cast={false} receive={false} />
      <Cyl rad={0.0032} h={0.065} p={[0.007, 0.075, 0]} r={[0, 0, -0.28]} m={solid(C.straw, 0.6)} cast={false} low />
      <Cyl rad={0.013} h={0.003} p={[-0.021, 0.068, 0]} r={[Math.PI / 2, 0, Math.PI / 2]} m={solid("#ffb347", 0.6)} cast={false} />
    </group>
  );
}

const FOOD: Record<DishStage, (look: DishLook) => ReactNode> = { raw, pan: inPan, plate: onPlate };

/** A dish at one stage. Keep this signature: the avatar draws a twin's dish with it. */
export function DishModel({ look, stage, bare = false }: { look: DishLook; stage: DishStage; bare?: boolean }) {
  // a drink is served as a glass, without a plate under it
  const base = bare || (look === "drink" && stage === "plate") ? null : stage === "raw" ? <BoardBase /> : stage === "pan" ? <PanBase /> : <PlateBase />;
  return (
    <group>
      {base}
      <group position={[0, base ? DISH_BASE_TOP[stage] : 0, 0]}>{FOOD[stage](look)}</group>
    </group>
  );
}
