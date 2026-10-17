"use client";

/**
 * The four original drama venues — café (upgraded: building + 3 tables × 2
 * chairs + kiosk), stage, lawn and quiet corner — at their Main Street spots.
 * Every chair, the bench and the blanket sit exactly on the layout's SPOTS.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { BENCH, BLANKET, CAFE_TABLES, SPOTS, STAGE_PLATFORM, zoneCenter, type Pt } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, beam, cachedGeo, decal, flatSlab, glow, solid } from "../materials";
import { Ball, Box, Cyl, FlowerBed, LampPost, ParkBench, RBox, Tree, type V3 } from "../parts";
import { GRASS_TOP, PAD_RADIUS, PAD_TOP, ROAD_W, STAGE_TOP, isClear, roadDist } from "../scenery";
import { CAFE_BUILDING } from "../decor";
import { Parasol, StringLights, VenuePad, circleShape, local } from "./common";

// ---------------- THE CAFÉ ----------------

/** Gable-roofed café facing +z: shop window, serving hatch under a striped awning, door, lantern. */
function CafeHouse({ p, w, d }: { p: V3; w: number; d: number }) {
  const h = 0.8;
  const roofH = 0.42;
  const slope = Math.atan2(roofH, d / 2 + 0.08);
  const slabLen = Math.hypot(roofH, d / 2 + 0.08) + 0.05;
  const gable = cachedGeo(`cafe-gable:${w}:${d}`, () => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(0, roofH * (d / 2) / (d / 2 + 0.08));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - 0.04, bevelEnabled: false });
    g.translate(0, 0, -(w - 0.04) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
  const wall = solid(P.cafeWall, 0.9);
  const roof = solid(P.cafeRoof, 0.7);
  const wood = solid(P.wood, 0.75);
  const win = glow(P.lampGlow, 0.5, 2.2);
  const fz = d / 2;
  return (
    <group position={p}>
      <RBox size={[w + 0.06, 0.08, d + 0.06]} radius={0.025} p={[0, 0.04, 0]} m={solid("#f1e3d3")} />
      <RBox size={[w, h, d]} radius={0.05} p={[0, h / 2, 0]} m={wall} />
      <mesh geometry={gable} position={[0, h - 0.01, 0]} material={wall} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <RBox key={s} size={[w + 0.16, 0.06, slabLen]} radius={0.025} p={[0, h + roofH / 2 + 0.02, s * (d / 4 + 0.03)]} r={[s * slope, 0, 0]} m={roof} />
      ))}
      <RBox size={[w + 0.18, 0.06, 0.08]} radius={0.03} p={[0, h + roofH + 0.03, 0]} m={solid("#f07a57", 0.7)} />
      <RBox size={[0.13, 0.26, 0.13]} radius={0.025} p={[w * 0.3, h + roofH + 0.02, -0.12]} m={solid("#efe0d0")} />
      {/* big coffee cup sign on the ridge */}
      <group position={[-w * 0.18, h + roofH + 0.1, 0]}>
        <Cyl rad={0.1} h={0.13} p={[0, 0.065, 0]} m={solid(P.white, 0.5)} />
        <Cyl rad={0.085} h={0.01} p={[0, 0.131, 0]} m={solid("#8a5a3a", 0.5)} cast={false} />
        <mesh geometry={cachedGeo("cup-handle", () => new THREE.TorusGeometry(0.04, 0.012, 6, 12))} position={[0.1, 0.07, 0]} material={solid(P.white, 0.5)} castShadow />
        {[-0.03, 0.03].map((x) => <Ball key={x} rad={0.02} p={[x, 0.2 + Math.abs(x), 0]} m={solid(P.white, 0.9)} cast={false} low />)}
      </group>
      {/* front: shop window (left), serving hatch (right) under a long awning, door between */}
      <RBox size={[0.36, 0.3, 0.03]} radius={0.012} p={[-0.3, 0.44, fz + 0.005]} m={solid(P.white, 0.6)} />
      <Box size={[0.29, 0.23, 0.02]} p={[-0.3, 0.44, fz + 0.018]} m={win} cast={false} />
      <Box size={[0.012, 0.23, 0.022]} p={[-0.3, 0.44, fz + 0.024]} m={solid(P.white, 0.6)} cast={false} />
      <Box size={[0.3, 0.2, 0.02]} p={[0.3, 0.46, fz + 0.012]} m={win} cast={false} />
      <RBox size={[0.4, 0.05, 0.14]} radius={0.015} p={[0.3, 0.34, fz + 0.06]} m={wood} />
      <Cyl rad={0.022} h={0.06} p={[0.22, 0.395, fz + 0.07]} m={solid(P.white, 0.4)} />
      <Cyl rad={0.022} h={0.06} p={[0.36, 0.395, fz + 0.06]} m={solid(P.white, 0.4)} />
      <group position={[0, 0.7, fz + 0.1]} rotation={[0.5, 0, 0]}>
        {Array.from({ length: 10 }, (_, i) => (
          <Box key={i} size={[w / 10 + 0.002, 0.012, 0.24]} p={[-w / 2 + (i + 0.5) * (w / 10), 0, 0]} m={solid(i % 2 ? P.white : P.cafeRoof, 0.7)} />
        ))}
      </group>
      <RBox size={[0.18, 0.36, 0.04]} radius={0.015} p={[0.02, 0.2, fz + 0.01]} m={wood} />
      <Ball rad={0.012} p={[0.08, 0.2, fz + 0.035]} m={solid(P.stage, 0.4)} cast={false} low />
      <Box size={[0.02, 0.02, 0.08]} p={[-w / 2 + 0.04, 0.6, fz + 0.03]} m={solid(P.deepBlue, 0.5)} />
      <Ball rad={0.045} p={[-w / 2 + 0.04, 0.55, fz + 0.07]} m={glow(P.lampGlow, 0.5, 2.6)} cast={false} />
      <RBox size={[0.34, 0.07, 0.08]} radius={0.02} p={[-0.3, 0.26, fz + 0.05]} m={wood} />
      {[-0.12, -0.04, 0.04, 0.12].map((x, i) => (
        <Ball key={x} rad={0.032} p={[-0.3 + x, 0.32, fz + 0.05]} m={solid(i % 2 ? P.blanket : P.foliage, 0.8)} low />
      ))}
    </group>
  );
}

/** Table with a cup and a plate (with cake) in front of each of its two chairs. */
function CafeTable({ x, z }: { x: number; z: number }) {
  const metal = solid(P.metal, 0.5);
  return (
    <group position={[x, PAD_TOP, z]}>
      <Cyl rad={0.09} h={0.02} p={[0, 0.01, 0]} m={metal} />
      <Cyl rad={0.022} h={0.3} p={[0, 0.16, 0]} m={metal} low />
      <Cyl rad={0.21} h={0.035} p={[0, 0.32, 0]} m={solid(P.white, 0.55)} />
      <Cyl rad={0.215} h={0.012} p={[0, 0.302, 0]} m={solid(P.wood, 0.7)} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <group position={[s * 0.1, 0.338, 0.07 * s]}>
            <Cyl rad={0.034} h={0.006} p={[0, 0.003, 0]} m={solid(P.white, 0.4)} cast={false} />
            <Cyl rad={0.024} h={0.045} p={[0, 0.028, 0]} m={solid(P.white, 0.4)} />
            <Cyl rad={0.02} h={0.004} p={[0, 0.051, 0]} m={solid("#8a5a3a", 0.5)} cast={false} />
          </group>
          <group position={[s * 0.11, 0.338, -0.08 * s]}>
            <Cyl rad={0.05} h={0.008} p={[0, 0.004, 0]} m={solid("#dff1ff", 0.4)} cast={false} />
            <RBox size={[0.05, 0.035, 0.04]} radius={0.01} p={[0, 0.026, 0]} m={solid("#ffd3dc", 0.7)} cast={false} />
            <Ball rad={0.011} p={[0, 0.05, 0]} m={solid("#ff5f7e", 0.5)} cast={false} low />
          </group>
        </group>
      ))}
    </group>
  );
}

/** Café chair at a coffee SPOT; backrest behind the sitter, facing the table. Seat top = SEAT_Y.coffee. */
function CafeChair({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const frame = solid(P.deepBlue, 0.55);
  const seat = solid(P.cafeRoof, 0.7);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, yaw, 0]}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <Cyl key={`${sx}${sz}`} rad={0.011} h={0.22} p={[sx * 0.075, 0.11, sz * 0.075]} m={frame} low />
      ))}
      <RBox size={[0.2, 0.035, 0.2]} radius={0.014} p={[0, 0.222, 0]} m={seat} />
      <RBox size={[0.2, 0.15, 0.03]} radius={0.014} p={[0, 0.34, -0.095]} r={[-0.1, 0, 0]} m={seat} />
      <Box size={[0.016, 0.14, 0.016]} p={[-0.08, 0.3, -0.095]} m={frame} />
      <Box size={[0.016, 0.14, 0.016]} p={[0.08, 0.3, -0.095]} m={frame} />
    </group>
  );
}

/** Little coffee kiosk with its own parasol (the terrace stays open so twins read from above). */
function Kiosk({ x, z }: { x: number; z: number }) {
  const wood = solid(P.wood, 0.75);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, -0.6, 0]}>
      <RBox size={[0.42, 0.3, 0.24]} radius={0.03} p={[0, 0.15, 0]} m={solid(P.cafeWall, 0.85)} />
      <RBox size={[0.46, 0.03, 0.28]} radius={0.012} p={[0, 0.315, 0]} m={wood} />
      {[-0.13, 0, 0.13].map((dx, i) => (
        <Box key={dx} size={[0.12, 0.2, 0.01]} p={[dx, 0.15, 0.121]} m={solid(i % 2 ? P.white : P.cafeRoof, 0.7)} cast={false} />
      ))}
      <Cyl rad={0.035} h={0.09} p={[-0.1, 0.375, 0]} m={solid(P.metal, 0.35)} />
      <Cyl rad={0.022} h={0.05} p={[0.08, 0.355, 0.03]} m={solid(P.white, 0.4)} />
      <Parasol x={0.05} z={-0.05} y={0} h={0.95} r={0.34} a={P.white} b={P.cafeRoof} />
    </group>
  );
}

/** A-frame chalk menu board. */
function MenuBoard({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  const wood = solid(P.woodDark, 0.8);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, yaw, 0]}>
      {[-1, 1].map((s) => (
        <group key={s} rotation={[s * 0.22, 0, 0]} position={[0, 0, 0]}>
          <RBox size={[0.2, 0.3, 0.02]} radius={0.008} p={[0, 0.15, s * 0.035]} m={wood} />
          <Box size={[0.16, 0.24, 0.006]} p={[0, 0.16, s * 0.047]} m={solid("#2a3550", 0.9)} cast={false} />
          <Box size={[0.1, 0.012, 0.004]} p={[0, 0.22, s * 0.051]} m={solid(P.white, 0.9)} cast={false} />
          <Box size={[0.08, 0.012, 0.004]} p={[0, 0.17, s * 0.051]} m={solid(P.stage, 0.9)} cast={false} />
          <Box size={[0.11, 0.012, 0.004]} p={[0, 0.12, s * 0.051]} m={solid(P.white, 0.9)} cast={false} />
        </group>
      ))}
    </group>
  );
}

const CAFE_POLES: Pt[] = [{ x: -1.32, z: 0.98 }, { x: 1.32, z: 0.98 }];

export function Cafe() {
  const zone = "maker_space";
  const c = zoneCenter(zone);
  const chairs = SPOTS.filter((s) => s.zone === zone && s.kind === "coffee").map((s) => ({ ...local(zone, s), yaw: s.yaw, id: s.id }));
  const B = CAFE_BUILDING;
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#fbf1e6" />
      <CafeHouse p={[B.x, PAD_TOP, B.z]} w={B.w} d={B.d} />
      {CAFE_TABLES.map((t, i) => <CafeTable key={i} x={t.x} z={t.z} />)}
      {chairs.map((ch) => <CafeChair key={ch.id} x={ch.x} z={ch.z} yaw={ch.yaw} />)}
      <Kiosk x={0.95} z={-0.75} />
      <MenuBoard x={0.38} z={-1.05} yaw={0.5} />
      <FlowerBed x={1.3} z={-0.2} w={0.32} d={0.32} seed={11} rot={-0.5} />
      {CAFE_POLES.map((p, i) => (
        <group key={i} position={[p.x, PAD_TOP, p.z]}>
          <Cyl rad={0.02} h={1.3} p={[0, 0.65, 0]} m={solid(P.deepBlue, 0.55)} low />
          <Ball rad={0.028} p={[0, 1.31, 0]} m={solid(P.deepBlue, 0.55)} cast={false} low />
        </group>
      ))}
      <StringLights a={{ x: B.x - B.w / 2 + 0.05, z: B.z + B.d / 2 }} b={CAFE_POLES[0]} h={PAD_TOP + 1.28} sag={0.1} />
      <StringLights a={{ x: B.x + B.w / 2 - 0.05, z: B.z + B.d / 2 }} b={CAFE_POLES[1]} h={PAD_TOP + 1.28} sag={0.12} />
      <StringLights a={CAFE_POLES[0]} b={CAFE_POLES[1]} h={PAD_TOP + 1.28} n={10} sag={0.12} />
    </group>
  );
}

// ---------------- THE STAGE ----------------

function StageBeam({ from, to }: { from: V3; to: V3 }) {
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const dir = a.clone().sub(b);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: a.add(b).multiplyScalar(0.5), quat, len };
  }, [from, to]);
  const geo = cachedGeo("beam", () => new THREE.ConeGeometry(1, 1, 24, 1, true));
  return <mesh geometry={geo} position={pos} quaternion={quat} scale={[0.3, len, 0.3]} material={beam(P.lampGlow)} />;
}

export const STAGE_MARK: Pt = { x: 0, z: 0.25 };
const TRUSS_BACK: Pt = { x: -0.35, z: -0.35 };
const TRUSS_HALF = 0.9;
const TRUSS_Y = 1.72;

export function stageMark(): Pt {
  const sp = SPOTS.find((s) => s.kind === "stage");
  return sp ? local("plaza", sp) : STAGE_MARK;
}

export function Stage() {
  const zone = "plaza";
  const c = zoneCenter(zone);
  const mark = stageMark();
  const r = STAGE_PLATFORM.radius;
  const ux = Math.SQRT1_2, uz = -Math.SQRT1_2; // truss runs across the performer's facing
  const truss = solid(P.deepBlue, 0.5);
  const poles: Pt[] = [-1, 1].map((s) => ({ x: TRUSS_BACK.x + s * TRUSS_HALF * ux, z: TRUSS_BACK.z + s * TRUSS_HALF * uz }));
  const spots = [-0.6, 0, 0.6].map((f) => ({ x: TRUSS_BACK.x + f * TRUSS_HALF * ux, z: TRUSS_BACK.z + f * TRUSS_HALF * uz }));
  const markGeo = cachedGeo("stage-mark", () => new THREE.RingGeometry(0.16, 0.2, 40).rotateX(-Math.PI / 2));
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color={P.pad} />
      <group position={[STAGE_PLATFORM.x, 0, STAGE_PLATFORM.z]}>
        <mesh geometry={cachedGeo("stage-rim", () => new THREE.CylinderGeometry(r + 0.03, r + 0.05, STAGE_TOP - 0.025, 48).translate(0, (STAGE_TOP - 0.025) / 2, 0))} material={solid(P.stageRim, 0.7)} castShadow receiveShadow />
        <mesh geometry={cachedGeo("stage-top", () => new THREE.CylinderGeometry(r - 0.05, r - 0.02, STAGE_TOP, 48).translate(0, STAGE_TOP / 2, 0))} material={solid(P.stage, 0.65)} castShadow receiveShadow />
        {[20, 45, 70].map((deg) => {
          const a = (deg * Math.PI) / 180;
          return <Ball key={deg} rad={0.035} p={[Math.cos(a) * (r - 0.12), STAGE_TOP + 0.01, Math.sin(a) * (r - 0.12)]} m={glow(P.lampGlow, 0.6, 2.4)} cast={false} />;
        })}
      </group>
      <mesh geometry={markGeo} material={decal(P.white, 0.85)} position={[mark.x, STAGE_TOP + 0.002, mark.z]} />
      {poles.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]}>
          <RBox size={[0.16, 0.06, 0.16]} radius={0.02} p={[0, 0.03, 0]} m={truss} />
          <Cyl rad={0.035} h={TRUSS_Y} p={[0, TRUSS_Y / 2, 0]} m={truss} low />
          <RBox size={[0.2, 0.3, 0.17]} radius={0.04} p={[(0 - p.x) * 0.18, 0.15, (0 - p.z) * 0.18]} r={[0, Math.PI / 4, 0]} m={solid("#2a3550", 0.6)} />
        </group>
      ))}
      <Box size={[TRUSS_HALF * 2 + 0.1, 0.07, 0.07]} p={[TRUSS_BACK.x, TRUSS_Y, TRUSS_BACK.z]} r={[0, Math.PI / 4, 0]} m={truss} />
      {spots.map((s, i) => (
        <group key={i}>
          <Cyl rad={0.05} h={0.12} p={[s.x, TRUSS_Y - 0.08, s.z]} m={truss} />
          <Ball rad={0.042} p={[s.x, TRUSS_Y - 0.15, s.z]} m={glow(P.lampGlow, 0.7, 2.8)} cast={false} />
          <StageBeam from={[s.x, TRUSS_Y - 0.15, s.z]} to={[mark.x, STAGE_TOP, mark.z]} />
        </group>
      ))}
    </group>
  );
}

// ---------------- THE LAWN ----------------

const LAWN_POLES: Pt[] = [{ x: -0.75, z: 1.05 }, { x: 1.25, z: 0.75 }, { x: 1.0, z: -1.0 }];
const LAWN_TREES: [number, number, number][] = [[1.35, -0.25, 1], [0.35, 1.35, 0.9]];

export function Lawn() {
  const zone = "event_space";
  const c = zoneCenter(zone);
  const r = PAD_RADIUS[zone];
  const lawnGeo = cachedGeo(`lawn:${r}`, () => flatSlab(`lawn-shape:${r}`, circleShape(r), GRASS_TOP));
  const ringGeo = cachedGeo(`lawn-ring:${r}`, () => new THREE.RingGeometry(r - 0.07, r - 0.03, 64).rotateX(-Math.PI / 2));
  const free = (p: Pt, m: number) =>
    roadDist({ x: p.x + c.x, z: p.z + c.z }) > ROAD_W / 2 + m &&
    !SPOTS.some((s) => s.zone === zone && Math.hypot(s.x - c.x - p.x, s.z - c.z - p.z) < 0.35);
  const trees = LAWN_TREES.filter(([x, z]) => free({ x, z }, 0.3));
  const poles = LAWN_POLES.filter((p) => free(p, 0.06));
  const stripes = [-0.24, 0, 0.24];
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh geometry={lawnGeo} material={solid(P.grassDark, 0.95)} receiveShadow />
      <mesh geometry={ringGeo} material={decal(ZONE_ACCENT[zone], 0.55)} position={[0, GRASS_TOP + 0.003, 0]} />
      <group position={[BLANKET.x, GRASS_TOP, BLANKET.z]}>
        <RBox size={[BLANKET.w, 0.02, BLANKET.d]} radius={0.008} p={[0, 0.01, 0]} m={solid(P.blanket, 0.95)} cast={false} />
        {stripes.map((s) => (
          <Box key={`x${s}`} size={[BLANKET.w - 0.02, 0.003, 0.06]} p={[0, 0.021, s * (BLANKET.d / BLANKET.w)]} m={solid("#ffd3dc", 0.95)} cast={false} />
        ))}
        {stripes.map((s) => (
          <Box key={`z${s}`} size={[0.06, 0.0035, BLANKET.d - 0.02]} p={[s, 0.021, 0]} m={solid("#ffd3dc", 0.95)} cast={false} />
        ))}
        <group position={[0.31, 0.02, 0.22]} rotation={[0, 0.4, 0]}>
          <RBox size={[0.15, 0.09, 0.1]} radius={0.02} p={[0, 0.045, 0]} m={solid(P.wood, 0.8)} />
          <mesh geometry={cachedGeo("basket-handle", () => new THREE.TorusGeometry(0.05, 0.008, 6, 14, Math.PI))} position={[0, 0.09, 0]} material={solid(P.woodDark, 0.8)} castShadow />
        </group>
      </group>
      {trees.map(([x, z, s], i) => <Tree key={i} x={x} z={z} y={GRASS_TOP} s={s} kind={i === 1 ? "pine" : "round"} rot={i * 1.7} />)}
      {poles.map((p, i) => (
        <group key={i} position={[p.x, GRASS_TOP, p.z]}>
          <Cyl rad={0.024} h={1.12} p={[0, 0.56, 0]} m={solid(P.wood, 0.75)} low />
          <Ball rad={0.03} p={[0, 1.13, 0]} m={solid(P.woodDark, 0.7)} cast={false} low />
        </group>
      ))}
      {poles.length === LAWN_POLES.length && (
        <>
          <StringLights a={LAWN_POLES[0]} b={LAWN_POLES[1]} h={GRASS_TOP + 1.1} />
          <StringLights a={LAWN_POLES[1]} b={LAWN_POLES[2]} h={GRASS_TOP + 1.1} />
        </>
      )}
    </group>
  );
}

// ---------------- QUIET CORNER ----------------

export const QUIET_LAMP: Pt = { x: 0.9, z: -0.3 };

export function QuietCorner() {
  const zone = "network_hub";
  const c = zoneCenter(zone);
  const tree: Pt = { x: -0.95, z: -0.62 };
  const treeOk = isClear({ x: tree.x + c.x, z: tree.z + c.z }, 0.15, { pads: false });
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#eef7f1" />
      <ParkBench x={BENCH.x} z={BENCH.z} y={PAD_TOP} w={BENCH.width} />
      <RBox size={[0.95, 0.22, 0.17]} radius={0.08} p={[BENCH.x, PAD_TOP + 0.11, BENCH.z - 0.42]} m={solid(P.foliageDark, 0.9, true)} />
      <LampPost x={QUIET_LAMP.x} z={QUIET_LAMP.z} y={PAD_TOP} h={1.25} />
      {treeOk && <Tree x={tree.x} z={tree.z} y={PAD_TOP} kind="tall" s={1.1} />}
      <FlowerBed x={0.75} z={0.35} w={0.36} d={0.36} seed={5} />
    </group>
  );
}
