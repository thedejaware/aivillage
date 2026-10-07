"use client";

/**
 * The four drama venues, built around the layout's prop anchors so the seats
 * twins use (SPOTS) line up with a chair, the bench, the blanket and the stage.
 */
import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { ZONE_DISPLAY, ZONE_TAGLINE } from "@aivillage/shared";
import { BENCH, BLANKET, CAFE_TABLES, SPOTS, STAGE_PLATFORM, zoneCenter, type Pt } from "../../lib/village/layout";
import { P, ZONE_ACCENT, beam, cachedGeo, decal, flatSlab, glow, roundedRectShape, solid } from "./materials";
import { Ball, Box, Cyl, FlowerBed, LampPost, ParkBench, RBox, StaticBatch, Tree, type V3 } from "./parts";
import { GRASS_TOP, PAD_RADIUS, PAD_TOP, STAGE_TOP, isClear, roadDist, ROAD_W } from "./scenery";

const local = (zone: string, p: Pt): Pt => {
  const c = zoneCenter(zone);
  return { x: p.x - c.x, z: p.z - c.z };
};

/** Round paved pad with a thin accent ring — the venue's "zone" decal. */
function VenuePad({ zone, color, top = PAD_TOP }: { zone: string; color: string; top?: number }) {
  const r = PAD_RADIUS[zone] ?? 1.2;
  const ring = cachedGeo(`ring:${r}`, () => {
    const g = new THREE.RingGeometry(r - 0.07, r - 0.03, 64);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const disc = cachedGeo(`pad:${r}:${top}`, () => new THREE.CylinderGeometry(r, r, top, 64).translate(0, top / 2, 0));
  return (
    <group>
      <mesh geometry={disc} material={solid(color, 0.95)} receiveShadow />
      <mesh geometry={ring} material={decal(ZONE_ACCENT[zone] ?? P.accent, 0.55)} position={[0, top + 0.002, 0]} />
    </group>
  );
}

// ---------------- THE CAFÉ ----------------

/** Gable-roofed café facing +z, with a lit window, door, awning and lantern. */
function CafeHouse({ p }: { p: V3 }) {
  const w = 0.95, d = 0.8, h = 0.78;
  const roofH = 0.4;
  const slope = Math.atan2(roofH, d / 2 + 0.08);
  const slabLen = Math.hypot(roofH, d / 2 + 0.08) + 0.05;
  const gable = cachedGeo("cafe-gable", () => {
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
  return (
    <group position={p}>
      <RBox size={[w + 0.06, 0.08, d + 0.06]} radius={0.025} p={[0, 0.04, 0]} m={solid("#f1e3d3")} />
      <RBox size={[w, h, d]} radius={0.05} p={[0, h / 2, 0]} m={wall} />
      <mesh geometry={gable} position={[0, h - 0.01, 0]} material={wall} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <RBox
          key={s}
          size={[w + 0.16, 0.06, slabLen]}
          radius={0.025}
          p={[0, h + roofH / 2 + 0.02, s * (d / 4 + 0.03)]}
          r={[s * slope, 0, 0]}
          m={roof}
        />
      ))}
      <RBox size={[w + 0.18, 0.06, 0.08]} radius={0.03} p={[0, h + roofH + 0.03, 0]} m={solid("#f07a57", 0.7)} />
      <RBox size={[0.13, 0.26, 0.13]} radius={0.025} p={[0.28, h + roofH + 0.02, -0.16]} m={solid("#efe0d0")} />
      {/* front: window + frame, awning, door, lantern, planter */}
      <RBox size={[0.38, 0.3, 0.03]} radius={0.012} p={[0.17, 0.44, d / 2 + 0.005]} m={solid(P.white, 0.6)} />
      <Box size={[0.31, 0.23, 0.02]} p={[0.17, 0.44, d / 2 + 0.018]} m={win} cast={false} />
      <Box size={[0.012, 0.23, 0.022]} p={[0.17, 0.44, d / 2 + 0.024]} m={solid(P.white, 0.6)} cast={false} />
      <group position={[0.17, 0.66, d / 2 + 0.07]} rotation={[0.55, 0, 0]}>
        {[-0.15, -0.05, 0.05, 0.15].map((x, i) => (
          <Box key={x} size={[0.1, 0.012, 0.17]} p={[x, 0, 0]} m={solid(i % 2 ? P.white : P.cafeRoof, 0.7)} />
        ))}
      </group>
      <RBox size={[0.21, 0.37, 0.04]} radius={0.015} p={[-0.24, 0.215, d / 2 + 0.01]} m={wood} />
      <Ball rad={0.012} p={[-0.17, 0.2, d / 2 + 0.035]} m={solid(P.stage, 0.4)} cast={false} />
      <Box size={[0.02, 0.02, 0.08]} p={[-0.43, 0.55, d / 2 + 0.03]} m={solid(P.deepBlue, 0.5)} />
      <Ball rad={0.045} p={[-0.43, 0.5, d / 2 + 0.07]} m={glow(P.lampGlow, 0.5, 2.6)} cast={false} />
      <RBox size={[0.36, 0.07, 0.08]} radius={0.02} p={[0.17, 0.26, d / 2 + 0.05]} m={wood} />
      {[-0.12, -0.04, 0.04, 0.12].map((x, i) => (
        <Ball key={x} rad={0.032} p={[0.17 + x, 0.32, d / 2 + 0.05]} m={solid(i % 2 ? P.blanket : P.foliage, 0.8)} />
      ))}
    </group>
  );
}

function CafeTable({ x, z }: { x: number; z: number }) {
  const metal = solid(P.metal, 0.5);
  return (
    <group position={[x, PAD_TOP, z]}>
      <Cyl rad={0.09} h={0.02} p={[0, 0.01, 0]} m={metal} />
      <Cyl rad={0.022} h={0.3} p={[0, 0.16, 0]} m={metal} low />
      <Cyl rad={0.21} h={0.035} p={[0, 0.32, 0]} m={solid(P.white, 0.55)} />
      <Cyl rad={0.215} h={0.012} p={[0, 0.302, 0]} m={solid(P.wood, 0.7)} />
      {[-0.07, 0.07].map((dx) => (
        <group key={dx} position={[dx, 0.338, dx * 0.4]}>
          <Cyl rad={0.028} h={0.05} p={[0, 0.025, 0]} m={solid(P.white, 0.4)} />
          <Cyl rad={0.024} h={0.004} p={[0, 0.051, 0]} m={solid("#8a5a3a", 0.5)} cast={false} />
        </group>
      ))}
    </group>
  );
}

/** Café chair at a coffee SPOT; backrest behind the sitter, facing the table. */
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

function Cafe() {
  const zone = "maker_space";
  const c = zoneCenter(zone);
  const chairs = SPOTS.filter((s) => s.kind === "coffee").map((s) => ({ ...local(zone, s), yaw: s.yaw, id: s.id }));
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#fbf1e6" />
      <CafeHouse p={[-0.95, PAD_TOP, -0.6]} />
      {CAFE_TABLES.map((t, i) => <CafeTable key={i} x={t.x} z={t.z} />)}
      {chairs.map((ch) => <CafeChair key={ch.id} x={ch.x} z={ch.z} yaw={ch.yaw} />)}
      <FlowerBed x={0.25} z={1.05} w={0.5} d={0.25} seed={11} rot={-0.5} />
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

const STAGE_MARK: Pt = { x: 0, z: 0.25 };
const TRUSS_BACK: Pt = { x: -0.35, z: -0.35 };
const TRUSS_HALF = 0.9;
const TRUSS_Y = 1.72;

function Stage() {
  const zone = "plaza";
  const c = zoneCenter(zone);
  const sp = SPOTS.find((s) => s.kind === "stage");
  const mark = sp ? local(zone, sp) : STAGE_MARK;
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
const BULB_COLORS = [P.lampGlow, P.blanket, "#9fd6ff", P.stage, "#a8e6be"];

function StringLights({ a, b, h }: { a: Pt; b: Pt; h: number }) {
  const { curveGeo, bulbs } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const bulbs: V3[] = [];
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = h - 0.22 * 4 * t * (1 - t);
      const p = new THREE.Vector3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
      pts.push(p);
      if (i > 0 && i < n) bulbs.push([p.x, y - 0.035, p.z]);
    }
    const curveGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.006, 4, false);
    return { curveGeo, bulbs };
  }, [a, b, h]);
  return (
    <group>
      <mesh geometry={curveGeo} material={solid(P.muted, 0.6)} />
      {bulbs.map((p, i) => (
        <Ball key={i} rad={0.034} p={p} m={glow(BULB_COLORS[i % BULB_COLORS.length], 0.6, 2.6)} cast={false} />
      ))}
    </group>
  );
}

function Lawn() {
  const zone = "event_space";
  const c = zoneCenter(zone);
  const r = PAD_RADIUS[zone];
  const lawnGeo = cachedGeo(`lawn:${r}`, () => flatSlab("lawn-shape", circleShape(r), GRASS_TOP));
  const ringGeo = cachedGeo(`lawn-ring:${r}`, () => new THREE.RingGeometry(r - 0.07, r - 0.03, 64).rotateX(-Math.PI / 2));
  const trees = LAWN_TREES.filter(([x, z]) => roadDist({ x: x + c.x, z: z + c.z }) > ROAD_W / 2 + 0.3);
  const poles = LAWN_POLES.filter((p) => roadDist({ x: p.x + c.x, z: p.z + c.z }) > ROAD_W / 2 + 0.06);
  const blanketTop = GRASS_TOP + 0.02;
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
          <Ball rad={0.03} p={[0, 1.13, 0]} m={solid(P.woodDark, 0.7)} cast={false} />
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

function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

// ---------------- QUIET CORNER ----------------

function QuietCorner() {
  const zone = "network_hub";
  const c = zoneCenter(zone);
  const lamp = QUIET_LAMP;
  const tree: Pt = { x: -0.95, z: -0.62 };
  const treeOk = isClear({ x: tree.x + c.x, z: tree.z + c.z }, 0.15, { pads: false });
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#eef7f1" />
      <ParkBench x={BENCH.x} z={BENCH.z} y={PAD_TOP} w={BENCH.width} />
      <RBox size={[0.95, 0.22, 0.17]} radius={0.08} p={[BENCH.x, PAD_TOP + 0.11, BENCH.z - 0.42]} m={solid(P.foliageDark, 0.9, true)} />
      <LampPost x={lamp.x} z={lamp.z} y={PAD_TOP} h={1.25} />
      {treeOk && <Tree x={tree.x} z={tree.z} y={PAD_TOP} kind="tall" s={1.1} />}
      <FlowerBed x={0.75} z={0.35} w={0.36} d={0.36} seed={5} />
    </group>
  );
}

// ---------------- night lights ----------------

const QUIET_LAMP: Pt = { x: 0.9, z: -0.3 };

/** Warm pools of light at each venue; zero by day, so the shader light count never changes. */
function VenueLights({ night }: { night: number }) {
  const at = (zone: string, p: Pt, y: number): V3 => {
    const c = zoneCenter(zone);
    return [c.x + p.x, y, c.z + p.z];
  };
  const stageSpot = SPOTS.find((s) => s.kind === "stage");
  const mark = stageSpot ? local("plaza", stageSpot) : STAGE_MARK;
  return (
    <group>
      <pointLight position={at("maker_space", { x: -0.6, z: 0.1 }, 0.7)} color="#ffc98a" intensity={night * 2.2} distance={3} decay={2} />
      <pointLight position={at("plaza", mark, 1.3)} color="#ffe2a8" intensity={night * 3} distance={3.2} decay={2} />
      <pointLight position={at("event_space", { x: 0.3, z: 0.2 }, 0.9)} color="#ffc2cf" intensity={night * 1.8} distance={2.8} decay={2} />
      <pointLight position={at("network_hub", QUIET_LAMP, 1.2)} color="#ffe2a8" intensity={night * 2} distance={2.6} decay={2} />
    </group>
  );
}

// ---------------- signs ----------------

const pillStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, padding: "5px 11px 5px 9px", borderRadius: 999,
  background: "rgba(255,255,255,0.96)", boxShadow: "0 4px 12px rgba(20,40,80,0.12)",
  fontFamily: "var(--font-ui), Inter, system-ui, sans-serif", whiteSpace: "nowrap", userSelect: "none"
};

/** Floating white pill naming a venue; `more` shows "+N more built" for overflow structures. */
function VenueSign({ zone, more }: { zone: string; more: number }) {
  const c = zoneCenter(zone);
  const r = PAD_RADIUS[zone] ?? 1.2;
  const accent = ZONE_ACCENT[zone] ?? P.accent;
  return (
    <Html position={[c.x, 0.3, c.z + r + 0.3]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ pointerEvents: "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={pillStyle}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: accent, boxShadow: `0 0 0 3px ${accent}26`, flex: "none" }} />
          <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: P.text, letterSpacing: 0.4 }}>{ZONE_DISPLAY[zone] ?? zone}</span>
            <span style={{ fontSize: 9, color: P.muted }}>{ZONE_TAGLINE[zone] ?? ""}</span>
          </span>
        </div>
        {more > 0 && (
          <div style={{ ...pillStyle, padding: "2px 8px", fontSize: 9, fontWeight: 600, color: P.muted }}>+{more} more built</div>
        )}
      </div>
    </Html>
  );
}

// ---------------- all venues ----------------

/** Every venue plus its sign. `overflow` maps zone → count of hidden extra structures. */
export function Venues({ night, overflow }: { night: number; overflow: Map<string, number> }) {
  return (
    <group>
      <StaticBatch>
        <Cafe />
        <Stage />
        <Lawn />
        <QuietCorner />
      </StaticBatch>
      <VenueLights night={night} />
      {Object.keys(PAD_RADIUS).map((z) => <VenueSign key={z} zone={z} more={overflow.get(z) ?? 0} />)}
    </group>
  );
}
