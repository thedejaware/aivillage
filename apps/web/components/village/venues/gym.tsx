"use client";

/**
 * The open-air gym: a D-shaped rubber floor (fills the pad, flat side to the
 * street) and a slatted pergola with a glass back wall over the middle (you see
 * inside from any angle). Treadmills at the 2 treadmill stations, mats + dumbbell
 * racks at the 3 weight stations; the outer ones (left treadmill, right weights)
 * sit in the open. Extras: a weight bench, a squat rack, a water cooler, towels
 * and two planters — all kept ≥ 0.4 from every station and off the walk-in paths.
 */
import * as THREE from "three";
import { GYM_STATIONS, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, glass, glow, flatSlab, solid } from "../materials";
import { Ball, Box, Cyl, RBox } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { VenuePad } from "./common";

/** Rubber floor: a disc of radius r (inside the 2.0 pad) cut straight at z = front (the road side). */
const FLOOR = { r: 1.9, front: 0.62 };
/** Pergola posts (relative). A full-width roof can't fit the round pad, so it covers the middle;
 *  the back wall sits just behind the middle weight station's rack (z −1.49). */
const ROOF = { x0: -0.92, x1: 0.9, z0: -1.54, z1: 0.45 };
const ROOF_Y = 1.5;
const FRAME = "#2a3550";
const RUBBER = "#5b6b84";

/** Disc with its front (+z) cut off; shape y = world −z (flatSlab lays it flat). */
function floorShape(r: number, front: number): THREE.Shape {
  const xf = Math.sqrt(r * r - front * front);
  const a = -Math.asin(front / r);
  const s = new THREE.Shape();
  s.moveTo(-xf, -front);
  s.lineTo(xf, -front);
  s.absarc(0, 0, r, a, Math.PI - a, false);
  return s;
}

/** Treadmill centred on the station; belt top at SEAT_Y.treadmill, console in front (+z). */
function Treadmill({ x, z }: { x: number; z: number }) {
  const frame = solid(FRAME, 0.5);
  const beltTop = SEAT_Y.treadmill - PAD_TOP;
  return (
    <group position={[x, PAD_TOP, z]}>
      <RBox size={[0.34, beltTop - 0.012, 0.66]} radius={0.03} p={[0, (beltTop - 0.012) / 2, -0.02]} m={solid("#dfe6ef", 0.6)} />
      <Box size={[0.24, 0.012, 0.6]} p={[0, beltTop - 0.006, -0.02]} m={solid("#1b2433", 0.9)} cast={false} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Cyl rad={0.016} h={0.5} p={[s * 0.15, beltTop + 0.22, 0.28]} r={[-0.18, 0, 0]} m={frame} low />
          <Box size={[0.02, 0.02, 0.22]} p={[s * 0.15, beltTop + 0.36, 0.2]} m={frame} />
        </group>
      ))}
      <RBox size={[0.34, 0.12, 0.05]} radius={0.02} p={[0, beltTop + 0.48, 0.33]} r={[-0.5, 0, 0]} m={frame} />
      <Box size={[0.2, 0.06, 0.01]} p={[0, beltTop + 0.49, 0.305]} r={[-0.5, 0, 0]} m={glow("#7cf0c8", 0.6, 2.2)} cast={false} />
    </group>
  );
}

function Dumbbell({ p, r = 0 }: { p: [number, number, number]; r?: number }) {
  const iron = solid("#3a4558", 0.5);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <Cyl rad={0.008} h={0.12} p={[0, 0, 0]} r={[0, 0, Math.PI / 2]} m={solid(P.metal, 0.35)} low />
      <Cyl rad={0.024} h={0.03} p={[-0.05, 0, 0]} r={[0, 0, Math.PI / 2]} m={iron} low />
      <Cyl rad={0.024} h={0.03} p={[0.05, 0, 0]} r={[0, 0, Math.PI / 2]} m={iron} low />
    </group>
  );
}

/** Two-tier dumbbell rack (behind a weight station). */
function DumbbellRack({ x, z }: { x: number; z: number }) {
  const frame = solid(FRAME, 0.5);
  return (
    <group position={[x, PAD_TOP, z]}>
      {[-1, 1].map((s) => <Box key={s} size={[0.03, 0.3, 0.16]} p={[s * 0.2, 0.15, 0]} m={frame} />)}
      <Box size={[0.42, 0.02, 0.14]} p={[0, 0.14, 0.01]} r={[0.25, 0, 0]} m={frame} />
      <Box size={[0.42, 0.02, 0.14]} p={[0, 0.27, -0.01]} r={[0.25, 0, 0]} m={frame} />
      {[-0.12, 0, 0.12].map((dx) => <Dumbbell key={`a${dx}`} p={[dx, 0.17, 0.02]} />)}
      {[-0.12, 0, 0.12].map((dx) => <Dumbbell key={`b${dx}`} p={[dx, 0.3, 0]} />)}
    </group>
  );
}

/** Flat weight bench with a barbell on its uprights. */
function WeightBench({ x, z, rot }: { x: number; z: number; rot: number }) {
  const frame = solid(FRAME, 0.5);
  const pad = solid(ZONE_ACCENT.gym, 0.7);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, rot, 0]}>
      <RBox size={[0.16, 0.05, 0.5]} radius={0.02} p={[0, 0.2, 0]} m={pad} />
      <Box size={[0.04, 0.18, 0.04]} p={[0, 0.09, 0.17]} m={frame} />
      <Box size={[0.04, 0.18, 0.04]} p={[0, 0.09, -0.17]} m={frame} />
      {[-1, 1].map((s) => <Box key={s} size={[0.03, 0.42, 0.03]} p={[s * 0.16, 0.21, -0.2]} m={frame} />)}
      <Cyl rad={0.01} h={0.62} p={[0, 0.4, -0.2]} r={[0, 0, Math.PI / 2]} m={solid(P.metal, 0.35)} low />
      {[-1, 1].map((s) => <Cyl key={s} rad={0.07} h={0.03} p={[s * 0.26, 0.4, -0.2]} r={[0, 0, Math.PI / 2]} m={solid("#3a4558", 0.5)} />)}
    </group>
  );
}

function SquatRack({ x, z }: { x: number; z: number }) {
  const frame = solid(FRAME, 0.5);
  return (
    <group position={[x, PAD_TOP, z]}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <Box key={`${sx}${sz}`} size={[0.035, 1.0, 0.035]} p={[sx * 0.22, 0.5, sz * 0.14]} m={frame} />
      ))}
      <Box size={[0.48, 0.035, 0.035]} p={[0, 1.0, -0.14]} m={frame} />
      <Box size={[0.48, 0.035, 0.035]} p={[0, 1.0, 0.14]} m={frame} />
      <Cyl rad={0.01} h={0.7} p={[0, 0.62, 0.14]} r={[0, 0, Math.PI / 2]} m={solid(P.metal, 0.35)} low />
      {[-1, 1].map((s) => <Cyl key={s} rad={0.08} h={0.035} p={[s * 0.3, 0.62, 0.14]} r={[0, 0, Math.PI / 2]} m={solid(ZONE_ACCENT.gym, 0.6)} />)}
    </group>
  );
}

/** Planter box with a round shrub. */
function Planter({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, PAD_TOP, z]}>
      <RBox size={[0.18, 0.16, 0.18]} radius={0.02} p={[0, 0.08, 0]} m={solid(FRAME, 0.6)} />
      <Ball rad={0.13} p={[0, 0.26, 0]} m={solid(P.foliage, 0.9, true)} low />
      <Ball rad={0.08} p={[0.05, 0.36, -0.03]} m={solid(P.foliageDark, 0.9, true)} low />
    </group>
  );
}

/** Slatted pergola roof on four posts + a glass back wall. */
function Pergola() {
  const frame = solid(FRAME, 0.5);
  const { x0, x1, z0, z1 } = ROOF;
  const w = x1 - x0, d = z1 - z0;
  const slats: number[] = [];
  for (let x = x0 + 0.12; x < x1 - 0.05; x += 0.2) slats.push(x);
  return (
    <group position={[0, PAD_TOP, 0]}>
      {[[x0, z0], [x1, z0], [x0, z1], [x1, z1]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <RBox size={[0.12, 0.05, 0.12]} radius={0.015} p={[x, 0.025, z]} m={frame} />
          <Box size={[0.06, ROOF_Y, 0.06]} p={[x, ROOF_Y / 2, z]} m={frame} />
        </group>
      ))}
      <Box size={[w + 0.1, 0.08, 0.07]} p={[(x0 + x1) / 2, ROOF_Y, z0]} m={frame} />
      <Box size={[w + 0.1, 0.08, 0.07]} p={[(x0 + x1) / 2, ROOF_Y, z1]} m={frame} />
      <Box size={[w + 0.12, 0.05, 0.015]} p={[(x0 + x1) / 2, ROOF_Y + 0.005, z1 + 0.04]} m={solid(ZONE_ACCENT.gym, 0.6)} cast={false} />
      {[x0, x1].map((x) => <Box key={x} size={[0.07, 0.08, d]} p={[x, ROOF_Y, (z0 + z1) / 2]} m={frame} />)}
      {slats.map((x) => <Box key={x} size={[0.045, 0.05, d + 0.12]} p={[x, ROOF_Y + 0.065, (z0 + z1) / 2]} m={solid(P.white, 0.6)} />)}
      {/* glass back wall with mullions */}
      <Box size={[w - 0.06, ROOF_Y - 0.12, 0.02]} p={[(x0 + x1) / 2, (ROOF_Y - 0.12) / 2 + 0.06, z0]} m={glass("#bfe3ff", 0.28)} cast={false} receive={false} />
      {[-1 / 3, 1 / 3].map((f) => <Box key={f} size={[0.025, ROOF_Y, 0.03]} p={[(x0 + x1) / 2 + f * w, ROOF_Y / 2, z0]} m={frame} />)}
      <Box size={[w, 0.04, 0.04]} p={[(x0 + x1) / 2, 0.06, z0]} m={frame} />
    </group>
  );
}

export function Gym() {
  const zone = "gym";
  const c = zoneCenter(zone);
  const floor = flatSlab(`gym-floor:${FLOOR.r}:${FLOOR.front}`, floorShape(FLOOR.r, FLOOR.front), 0.006);
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#eef1f6" />
      <mesh geometry={floor} position={[0, PAD_TOP, 0]} material={solid(RUBBER, 0.95)} receiveShadow />
      <Pergola />
      {GYM_STATIONS.map((s, i) =>
        s.kind === "treadmill" ? (
          <Treadmill key={i} x={s.x} z={s.z} />
        ) : (
          <group key={i}>
            <Box size={[0.44, 0.008, 0.44]} p={[s.x, PAD_TOP + 0.007, s.z]} m={solid("#3a4558", 0.95)} cast={false} />
            <DumbbellRack x={s.x} z={s.z - 0.36} />
          </group>
        )
      )}
      {/* front-left, beside the walk-in road: bench along x (bar at its left end), squat rack facing the street */}
      <WeightBench x={-0.55} z={0.27} rot={Math.PI / 2} />
      <SquatRack x={-1.4} z={0.35} />
      {/* water cooler + towel stack by the glass wall, planters in the free corners */}
      <group position={[-0.15, PAD_TOP, -1.38]}>
        <RBox size={[0.14, 0.3, 0.14]} radius={0.02} p={[0, 0.15, 0]} m={solid(P.white, 0.6)} />
        <Cyl rad={0.06} h={0.14} p={[0, 0.37, 0]} m={glass("#6fd0f5", 0.7)} cast={false} />
      </group>
      <group position={[0.74, PAD_TOP, -1.34]}>
        {[0, 1, 2].map((i) => <RBox key={i} size={[0.18, 0.035, 0.12]} radius={0.012} p={[0, 0.02 + i * 0.036, 0]} m={solid(i % 2 ? P.white : "#9fd6ff", 0.9)} />)}
      </group>
      <Planter x={-1.15} z={-1.2} />
      <Planter x={1.62} z={-0.38} />
    </group>
  );
}
