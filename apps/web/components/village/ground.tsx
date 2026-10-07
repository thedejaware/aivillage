"use client";

/**
 * The island diorama: layered slab, green verge, lawns, roads drawn along the
 * layout's EDGES (so twins visibly walk on them), lamp posts and the tree line.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import { EDGES, ISLAND_HALF, NODES, type Pt } from "../../lib/village/layout";
import { P, cachedGeo, flatSlab, roundedRectShape, solid } from "./materials";
import { Bush, FlowerBed, LampPost, ParkBench, StaticBatch, Tree, type TreeKind } from "./parts";
import {
  GRASS_TOP, LINE_H, NODE_ZONE, PADS, PAD_RADIUS, ROAD_H, ROAD_W, VERGE_IN, VERGE_OUT, fitRect, isClear, nearestRoadPoint, rng
} from "./scenery";

const SIZE = ISLAND_HALF * 2;

/** Layered-cake slab: light top, soft side band, slightly wider base plate. */
function Slab() {
  return (
    <group>
      <RoundedBox args={[SIZE, 0.16, SIZE]} radius={0.07} smoothness={3} position={[0, -0.08, 0]} receiveShadow material={solid(P.ground, 0.95)} />
      <RoundedBox args={[SIZE - 0.1, 0.45, SIZE - 0.1]} radius={0.12} smoothness={3} position={[0, -0.36, 0]} receiveShadow material={solid(P.groundSide, 0.95)} />
      <RoundedBox args={[SIZE + 0.4, 0.16, SIZE + 0.4]} radius={0.08} smoothness={3} position={[0, -0.62, 0]} receiveShadow material={solid(P.groundBase, 0.95)} />
    </group>
  );
}

/** Green border strip around the whole island (a rounded frame). */
function Verge() {
  const geo = useMemo(
    () =>
      cachedGeo("verge", () => {
        const outer = roundedRectShape(VERGE_OUT * 2, VERGE_OUT * 2, 0.5);
        outer.holes.push(roundedRectShape(VERGE_IN * 2, VERGE_IN * 2, 0.35));
        return flatSlab("verge-shape", outer, GRASS_TOP);
      }),
    []
  );
  return <mesh geometry={geo} material={solid(P.grass, 0.95)} receiveShadow />;
}

/** Hand-picked lawn blocks between roads, shrunk until they clear every road and pad. */
const PATCH_SEEDS: [number, number, number, number][] = [
  [-3.7, -3.7, 2.2, 2.0],
  [-3.9, -1.0, 1.6, 1.8],
  [0.0, -4.3, 2.2, 0.8],
  [4.3, -1.9, 1.0, 2.4],
  [4.3, 0.4, 0.95, 1.6],
  [0.6, 4.35, 2.6, 0.95],
  [-3.2, 3.95, 2.6, 1.4],
  [2.0, -0.85, 1.0, 1.4],
  [-1.0, 1.95, 1.0, 0.7]
];

interface Patch { x: number; z: number; w: number; d: number }

function usePatches(): Patch[] {
  return useMemo(() => {
    const out: Patch[] = [];
    for (const [x, z, w, d] of PATCH_SEEDS) {
      const fit = fitRect(x, z, w, d, 0.16);
      if (fit) out.push({ x, z, ...fit });
    }
    return out;
  }, []);
}

function GrassPatches({ patches }: { patches: Patch[] }) {
  const mat = solid(P.grass, 0.95);
  return (
    <group>
      {patches.map((p, i) => {
        const w = +p.w.toFixed(2), d = +p.d.toFixed(2);
        const geo = flatSlab(`patch:${w}:${d}`, roundedRectShape(w, d, Math.min(0.28, w / 3, d / 3)), GRASS_TOP);
        return <mesh key={i} geometry={geo} material={mat} position={[p.x, 0, p.z]} receiveShadow />;
      })}
    </group>
  );
}

/** Road surface, yellow edge lines and white centre dashes — three merged meshes. */
function Roads() {
  const geos = useMemo(() => {
    const surface: THREE.BufferGeometry[] = [];
    const edges: THREE.BufferGeometry[] = [];
    const dashes: THREE.BufferGeometry[] = [];
    // lines stop at a venue's pad edge, or just shy of a plain junction
    const trim = (id: string) => (NODE_ZONE[id] ? (PAD_RADIUS[NODE_ZONE[id]] ?? 1) + 0.02 : ROAD_W / 2 + 0.06);

    for (const [a, b] of EDGES) {
      const pa = NODES[a], pb = NODES[b];
      const dx = pb.x - pa.x, dz = pb.z - pa.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      const nx = -uz, nz = ux;
      const ang = Math.atan2(dz, dx);
      const at = (s: number, off: number): Pt => ({ x: pa.x + ux * s + nx * off, z: pa.z + uz * s + nz * off });

      const s = new THREE.BoxGeometry(len, ROAD_H, ROAD_W);
      s.rotateY(-ang);
      s.translate((pa.x + pb.x) / 2, ROAD_H / 2, (pa.z + pb.z) / 2);
      surface.push(s);

      const t0 = trim(a), t1 = trim(b);
      const inner = len - t0 - t1;
      if (inner < 0.25) continue;
      for (const side of [-1, 1]) {
        const c = at(t0 + inner / 2, side * (ROAD_W / 2 - 0.035));
        const g = new THREE.BoxGeometry(inner, LINE_H, 0.026);
        g.rotateY(-ang);
        g.translate(c.x, ROAD_H + LINE_H / 2, c.z);
        edges.push(g);
      }
      const period = 0.32, dash = 0.15;
      const n = Math.max(1, Math.floor((inner - dash) / period) + 1);
      const start = t0 + (inner - ((n - 1) * period + dash)) / 2;
      for (let i = 0; i < n; i++) {
        const c = at(start + i * period + dash / 2, 0);
        const g = new THREE.BoxGeometry(dash, LINE_H, 0.035);
        g.rotateY(-ang);
        g.translate(c.x, ROAD_H + LINE_H / 2, c.z);
        dashes.push(g);
      }
    }
    for (const n of Object.values(NODES)) {
      const g = new THREE.CylinderGeometry(ROAD_W / 2, ROAD_W / 2, ROAD_H, 28);
      g.translate(n.x, ROAD_H / 2, n.z);
      surface.push(g);
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      const m = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      return m;
    };
    return { surface: merge(surface), edges: merge(edges), dashes: merge(dashes) };
  }, []);

  return (
    <group>
      <mesh geometry={geos.surface} material={solid(P.road, 0.95)} receiveShadow />
      <mesh geometry={geos.edges} material={solid(P.roadEdge, 0.8)} receiveShadow />
      <mesh geometry={geos.dashes} material={solid(P.roadDash, 0.8)} receiveShadow />
    </group>
  );
}

/** Lamps along the outer ring road, set on the side facing away from the centre. */
const LAMP_EDGES: [string, string][] = [
  ["CAFE", "R2"], ["R2", "LAWN"], ["QUIET", "R3"], ["R3", "LAWN"], ["CAFE", "R4"], ["R4", "QUIET"], ["C", "M3"], ["C", "M2"]
];

function lampSpots(): Pt[] {
  const out: Pt[] = [];
  for (const [a, b] of LAMP_EDGES) {
    const pa = NODES[a], pb = NODES[b];
    const mx = (pa.x + pb.x) / 2, mz = (pa.z + pb.z) / 2;
    const len = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    let nx = -(pb.z - pa.z) / len, nz = (pb.x - pa.x) / len;
    if (nx * mx + nz * mz < 0) { nx = -nx; nz = -nz; }
    const p = { x: mx + nx * (ROAD_W / 2 + 0.16), z: mz + nz * (ROAD_W / 2 + 0.16) };
    const nearPad = PADS.some((pad) => Math.hypot(p.x - pad.x, p.z - pad.z) < pad.r + 0.45);
    if (!nearPad && isClear(p, 0.05, { rim: ISLAND_HALF })) out.push(p);
  }
  return out;
}

/** Trees and bushes along the verge plus a few on the inner lawns. */
interface Green { x: number; z: number; s: number; rot: number; kind: TreeKind | "bush" }

function useGreenery(patches: Patch[]): Green[] {
  return useMemo(() => {
    const rand = rng(7);
    const out: Green[] = [];
    const mid = (VERGE_IN + VERGE_OUT) / 2;
    const steps = 12;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i <= steps; i++) {
        if (i === steps && side < 3) continue; // corners are shared
        const t = -mid + (2 * mid * i) / steps;
        const j = (rand() - 0.5) * 0.18;
        const [x, z] =
          side === 0 ? [t, -mid + j] : side === 1 ? [mid + j, t] : side === 2 ? [-t, mid + j] : [-mid + j, -t];
        const roll = rand();
        const s = 0.85 + rand() * 0.4;
        const rot = rand() * Math.PI * 2;
        if (PADS.some((pad) => Math.hypot(x - pad.x, z - pad.z) < pad.r + 0.55)) continue; // keep venue backdrops open
        if (roll < 0.3) out.push({ x, z, s, rot, kind: "round" });
        else if (roll < 0.42) out.push({ x, z, s, rot, kind: "pine" });
        else if (roll < 0.72) out.push({ x, z, s: s * 1.1, rot, kind: "bush" });
      }
    }
    for (const p of patches) {
      const area = p.w * p.d;
      if (area > 1.4) {
        out.push({ x: p.x, z: p.z, s: 1.0, rot: rand() * 6, kind: rand() < 0.5 ? "round" : "tall" });
        out.push({ x: p.x - p.w / 2 + 0.22, z: p.z + p.d / 2 - 0.2, s: 0.9, rot: rand() * 6, kind: "bush" });
      } else if (area > 0.5) {
        out.push({ x: p.x + p.w / 2 - 0.22, z: p.z - p.d / 2 + 0.2, s: 0.85, rot: rand() * 6, kind: "bush" });
      }
    }
    return out;
  }, [patches]);
}

/** Small benches and flower beds dotted next to the roads. */
const BEDS: [number, number, number, number][] = [
  [4.0, 3.9, 0.5, 0.5],
  [-4.4, -2.35, 0.6, 0.3],
  [0.62, -2.7, 0.55, 0.28],
  [-2.01, 2.96, 0.55, 0.28]
];
const BENCHES: [number, number][] = [[-2.63, -1.66], [-0.03, 1.06], [2.42, -1.89]];

/** Yaw that turns a bench (seat facing +z) toward the nearest road. */
function faceRoad(x: number, z: number): number {
  const q = nearestRoadPoint({ x, z });
  return Math.atan2(q.x - x, q.z - z);
}

export function Ground() {
  const patches = usePatches();
  const greens = useGreenery(patches);
  const lamps = useMemo(lampSpots, []);
  const beds = useMemo(() => BEDS.filter(([x, z, w, d]) => isClear({ x, z }, Math.max(w, d) / 2)), []);
  const benches = useMemo(() => BENCHES.filter(([x, z]) => isClear({ x, z }, 0.3)).map(([x, z]) => [x, z, faceRoad(x, z)] as const), []);
  return (
    <group>
      <StaticBatch>
        <Slab />
        <Verge />
        <GrassPatches patches={patches} />
        <Roads />
        {lamps.map((l, i) => <LampPost key={i} x={l.x} z={l.z} />)}
        {greens.map((g, i) =>
          g.kind === "bush"
            ? <Bush key={i} x={g.x} z={g.z} y={GRASS_TOP} s={g.s} rot={g.rot} />
            : <Tree key={i} x={g.x} z={g.z} y={GRASS_TOP} s={g.s} rot={g.rot} kind={g.kind} />
        )}
        {beds.map(([x, z, w, d], i) => <FlowerBed key={i} x={x} z={z} w={w} d={d} seed={i + 3} />)}
        {benches.map(([x, z, r], i) => <ParkBench key={i} x={x} z={z} rot={r} />)}
      </StaticBatch>
      <ContactShadows position={[0, -0.72, 0]} scale={SIZE * 1.6} far={1.2} blur={2.6} opacity={0.35} resolution={512} frames={1} color={P.deepBlue} />
    </group>
  );
}
