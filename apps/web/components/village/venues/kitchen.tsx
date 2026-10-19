"use client";

/**
 * The open-air kitchen: a tiled cooking floor under a slatted pergola, the
 * prep island with 4 cutting boards (KITCHEN.stations), the range behind it
 * with 4 burners and pans, a tiled backsplash with a spice shelf, a pizza oven
 * on the west (KITCHEN.oven), a fridge, herb troughs, and the long shared table
 * (KITCHEN.table) with a bench on each side for the 8 seats. The path comes in
 * from +z (x ≈ 0) and stays clear.
 *
 * KitchenStatic goes in the StaticBatch. KitchenLive reads `sim.kitchenState()`
 * (missing → nothing cooks): the raw dish on board i while counters[i] is set,
 * the dish in pan i with a flame and rising steam while stoves[i] is set. It
 * only polls and animates while the kitchen is on screen.
 */
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import type { DishLook } from "@aivillage/shared";
import { KITCHEN, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, flatSlab, glass, glow, roundedRectAt, solid, unit } from "../materials";
import { Ball, Box, Cyl, Ico, RBox, type V3 } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { DISH_BASE_TOP, DishModel, PanBase, PlateBase } from "../dishes";
import { StringLights, VenuePad } from "./common";
import { onScreen, type PlacesSim } from "./visibility";
import {
  BOARD_Z, BURNER_Z, KITCHEN_FLOOR, KITCHEN_PERGOLA, KITCHEN_TOP, TABLE_TOP, copySlots, kitchenProp, steamPuff
} from "./placeProps";

const ZONE = "kitchen";
const FRAME = "#2a3550";
const CABINET = "#fbf7f0";
const DOOR = "#a8d5c2";
const STEEL = "#dfe6ef";
const WOOD = P.wood;
/** Grate height on top of the range: pans stand on it. */
const GRATE = 0.006;
/** Pans turn their handles toward the cook (+z), a little to the right. */
const PAN_YAW = -Math.PI / 2 + 0.5;
const accent = () => ZONE_ACCENT[ZONE] ?? P.accent;

// ---------------- static parts ----------------

function Floor() {
  const F = KITCHEN_FLOOR;
  const geo = useMemo(() => flatSlab(`kitchen-floor:${F.w}:${F.d}`, roundedRectAt(F.x, F.z, F.w, F.d, F.r) as THREE.Shape, 0.008), [F.x, F.z, F.w, F.d, F.r]);
  const grout = solid("#e2c3a6", 0.95);
  const lines: { size: V3; p: V3 }[] = [];
  for (let x = F.x - F.w / 2 + 0.45; x < F.x + F.w / 2 - 0.3; x += 0.45) lines.push({ size: [0.012, 0.002, F.d - 0.24], p: [x, PAD_TOP + 0.009, F.z] });
  for (let z = F.z - F.d / 2 + 0.4; z < F.z + F.d / 2 - 0.25; z += 0.45) lines.push({ size: [F.w - 0.3, 0.002, 0.012], p: [F.x, PAD_TOP + 0.009, z] });
  return (
    <group>
      <mesh geometry={geo} position={[0, PAD_TOP, 0]} material={solid("#f3dfca", 0.95)} receiveShadow />
      {lines.map((l, i) => <Box key={i} size={l.size} p={l.p} m={grout} cast={false} />)}
    </group>
  );
}

/** The prep island: cabinets, a butcher-block top, a cutting board + knife at each station, bowls between. */
function Island() {
  const I = KITCHEN.island;
  const top = KITCHEN_TOP;
  return (
    <group position={[I.x, PAD_TOP, I.z]}>
      <Box size={[I.w - 0.06, 0.04, I.d - 0.06]} p={[0, 0.02, 0]} m={solid(FRAME, 0.7)} />
      <RBox size={[I.w, top - 0.07, I.d]} radius={0.02} p={[0, 0.035 + (top - 0.07) / 2, 0]} m={solid(CABINET, 0.85)} />
      <RBox size={[I.w + 0.05, 0.035, I.d + 0.05]} radius={0.01} p={[0, top - 0.0175, 0]} m={solid(WOOD, 0.75)} />
      {/* cabinet doors on the cook's side (+z) */}
      {KITCHEN.stations.map((x) => (
        <group key={x} position={[x - I.x, 0, I.d / 2 + 0.003]}>
          <Box size={[0.3, top - 0.13, 0.008]} p={[0, 0.07 + (top - 0.13) / 2, 0]} m={solid(DOOR, 0.8)} cast={false} />
          <Box size={[0.08, 0.012, 0.012]} p={[0, top - 0.09, 0.008]} m={solid(FRAME, 0.4)} cast={false} />
        </group>
      ))}
      {/* boards (the live dish sits on them) and knives */}
      {KITCHEN.stations.map((x) => (
        <group key={`b${x}`} position={[x - I.x, top, BOARD_Z - I.z]}>
          <RBox size={[0.2, 0.012, 0.13]} radius={0.004} p={[0, 0.006, 0]} m={solid("#d9b48a", 0.8)} cast={false} />
          <Box size={[0.075, 0.003, 0.014]} p={[0.135, 0.002, 0.02]} r={[0, 0.25, 0]} m={solid(STEEL, 0.3)} cast={false} />
          <RBox size={[0.04, 0.01, 0.016]} radius={0.004} p={[0.135 - 0.05, 0.005, 0.033]} r={[0, 0.25, 0]} m={solid(FRAME, 0.6)} cast={false} />
        </group>
      ))}
      {/* between the stations: a fruit bowl, a herb pot, oil and a bowl of tomatoes */}
      <group position={[0, top, -0.02]}>
        <mesh geometry={cachedGeo("kitchen:bowl", () => new THREE.CylinderGeometry(1, 0.6, 1, 14))} position={[0, 0.025, 0]} scale={[0.09, 0.05, 0.09]} material={solid(P.white, 0.5)} castShadow />
        <Ball rad={0.03} p={[-0.03, 0.06, 0]} m={solid("#ff9a2e", 0.7)} cast={false} low />
        <Ball rad={0.028} p={[0.03, 0.06, 0.015]} m={solid("#e8473f", 0.7)} cast={false} low />
        <Ball rad={0.026} p={[0.005, 0.065, -0.03]} m={solid("#7cc451", 0.7)} cast={false} low />
      </group>
      <group position={[-0.75, top, -0.05]}>
        <Cyl rad={0.045} h={0.07} p={[0, 0.035, 0]} m={solid("#e4a07a", 0.8)} />
        <Ico rad={0.06} p={[0, 0.1, 0]} m={solid(P.foliage, 0.9, true)} />
        <Ico rad={0.04} p={[0.03, 0.14, 0.01]} m={solid(P.foliageDark, 0.9, true)} />
      </group>
      <group position={[0.75, top, -0.05]}>
        <Cyl rad={0.02} h={0.12} p={[-0.05, 0.06, 0]} m={glass("#c9b45a", 0.7)} cast={false} />
        <Cyl rad={0.008} h={0.03} p={[-0.05, 0.135, 0]} m={solid(FRAME, 0.6)} cast={false} />
        <mesh geometry={cachedGeo("kitchen:bowl", () => new THREE.CylinderGeometry(1, 0.6, 1, 14))} position={[0.04, 0.02, 0]} scale={[0.06, 0.04, 0.06]} material={solid(DOOR, 0.6)} castShadow />
        {[-0.02, 0.02, 0].map((dx, i) => <Ball key={i} rad={0.018} p={[0.04 + dx, 0.045 + (i === 2 ? 0.015 : 0), i === 2 ? 0 : 0.01]} m={solid("#e8473f", 0.6)} cast={false} low />)}
      </group>
    </group>
  );
}

/** One hanging utensil on the rail (ladle, spatula or whisk), hooked at the origin. */
function Utensil({ kind }: { kind: 0 | 1 | 2 }) {
  const steel = solid(STEEL, 0.3);
  return (
    <group>
      <Cyl rad={0.004} h={0.11} p={[0, -0.06, 0]} m={steel} cast={false} low />
      {kind === 0 && <Ball rad={0.022} p={[0, -0.12, 0.006]} scale={[1, 0.6, 1]} m={steel} cast={false} low />}
      {kind === 1 && <Box size={[0.04, 0.05, 0.004]} p={[0, -0.135, 0]} m={solid(FRAME, 0.6)} cast={false} />}
      {kind === 2 && <Ball rad={0.018} p={[0, -0.13, 0]} scale={[1, 1.6, 1]} m={steel} cast={false} low />}
    </group>
  );
}

/** The range: 4 burners with pans, knobs, oven doors, a tiled backsplash, a spice shelf and a utensil rail. */
function Range() {
  const R = KITCHEN.range;
  const top = KITCHEN_TOP;
  const back = -R.d / 2;
  const jars = ["#e8473f", "#ffd27a", "#7cc451", "#a07c58", "#ff9a2e", "#f2efe6", "#c98bd1", "#e2574c"];
  return (
    <group position={[R.x, PAD_TOP, R.z]}>
      <RBox size={[R.w, top - 0.02, R.d]} radius={0.02} p={[0, (top - 0.02) / 2, 0]} m={solid(STEEL, 0.45)} />
      <Box size={[R.w + 0.02, 0.02, R.d + 0.02]} p={[0, top - 0.01, 0]} m={solid("#2a3550", 0.5)} />
      {KITCHEN.stations.map((x) => (
        <group key={x} position={[x - R.x, 0, 0]}>
          {/* burner ring + grate; the pan stands on the grate */}
          <group position={[0, top, BURNER_Z - R.z]}>
            <Cyl rad={0.06} h={0.004} p={[0, 0.002, 0]} m={solid("#1b2433", 0.6)} cast={false} />
            <Box size={[0.13, GRATE, 0.01]} p={[0, GRATE / 2, 0]} m={solid("#1b2433", 0.5)} cast={false} />
            <Box size={[0.01, GRATE, 0.13]} p={[0, GRATE / 2, 0]} m={solid("#1b2433", 0.5)} cast={false} />
            <group position={[0, GRATE, 0]} rotation={[0, PAN_YAW, 0]}>
              <PanBase />
            </group>
          </group>
          {/* knob and an oven door under each burner */}
          <Cyl rad={0.016} h={0.016} p={[0, top - 0.06, R.d / 2 + 0.006]} r={[Math.PI / 2, 0, 0]} m={solid(FRAME, 0.5)} cast={false} />
          <Box size={[0.5, 0.15, 0.008]} p={[0, 0.12, R.d / 2 + 0.003]} m={solid("#c9d3df", 0.4)} cast={false} />
          <Box size={[0.3, 0.07, 0.006]} p={[0, 0.13, R.d / 2 + 0.008]} m={solid("#3a4558", 0.3)} cast={false} />
          <Box size={[0.22, 0.012, 0.014]} p={[0, 0.22, R.d / 2 + 0.012]} m={solid(FRAME, 0.4)} cast={false} />
        </group>
      ))}
      {/* tiled backsplash with a shelf of jars and a rail of utensils */}
      <Box size={[R.w, 0.44, 0.03]} p={[0, top + 0.22, back - 0.015]} m={solid("#d8efe9", 0.6)} />
      {[0.11, 0.22, 0.33].map((y) => <Box key={y} size={[R.w - 0.02, 0.006, 0.006]} p={[0, top + y, back + 0.001]} m={solid(P.white, 0.6)} cast={false} />)}
      <Box size={[R.w, 0.04, 0.02]} p={[0, top + 0.45, back - 0.015]} m={solid(accent(), 0.6)} />
      <RBox size={[R.w * 0.86, 0.022, 0.1]} radius={0.008} p={[0, top + 0.36, back + 0.05]} m={solid(WOOD, 0.75)} />
      {jars.map((c, i) => {
        const x = -R.w * 0.4 + (i + 0.5) * ((R.w * 0.8) / jars.length);
        return (
          <group key={i} position={[x, top + 0.371, back + 0.05]}>
            <Cyl rad={0.022} h={0.06} p={[0, 0.03, 0]} m={solid(c, 0.6)} cast={false} />
            <Cyl rad={0.024} h={0.014} p={[0, 0.067, 0]} m={solid(i % 2 ? WOOD : FRAME, 0.6)} cast={false} />
          </group>
        );
      })}
      <Cyl rad={0.006} h={R.w * 0.8} p={[0, top + 0.26, back + 0.02]} r={[0, 0, Math.PI / 2]} m={solid(STEEL, 0.3)} cast={false} low />
      {[-0.75, -0.62, 0, 0.62, 0.75].map((x, i) => (
        <group key={x} position={[x, top + 0.26, back + 0.025]}>
          <Utensil kind={(i % 3) as 0 | 1 | 2} />
        </group>
      ))}
    </group>
  );
}

/** Slatted pergola over the cooking area, with pendant lamps over the island and a few vines. */
function Pergola() {
  const G = KITCHEN_PERGOLA;
  const frame = solid(FRAME, 0.5);
  const w = G.x1 - G.x0, d = G.z1 - G.z0;
  const cx = (G.x0 + G.x1) / 2, cz = (G.z0 + G.z1) / 2;
  const slats: number[] = [];
  for (let z = G.z0 + 0.15; z < G.z1 - 0.05; z += 0.22) slats.push(z);
  const lampZ = KITCHEN.island.z;
  return (
    <group position={[0, PAD_TOP, 0]}>
      {[[G.x0, G.z0], [G.x1, G.z0], [G.x0, G.z1], [G.x1, G.z1]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <RBox size={[0.12, 0.05, 0.12]} radius={0.015} p={[x, 0.025, z]} m={frame} />
          <Box size={[0.06, G.y, 0.06]} p={[x, G.y / 2, z]} m={frame} />
        </group>
      ))}
      <Box size={[w + 0.1, 0.08, 0.07]} p={[cx, G.y, G.z0]} m={frame} />
      <Box size={[w + 0.1, 0.08, 0.07]} p={[cx, G.y, G.z1]} m={frame} />
      <Box size={[w + 0.12, 0.05, 0.015]} p={[cx, G.y + 0.005, G.z1 + 0.04]} m={solid(accent(), 0.6)} cast={false} />
      {[G.x0, G.x1].map((x) => <Box key={x} size={[0.07, 0.08, d]} p={[x, G.y, cz]} m={frame} />)}
      {slats.map((z) => <Box key={z} size={[w + 0.12, 0.05, 0.045]} p={[cx, G.y + 0.065, z]} m={solid(P.white, 0.6)} />)}
      <Box size={[w, 0.04, 0.04]} p={[cx, G.y - 0.03, lampZ]} m={frame} />
      {[-0.75, 0, 0.75].map((x) => (
        <group key={x} position={[x, 0, lampZ]}>
          <Cyl rad={0.004} h={0.4} p={[0, G.y - 0.25, 0]} m={frame} cast={false} low />
          <mesh geometry={unit.cone()} position={[0, G.y - 0.47, 0]} scale={[0.08, 0.08, 0.08]} material={solid(accent(), 0.6)} castShadow />
          <Ball rad={0.028} p={[0, G.y - 0.52, 0]} m={glow(P.lampGlow, 0.5, 2.6)} cast={false} low />
        </group>
      ))}
      {/* vines along the front beam and over the corners */}
      {[[G.x0 + 0.1, G.z1], [G.x0 + 0.45, G.z1], [G.x1 - 0.2, G.z1], [G.x1, G.z1 - 0.4], [G.x0, G.z0 + 0.5], [G.x1, G.z0 + 0.3]].map(([x, z], i) => (
        <Ico key={i} rad={0.09 + (i % 3) * 0.025} p={[x, G.y + 0.1, z]} r={[i, i * 0.7, 0]} m={solid(i % 2 ? P.foliage : P.foliageDark, 0.9, true)} scale={[1.4, 0.7, 1]} />
      ))}
    </group>
  );
}

/** A dome pizza oven on a stone base with a log niche; its mouth glows. */
function Oven() {
  const o = KITCHEN.oven;
  return (
    <group position={[o.x, PAD_TOP, o.z]} rotation={[0, Math.PI / 4, 0]}>
      <RBox size={[0.42, 0.26, 0.4]} radius={0.03} p={[0, 0.13, 0]} m={solid("#cfc6bb", 0.9)} />
      <Box size={[0.28, 0.1, 0.02]} p={[0, 0.08, 0.2]} m={solid("#2a1d17", 0.9)} cast={false} />
      {[[-0.06, 0.055], [0.06, 0.055], [0, 0.1]].map(([x, y]) => (
        <Cyl key={`${x}${y}`} rad={0.026} h={0.03} p={[x, y, 0.205]} r={[Math.PI / 2, 0, 0]} m={solid(P.woodDark, 0.8)} cast={false} low />
      ))}
      <mesh geometry={unit.dome()} position={[0, 0.26, 0]} scale={[0.19, 0.22, 0.19]} material={solid("#d9774f", 0.85)} castShadow receiveShadow />
      <RBox size={[0.13, 0.1, 0.06]} radius={0.02} p={[0, 0.31, 0.16]} m={solid("#b85f3d", 0.85)} />
      <Box size={[0.09, 0.07, 0.02]} p={[0, 0.305, 0.185]} m={solid("#2a1d17", 0.9)} cast={false} />
      <Box size={[0.07, 0.035, 0.012]} p={[0, 0.29, 0.192]} m={glow("#ff8a3d", 0.8, 2.6)} cast={false} />
      <Cyl rad={0.028} h={0.16} p={[-0.06, 0.48, -0.06]} m={solid("#3a4558", 0.6)} low />
    </group>
  );
}

function Fridge() {
  const f = kitchenProp("fridge");
  const front = 0.15;
  return (
    <group position={[f.x, PAD_TOP, f.z]} rotation={[0, Math.PI / 2, 0]}>
      <RBox size={[0.3, 0.62, 0.3]} radius={0.04} p={[0, 0.31, 0]} m={solid("#bfe8dc", 0.5)} />
      <Box size={[0.29, 0.008, 0.005]} p={[0, 0.42, front + 0.001]} m={solid("#8fc9b8", 0.6)} cast={false} />
      <Box size={[0.014, 0.12, 0.02]} p={[0.11, 0.52, front + 0.01]} m={solid(STEEL, 0.3)} cast={false} />
      <Box size={[0.014, 0.16, 0.02]} p={[0.11, 0.3, front + 0.01]} m={solid(STEEL, 0.3)} cast={false} />
      {[["#ff8fa3", -0.06, 0.5], ["#ffd27a", -0.02, 0.27], ["#2f6bff", -0.08, 0.2]].map(([c, x, y]) => (
        <Box key={c as string} size={[0.03, 0.03, 0.006]} p={[x as number, y as number, front + 0.003]} m={solid(c as string, 0.6)} cast={false} />
      ))}
    </group>
  );
}

/** Wooden trough of herbs, long side along local x. */
function HerbTrough({ id, yaw }: { id: string; yaw: number }) {
  const p = kitchenProp(id);
  const herbs = [P.foliage, P.foliageDark, "#8fd16a", P.foliage, "#5fa86a", P.foliageDark];
  return (
    <group position={[p.x, PAD_TOP, p.z]} rotation={[0, yaw, 0]}>
      <RBox size={[0.34, 0.14, 0.2]} radius={0.02} p={[0, 0.07, 0]} m={solid(WOOD, 0.8)} />
      <Box size={[0.3, 0.01, 0.16]} p={[0, 0.141, 0]} m={solid("#7a5b40", 0.95)} cast={false} />
      {herbs.map((c, i) => (
        <Ico key={i} rad={0.045 + (i % 2) * 0.012} p={[-0.12 + i * 0.048, 0.18 + (i % 3) * 0.015, (i % 2 ? 0.035 : -0.03)]} r={[i, i * 1.3, 0]} m={solid(c, 0.9, true)} />
      ))}
      <Ball rad={0.014} p={[0.1, 0.24, 0.02]} m={solid("#ffffff", 0.6)} cast={false} low />
      <Ball rad={0.014} p={[-0.06, 0.23, -0.04]} m={solid("#b9a5ff", 0.6)} cast={false} low />
    </group>
  );
}

/** A small lemon tree in a pot. */
function LemonTree() {
  const p = kitchenProp("pot-plant");
  return (
    <group position={[p.x, PAD_TOP, p.z]}>
      <Cyl rad={0.09} h={0.14} p={[0, 0.07, 0]} m={solid("#e4a07a", 0.8)} />
      <Cyl rad={0.012} h={0.2} p={[0, 0.22, 0]} m={solid(P.woodDark, 0.8)} low />
      <Ico rad={0.13} p={[0, 0.36, 0]} m={solid(P.foliage, 0.9, true)} />
      {[[0.08, 0.34, 0.07], [-0.09, 0.4, 0.03], [0.02, 0.3, -0.1], [0.05, 0.45, -0.05]].map(([x, y, z], i) => (
        <Ball key={i} rad={0.022} p={[x, y, z]} scale={[1, 0.85, 0.85]} m={solid("#ffe14d", 0.6)} cast={false} low />
      ))}
    </group>
  );
}

/** The long shared table with a bench on each side, a place setting at each of the 8 seats, a jug, bread and flowers. */
function LongTable() {
  const T = KITCHEN.table;
  const seatTop = SEAT_Y.table - PAD_TOP;
  const z0 = KITCHEN.seatsZ[0] - 0.18, z1 = KITCHEN.seatsZ[KITCHEN.seatsZ.length - 1] + 0.18;
  const benchLen = z1 - z0, benchZ = (z0 + z1) / 2;
  const wood = solid(WOOD, 0.75);
  const dark = solid(P.woodDark, 0.8);
  return (
    <group position={[0, PAD_TOP, 0]}>
      <group position={[T.x, 0, T.z]}>
        <RBox size={[T.w, 0.03, T.d]} radius={0.012} p={[0, TABLE_TOP - 0.015, 0]} m={wood} />
        {[-1, 1].map((s) => (
          <group key={s} position={[0, 0, s * (T.d / 2 - 0.15)]}>
            <Box size={[0.05, TABLE_TOP - 0.03, 0.05]} p={[-T.w / 2 + 0.07, (TABLE_TOP - 0.03) / 2, 0]} m={dark} />
            <Box size={[0.05, TABLE_TOP - 0.03, 0.05]} p={[T.w / 2 - 0.07, (TABLE_TOP - 0.03) / 2, 0]} m={dark} />
            <Box size={[T.w - 0.1, 0.03, 0.04]} p={[0, 0.08, 0]} m={dark} />
          </group>
        ))}
        {/* runner, jug, bread basket and a vase of flowers down the middle */}
        <Box size={[0.1, 0.003, T.d - 0.2]} p={[0, TABLE_TOP + 0.0015, 0]} m={solid("#f6e3b4", 0.9)} cast={false} />
        <group position={[0, TABLE_TOP, 0.0]}>
          <Cyl rad={0.03} h={0.1} p={[0, 0.05, 0]} m={glass("#dff4ff", 0.35)} cast={false} receive={false} />
          <Cyl rad={0.027} h={0.06} p={[0, 0.032, 0]} m={solid("#ffa733", 0.4)} cast={false} />
        </group>
        <group position={[0, TABLE_TOP, -0.45]}>
          <RBox size={[0.11, 0.035, 0.07]} radius={0.015} p={[0, 0.0175, 0]} m={solid(P.woodDark, 0.85)} />
          {[-0.025, 0.025].map((x) => <Ball key={x} rad={0.025} p={[x, 0.04, 0]} scale={[1.3, 0.7, 0.9]} m={solid("#e0a35a", 0.8)} cast={false} low />)}
        </group>
        <group position={[0, TABLE_TOP, 0.45]}>
          <Cyl rad={0.022} h={0.07} p={[0, 0.035, 0]} m={solid(accent(), 0.5)} cast={false} />
          {[["#ff8fa3", 0.02, 0], ["#ffd27a", -0.015, 0.012], ["#ffffff", 0, -0.018]].map(([c, x, z]) => (
            <Ball key={c as string} rad={0.018} p={[x as number, 0.095, z as number]} m={solid(c as string, 0.6)} cast={false} low />
          ))}
        </group>
      </group>
      {/* benches: seat tops at SEAT_Y.table, one on each side of the table */}
      {[-1, 1].map((s) => (
        <group key={s} position={[T.x + s * KITCHEN.seatOffset, 0, benchZ]}>
          <RBox size={[0.2, 0.035, benchLen]} radius={0.012} p={[0, seatTop - 0.0175, 0]} m={wood} />
          {[-1, 1].map((e) => (
            <Box key={e} size={[0.14, seatTop - 0.035, 0.04]} p={[0, (seatTop - 0.035) / 2, e * (benchLen / 2 - 0.12)]} m={dark} />
          ))}
        </group>
      ))}
      {/* a plate (with fork and knife) in front of every seat; the eater brings the dish in hand */}
      {KITCHEN.seatsZ.map((z) => [-1, 1].map((s) => (
        <group key={`${z}${s}`} position={[T.x + s * 0.13, TABLE_TOP, z]}>
          <group scale={0.8}><PlateBase /></group>
          <Box size={[0.008, 0.003, 0.06]} p={[0, 0.0015, -0.075]} m={solid(STEEL, 0.3)} cast={false} />
          <Box size={[0.008, 0.003, 0.065]} p={[0, 0.0015, 0.075]} m={solid(STEEL, 0.3)} cast={false} />
        </group>
      )))}
    </group>
  );
}

const POLE_H = 1.4;

/** Everything about the kitchen that never moves (goes in the StaticBatch). */
export function KitchenStatic() {
  const c = zoneCenter(ZONE);
  const G = KITCHEN_PERGOLA;
  const pole = kitchenProp("light-pole");
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={ZONE} color="#fbf3ea" />
      <Floor />
      <Island />
      <Range />
      <Pergola />
      <Oven />
      <Fridge />
      <HerbTrough id="herbs-east" yaw={Math.PI / 2} />
      <HerbTrough id="herbs-front" yaw={0} />
      <LemonTree />
      <LongTable />
      <group position={[pole.x, PAD_TOP, pole.z]}>
        <Cyl rad={0.02} h={POLE_H} p={[0, POLE_H / 2, 0]} m={solid(FRAME, 0.55)} low />
        <Ball rad={0.028} p={[0, POLE_H + 0.01, 0]} m={solid(FRAME, 0.55)} cast={false} low />
      </group>
      <StringLights a={{ x: G.x1, z: G.z1 }} b={pole} h={PAD_TOP + POLE_H - 0.02} n={10} sag={0.16} />
    </group>
  );
}

// ---------------- live parts ----------------

const PUFFS = 3;
const STOVES = KITCHEN.stations.length;

/** One shared material per puff phase (all pans steam in step), so a puff can fade without its own material. */
function steamMaterials(): THREE.MeshBasicMaterial[] {
  return Array.from({ length: PUFFS }, () => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false }));
}

/** Food on the boards and in the pans, flames and steam: follows `sim.kitchenState()` while on screen. */
export function KitchenLive({ sim }: { sim?: PlacesSim | null }) {
  const c = zoneCenter(ZONE);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(c.x, 0.5, c.z - 1.1), 1.9), [c.x, c.z]);
  const counters = useRef<(DishLook | null)[]>(Array.from({ length: STOVES }, () => null));
  const stoves = useRef<(DishLook | null)[]>(Array.from({ length: STOVES }, () => null));
  const [, setVersion] = useState(0);
  const lastPoll = useRef(-1);
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useMemo(steamMaterials, []);
  const flameGeo = cachedGeo("kitchen:flame", () => new THREE.TorusGeometry(0.078, 0.008, 5, 20).rotateX(Math.PI / 2)) // peeks out round the pan;

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    if (!onScreen(camera, t, sphere)) return;
    if (t - lastPoll.current >= 0.25 || t < lastPoll.current) {
      lastPoll.current = t;
      const ks = typeof sim?.kitchenState === "function" ? sim.kitchenState() : null;
      const a = copySlots(ks?.counters, counters.current);
      const b = copySlots(ks?.stoves, stoves.current);
      if (a || b) setVersion((v) => v + 1);
    }
    if (!stoves.current.some(Boolean)) return;
    for (let k = 0; k < PUFFS; k++) mats[k].opacity = steamPuff(t, k, PUFFS).o;
    for (let i = 0; i < STOVES; i++) {
      for (let k = 0; k < PUFFS; k++) {
        const m = puffs.current[i * PUFFS + k];
        if (!m) continue;
        const p = steamPuff(t + i * 0.37, k, PUFFS);
        m.position.set(p.dx, p.y, 0);
        m.scale.setScalar(p.s);
      }
    }
  });

  const top = PAD_TOP + KITCHEN_TOP;
  const panFloor = top + GRATE + DISH_BASE_TOP.pan;
  return (
    <group position={[c.x, 0, c.z]}>
      {counters.current.map((look, i) => look && (
        <group key={`c${i}`} position={[KITCHEN.stations[i], top + DISH_BASE_TOP.raw, BOARD_Z]}>
          <DishModel look={look} stage="raw" bare />
        </group>
      ))}
      {stoves.current.map((look, i) => look && (
        <group key={`s${i}`} position={[KITCHEN.stations[i], 0, BURNER_Z]}>
          <mesh geometry={flameGeo} position={[0, top + 0.004, 0]} material={glow("#ff7a3d", 1.4, 2.6)} />
          <group position={[0, panFloor, 0]}>
            <DishModel look={look} stage="pan" bare />
          </group>
          <group position={[0, panFloor + 0.03, 0]}>
            {Array.from({ length: PUFFS }, (_, k) => (
              <mesh
                key={k} ref={(m) => { puffs.current[i * PUFFS + k] = m; }}
                geometry={unit.ballLow()} material={mats[k]} scale={0.001} renderOrder={2}
              />
            ))}
          </group>
        </group>
      ))}
    </group>
  );
}
