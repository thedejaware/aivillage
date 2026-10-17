"use client";

/**
 * The open-air gym: a rubber floor under a slatted pergola (you see inside
 * from any angle) with a glass back wall; a treadmill at the treadmill station,
 * mats + dumbbell racks at the weight stations, a weight bench and a squat rack.
 */
import { GYM_STATIONS, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, glass, glow, roundedRectShape, flatSlab, solid } from "../materials";
import { Box, Cyl, RBox } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { VenuePad } from "./common";

const FLOOR = { x: 0, z: -0.5, w: 2.3, d: 1.5 };
const ROOF_Y = 1.5;
const FRAME = "#2a3550";
const RUBBER = "#5b6b84";

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

/** Slatted pergola roof on four posts + a glass back wall. */
function Pergola() {
  const frame = solid(FRAME, 0.5);
  const x0 = FLOOR.x - FLOOR.w / 2 + 0.06, x1 = FLOOR.x + FLOOR.w / 2 - 0.06;
  const z0 = FLOOR.z - FLOOR.d / 2 + 0.06, z1 = FLOOR.z + FLOOR.d / 2 - 0.06;
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
  const floor = flatSlab(`gym-floor:${FLOOR.w}:${FLOOR.d}`, roundedRectShape(FLOOR.w, FLOOR.d, 0.12), 0.006);
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#eef1f6" />
      <mesh geometry={floor} position={[FLOOR.x, PAD_TOP, FLOOR.z]} material={solid(RUBBER, 0.95)} receiveShadow />
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
      <WeightBench x={-0.4} z={-0.9} rot={0} />
      <SquatRack x={0.55} z={-1.0} />
      {/* water cooler + towel stack */}
      <group position={[1.0, PAD_TOP, -1.0]}>
        <RBox size={[0.14, 0.3, 0.14]} radius={0.02} p={[0, 0.15, 0]} m={solid(P.white, 0.6)} />
        <Cyl rad={0.06} h={0.14} p={[0, 0.37, 0]} m={glass("#6fd0f5", 0.7)} cast={false} />
      </group>
      <group position={[-0.92, PAD_TOP, -1.02]}>
        {[0, 1, 2].map((i) => <RBox key={i} size={[0.18, 0.035, 0.12]} radius={0.012} p={[0, 0.02 + i * 0.036, 0]} m={solid(i % 2 ? P.white : "#9fd6ff", 0.9)} />)}
      </group>
    </group>
  );
}
