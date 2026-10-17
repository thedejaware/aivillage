"use client";

/**
 * The island diorama: layered slab (with a hole for the pool basin), green
 * verge, lawns, roads drawn along the layout's EDGES (the main street wider,
 * with a painted bike lane), street lamps, benches and the trees spread over
 * the whole island. Everything here is static and lands in one StaticBatch.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ContactShadows, RoundedBox } from "@react-three/drei";
import { EDGES, ISLAND_HALF, NODES, type Pt } from "../../lib/village/layout";
import { P, cachedGeo, flatSlab, roundedRectAt, roundedRectShape, solid } from "./materials";
import { Bush, FlowerBed, LampPost, ParkBench, StaticBatch, Tree, type TreeKind } from "./parts";
import { GRASS_TOP, LINE_H, NODE_ZONE, PADS, PAD_RADIUS, ROAD_H, ROAD_W, VERGE_IN, VERGE_OUT, rng } from "./scenery";
import {
  BIKE_LANE, STREET_W, inKeepOut, grassPatches, isStreetEdge, poolBasinWorld, scatter, streetBenches, streetDist,
  streetLamps, type Patch
} from "./decor";

const SIZE = ISLAND_HALF * 2;
/** Depth of the slab's top layer; the pool basin floor sits below it. */
const TOP_T = 0.16;
const BAND_T = 0.45;
export const LANE_COLOR = "#f3a493";

/** Layered-cake slab: light top, soft side band, slightly wider base plate. The pool basin cuts through the top two. */
function Slab() {
  const { top, band } = useMemo(() => {
    const b = poolBasinWorld();
    const make = (key: string, size: number, h: number, r: number) => {
      const s = roundedRectShape(size, size, r);
      s.holes.push(roundedRectAt(b.x, b.z, b.w, b.d, 0.05, new THREE.Path()));
      return flatSlab(key, s, h);
    };
    return { top: make("island-top", SIZE, TOP_T, 0.3), band: make("island-band", SIZE - 0.1, BAND_T, 0.35) };
  }, []);
  return (
    <group>
      <mesh geometry={top} position={[0, -TOP_T, 0]} material={solid(P.ground, 0.95)} receiveShadow />
      <mesh geometry={band} position={[0, -TOP_T - BAND_T + 0.025, 0]} material={solid(P.groundSide, 0.95)} receiveShadow />
      <RoundedBox args={[SIZE + 0.4, 0.16, SIZE + 0.4]} radius={0.08} smoothness={3} position={[0, -0.66, 0]} receiveShadow material={solid(P.groundBase, 0.95)} />
    </group>
  );
}

/** Green border strip around the whole island (a rounded frame). */
function Verge() {
  const geo = useMemo(
    () =>
      cachedGeo(`verge:${VERGE_OUT}`, () => {
        const outer = roundedRectShape(VERGE_OUT * 2, VERGE_OUT * 2, 0.5);
        outer.holes.push(roundedRectShape(VERGE_IN * 2, VERGE_IN * 2, 0.35));
        return flatSlab(`verge-shape:${VERGE_OUT}`, outer, GRASS_TOP);
      }),
    []
  );
  return <mesh geometry={geo} material={solid(P.grass, 0.95)} receiveShadow />;
}

function GrassPatches({ patches }: { patches: Patch[] }) {
  const mat = solid(P.grass, 0.95);
  return (
    <group>
      {patches.map((p, i) => {
        const geo = flatSlab(`patch:${p.w}:${p.d}`, roundedRectShape(p.w, p.d, Math.min(0.28, p.w / 3, p.d / 3)), GRASS_TOP);
        return <mesh key={i} geometry={geo} material={mat} position={[p.x, 0, p.z]} receiveShadow />;
      })}
    </group>
  );
}

/** Half-width of the widest road meeting at a node. */
function nodeHalfWidth(id: string): number {
  let w = 0;
  for (const [a, b] of EDGES) if (a === id || b === id) w = Math.max(w, isStreetEdge(a, b) ? STREET_W : ROAD_W);
  return w / 2;
}

/** Road surface, yellow edges, white dashes, the bike lane and its marks — five merged meshes. */
function Roads() {
  const geos = useMemo(() => {
    const surface: THREE.BufferGeometry[] = [];
    const edges: THREE.BufferGeometry[] = [];
    const dashes: THREE.BufferGeometry[] = [];
    const lane: THREE.BufferGeometry[] = [];
    const marks: THREE.BufferGeometry[] = [];
    // lines stop at a venue's pad edge, or just shy of a junction
    const trim = (id: string) => (NODE_ZONE[id] ? (PAD_RADIUS[NODE_ZONE[id]] ?? 1) + 0.02 : nodeHalfWidth(id) + 0.06);
    const flat = (len: number, w: number, ang: number, c: Pt, y: number, list: THREE.BufferGeometry[]) => {
      const g = new THREE.BoxGeometry(len, LINE_H, w);
      g.rotateY(-ang);
      g.translate(c.x, y, c.z);
      list.push(g);
    };

    for (const [a, b] of EDGES) {
      const street = isStreetEdge(a, b);
      const W = street ? STREET_W : ROAD_W;
      const pa = NODES[a], pb = NODES[b];
      const dx = pb.x - pa.x, dz = pb.z - pa.z;
      const len = Math.hypot(dx, dz);
      const ux = dx / len, uz = dz / len;
      // keep the lane on the same side of the street whichever way the edge is listed
      const flip = street && ux < 0 ? -1 : 1;
      const nx = -uz * flip, nz = ux * flip;
      const ang = Math.atan2(dz, dx);
      const at = (s: number, off: number): Pt => ({ x: pa.x + ux * s + nx * off, z: pa.z + uz * s + nz * off });

      const s = new THREE.BoxGeometry(len, ROAD_H, W);
      s.rotateY(-ang);
      s.translate((pa.x + pb.x) / 2, ROAD_H / 2, (pa.z + pb.z) / 2);
      surface.push(s);

      const t0 = trim(a), t1 = trim(b);
      const inner = len - t0 - t1;
      if (inner < 0.25) continue;
      const y = ROAD_H + LINE_H / 2;
      for (const side of [-1, 1]) flat(inner, 0.026, ang, at(t0 + inner / 2, side * (W / 2 - 0.035)), y, edges);

      const dashOff = street ? -0.1 : 0;
      const period = 0.32, dash = 0.15;
      const n = Math.max(1, Math.floor((inner - dash) / period) + 1);
      const start = t0 + (inner - ((n - 1) * period + dash)) / 2;
      for (let i = 0; i < n; i++) flat(dash, 0.035, ang, at(start + i * period + dash / 2, dashOff), y, dashes);

      if (street) {
        const l0 = t0 + 0.08, l1 = t1 + 0.08;
        const ll = len - l0 - l1;
        if (ll > 0.3) {
          const mid = l0 + ll / 2;
          flat(ll, BIKE_LANE.width, ang, at(mid, BIKE_LANE.offset), ROAD_H + LINE_H * 0.4, lane);
          flat(ll, 0.02, ang, at(mid, BIKE_LANE.offset - BIKE_LANE.width / 2 - 0.012), y, marks);
          // a little bicycle painted every ~3 units
          for (let k = l0 + 0.7; k < len - l1 - 0.4; k += 3) bikeGlyph(at(k, BIKE_LANE.offset), ang, marks);
        }
      }
    }
    for (const [id, n] of Object.entries(NODES)) {
      const r = nodeHalfWidth(id) || ROAD_W / 2;
      const g = new THREE.CylinderGeometry(r, r, ROAD_H, 28);
      g.translate(n.x, ROAD_H / 2, n.z);
      surface.push(g);
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      const m = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      for (const g of list) g.dispose();
      return m;
    };
    return { surface: merge(surface), edges: merge(edges), dashes: merge(dashes), lane: merge(lane), marks: merge(marks) };
  }, []);

  return (
    <group>
      <mesh geometry={geos.surface} material={solid(P.road, 0.95)} receiveShadow />
      <mesh geometry={geos.edges} material={solid(P.roadEdge, 0.8)} receiveShadow />
      <mesh geometry={geos.dashes} material={solid(P.roadDash, 0.8)} receiveShadow />
      <mesh geometry={geos.lane} material={solid(LANE_COLOR, 0.9)} receiveShadow />
      <mesh geometry={geos.marks} material={solid(P.roadDash, 0.8)} receiveShadow />
    </group>
  );
}

/** Flat white bicycle: two wheels and a frame bar, pointing along the lane. */
function bikeGlyph(c: Pt, ang: number, out: THREE.BufferGeometry[]) {
  const y = ROAD_H + LINE_H + 0.0005;
  for (const s of [-0.055, 0.055]) {
    const g = new THREE.RingGeometry(0.026, 0.036, 12);
    g.rotateX(-Math.PI / 2);
    g.translate(s, 0, 0);
    g.rotateY(-ang);
    g.translate(c.x, y, c.z);
    out.push(g);
  }
  const bar = new THREE.BoxGeometry(0.11, 0.001, 0.012);
  bar.rotateY(-ang);
  bar.translate(c.x, y, c.z);
  out.push(bar);
}

interface Green { x: number; z: number; s: number; rot: number; kind: TreeKind | "bush" }

/** Tree line along the verge plus woods and bushes over the open grass — denser away from the street. */
function useGreenery(): Green[] {
  return useMemo(() => {
    const rand = rng(7);
    const out: Green[] = [];
    const mid = (VERGE_IN + VERGE_OUT) / 2;
    const steps = 26;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < steps; i++) {
        const t = -mid + (2 * mid * i) / steps;
        const j = (rand() - 0.5) * 0.18;
        const [x, z] = side === 0 ? [t, -mid + j] : side === 1 ? [mid + j, t] : side === 2 ? [-t, mid + j] : [-mid + j, -t];
        const roll = rand();
        const s = 0.85 + rand() * 0.4;
        const rot = rand() * Math.PI * 2;
        if (inKeepOut({ x, z }, 0.2)) continue; // the coaster reaches the verge
        if (PADS.some((pad) => Math.hypot(x - pad.x, z - pad.z) < pad.r + 0.55)) continue;
        if (roll < 0.32) out.push({ x, z, s, rot, kind: "round" });
        else if (roll < 0.46) out.push({ x, z, s, rot, kind: "pine" });
        else if (roll < 0.74) out.push({ x, z, s: s * 1.1, rot, kind: "bush" });
      }
    }
    const density = (p: Pt) => Math.min(1, Math.max(0, (streetDist(p) - 1.2) / 3)); // 0 by the street → 1 far off
    const trees = scatter(21, 0.95, 0.3, (p, r) => r < 0.06 + 0.5 * density(p));
    for (const p of trees) {
      const roll = rand();
      out.push({ x: p.x, z: p.z, s: 0.8 + rand() * 0.45, rot: rand() * 6.28, kind: roll < 0.45 ? "round" : roll < 0.75 ? "pine" : "tall" });
    }
    const bushes = scatter(23, 1.3, 0.22, (_p, r) => r < 0.32);
    for (const p of bushes) {
      if (trees.some((q) => Math.hypot(p.x - q.x, p.z - q.z) < 0.45)) continue;
      out.push({ x: p.x, z: p.z, s: 0.85 + rand() * 0.35, rot: rand() * 6.28, kind: "bush" });
    }
    return out;
  }, []);
}

function useFlowerBeds(greens: Green[]) {
  return useMemo(() => {
    const rand = rng(31);
    return scatter(31, 2.3, 0.42, (_p, r) => r < 0.35)
      .filter((p) => !greens.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < 0.55))
      .map((p) => ({ ...p, w: 0.45 + rand() * 0.25, d: 0.28 + rand() * 0.15, rot: rand() * Math.PI }));
  }, [greens]);
}

export function Ground() {
  const patches = useMemo(grassPatches, []);
  const greens = useGreenery();
  const beds = useFlowerBeds(greens);
  const lamps = useMemo(streetLamps, []);
  const benches = useMemo(streetBenches, []);
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
        {beds.map((b, i) => <FlowerBed key={i} x={b.x} z={b.z} w={b.w} d={b.d} seed={i + 3} rot={b.rot} />)}
        {benches.map((b, i) => <ParkBench key={i} x={b.x} z={b.z} rot={b.yaw} />)}
      </StaticBatch>
      <ContactShadows position={[0, -0.76, 0]} scale={SIZE * 1.6} far={1.2} blur={2.6} opacity={0.35} resolution={512} frames={1} color={P.deepBlue} />
    </group>
  );
}

