"use client";

/**
 * The funfair at the east end of the street: a small rollercoaster (two rails,
 * sleepers and a spine along COASTER_TRACK, posts down to the ground), a
 * station at t = 0 with a fenced queue along COASTER_QUEUE, an entrance arch
 * over the street, a ticket booth and a static ferris wheel. One 4-seat cart
 * is placed every frame at coasterPose(sim.coaster.t) — at the station when
 * nobody rides — and only while the coaster is on screen.
 *
 * Cart frame (shared with the sim): origin at coasterPose(t) (the track's
 * centre line), +z along the track, seat tops at local y = CART_SEAT_HEIGHT
 * (from the sim), seats at COASTER_SEATS; rotation = Euler(−pitch, yaw, 0, "YXZ").
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { COASTER, COASTER_QUEUE, COASTER_SEATS, COASTER_TRACK, NODES, coasterPose, zoneCenter, type Pt, type Pt3 } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, glow, solid } from "../materials";
import { Ball, Box, Cyl, RBox, StaticBatch } from "../parts";
import { PAD_TOP } from "../scenery";
import { FERRIS, coasterSupports, railLine } from "../decor";
import { Pennants, VenuePad } from "./common";
import { onScreen, type PlacesSim } from "./visibility";
import { CART_SEAT_HEIGHT } from "../../../lib/village/sim";

/** Rails run this far below the track's centre line; the cart rides on them, seats CART_SEAT_HEIGHT above the line. */
export const RAIL_DROP = 0.02;
const RAIL_HALF = 0.09;
const SPINE_DROP = 0.11;
const RAIL = "#ff5f7e";
const STEEL = "#e9eef6";

const smoothTube = (pts: Pt3[], r: number, segs: number) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z)), true, "centripetal"), segs, r, 6, true);

/** Rails, spine, sleepers and support posts as a handful of merged geometries. */
function useTrackGeometry() {
  return useMemo(() => {
    const rails = mergeGeometries([
      smoothTube(railLine(COASTER_TRACK, RAIL_HALF, RAIL_DROP), 0.016, 240),
      smoothTube(railLine(COASTER_TRACK, -RAIL_HALF, RAIL_DROP), 0.016, 240)
    ]);
    const spine = smoothTube(railLine(COASTER_TRACK, 0, SPINE_DROP), 0.026, 192);
    const sleepers: THREE.BufferGeometry[] = [];
    const posts: THREE.BufferGeometry[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler(0, 0, 0, "YXZ");
    const n = COASTER_TRACK.length;
    COASTER_TRACK.forEach((c, i) => {
      const a = COASTER_TRACK[(i - 1 + n) % n], b = COASTER_TRACK[(i + 1) % n];
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const pitch = Math.atan2(b.y - a.y, Math.hypot(b.x - a.x, b.z - a.z));
      q.setFromEuler(e.set(-pitch, yaw, 0, "YXZ"));
      const g = new THREE.BoxGeometry(RAIL_HALF * 2 + 0.07, 0.018, 0.035);
      g.applyMatrix4(m.compose(new THREE.Vector3(c.x, c.y - RAIL_DROP - 0.022, c.z), q, new THREE.Vector3(1, 1, 1)));
      sleepers.push(g);
      // a short strut from the sleeper down to the spine
      const s = new THREE.BoxGeometry(0.02, SPINE_DROP - RAIL_DROP, 0.02);
      s.applyMatrix4(m.compose(new THREE.Vector3(c.x, c.y - (RAIL_DROP + SPINE_DROP) / 2, c.z), q, new THREE.Vector3(1, 1, 1)));
      sleepers.push(s);
    });
    for (const p of coasterSupports(COASTER_TRACK, 3, SPINE_DROP)) {
      const h = p.y - PAD_TOP;
      if (h < 0.04) continue;
      const g = new THREE.CylinderGeometry(0.024, 0.03, h, 8);
      g.translate(p.x, PAD_TOP + h / 2, p.z);
      posts.push(g);
      const f = new THREE.CylinderGeometry(0.06, 0.07, 0.04, 8);
      f.translate(p.x, PAD_TOP + 0.02, p.z);
      posts.push(f);
    }
    const merge = (list: THREE.BufferGeometry[]) => {
      const out = mergeGeometries(list);
      for (const g of list) g.dispose();
      return out;
    };
    return { rails, spine, sleepers: merge(sleepers), posts: merge(posts) };
  }, []);
}

function Track() {
  const g = useTrackGeometry();
  return (
    <group>
      <mesh geometry={g.rails} material={solid(RAIL, 0.45)} castShadow receiveShadow />
      <mesh geometry={g.spine} material={solid(P.deepBlue, 0.5)} castShadow receiveShadow />
      <mesh geometry={g.sleepers} material={solid(P.deepBlue, 0.5)} castShadow receiveShadow />
      <mesh geometry={g.posts} material={solid(STEEL, 0.5)} castShadow receiveShadow />
    </group>
  );
}

/** Polyline offset sideways by `off` (miter joins) — for the queue fence. */
function offsetLine(pts: Pt[], off: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const n1 = norm(i > 0 ? sub(p, a) : sub(b, p));
    const n2 = norm(i < pts.length - 1 ? sub(b, p) : sub(p, a));
    const t = norm({ x: n1.x + n2.x, z: n1.z + n2.z });
    const nx = -t.z, nz = t.x;
    const k = 1 / Math.max(0.5, nx * -n1.z + nz * n1.x); // miter length
    return { x: p.x + nx * off * k, z: p.z + nz * off * k };
  });
}
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, z: a.z - b.z });
const norm = (v: Pt): Pt => {
  const l = Math.hypot(v.x, v.z) || 1;
  return { x: v.x / l, z: v.z / l };
};

function QueueFence() {
  // the queue runs from its tail to the head by the station
  const path = [...COASTER_QUEUE].reverse();
  const tail = path[0], next = path[1];
  const d = norm(sub(tail, next));
  const full = [{ x: tail.x + d.x * 0.25, z: tail.z + d.z * 0.25 }, ...path];
  // the outer side runs to the head; the inner side stops short of the station deck and the cart
  const outer = offsetLine(full, 0.21);
  const inner = offsetLine(full, -0.21).slice(0, -1);
  const last = inner[inner.length - 1], prev = inner[inner.length - 2];
  const back = norm(sub(prev, last));
  inner[inner.length - 1] = { x: last.x + back.x * 0.12, z: last.z + back.z * 0.12 };
  const post = solid(P.deepBlue, 0.5);
  const rope = solid(ZONE_ACCENT.funfair, 0.6);
  return (
    <group>
      {[outer, inner].map((line, k) => (
        <group key={k}>
          {line.map((p, i) => (
            <group key={i} position={[p.x, PAD_TOP, p.z]}>
              <Cyl rad={0.045} h={0.025} p={[0, 0.012, 0]} m={post} />
              <Cyl rad={0.013} h={0.3} p={[0, 0.15, 0]} m={post} low />
              <Ball rad={0.02} p={[0, 0.31, 0]} m={solid(P.stage, 0.4)} cast={false} low />
            </group>
          ))}
          {line.slice(1).map((p, i) => {
            const a = line[i];
            const len = Math.hypot(p.x - a.x, p.z - a.z);
            return (
              <Box key={`r${i}`} size={[len, 0.018, 0.018]} p={[(a.x + p.x) / 2, PAD_TOP + 0.25, (a.z + p.z) / 2]} r={[0, -Math.atan2(p.z - a.z, p.x - a.x), 0]} m={rope} cast={false} />
            );
          })}
        </group>
      ))}
    </group>
  );
}

/** Station at t = 0: a low boarding deck beside the track under an open, flag-dressed frame. */
function Station() {
  const s = coasterPose(0);
  const frame = solid(ZONE_ACCENT.funfair, 0.55);
  const x0 = s.x - 0.3, x1 = s.x + 0.45;
  const z0 = s.z - 0.95, z1 = s.z + 1.0;
  const h = 1.32;
  const deckX = s.x - RAIL_HALF - 0.17;
  return (
    <group>
      <RBox size={[0.22, 0.04, 1.25]} radius={0.012} p={[deckX, PAD_TOP + 0.02, s.z]} m={solid(P.wood, 0.8)} />
      <Box size={[0.03, 0.004, 1.25]} p={[deckX + 0.095, PAD_TOP + 0.042, s.z]} m={solid(P.stage, 0.6)} cast={false} />
      {[[x0, z0], [x0, z1], [x1, z0], [x1, z1]].map(([x, z]) => (
        <group key={`${x}${z}`} position={[x, PAD_TOP, z]}>
          <RBox size={[0.1, 0.04, 0.1]} radius={0.015} p={[0, 0.02, 0]} m={solid(P.deepBlue, 0.5)} />
          <Cyl rad={0.026} h={h} p={[0, h / 2, 0]} m={frame} low />
          <Ball rad={0.04} p={[0, h + 0.02, 0]} m={glow(P.lampGlow, 0.6, 2.6)} cast={false} low />
        </group>
      ))}
      {[x0, x1].map((x) => <Box key={x} size={[0.05, 0.05, z1 - z0]} p={[x, PAD_TOP + h - 0.05, (z0 + z1) / 2]} m={frame} />)}
      {[z0, z1].map((z) => <Box key={z} size={[x1 - x0, 0.05, 0.05]} p={[(x0 + x1) / 2, PAD_TOP + h - 0.05, z]} m={frame} />)}
      {/* striped sign board on the outer beam */}
      <group position={[x0 - 0.02, PAD_TOP + h + 0.12, (z0 + z1) / 2]}>
        {Array.from({ length: 6 }, (_, i) => (
          <Box key={i} size={[0.03, 0.2, (z1 - z0) / 6]} p={[0, 0, -(z1 - z0) / 2 + (i + 0.5) * ((z1 - z0) / 6)]} m={solid(i % 2 ? P.white : RAIL, 0.6)} />
        ))}
      </group>
      <Pennants a={{ x: x0, z: z0 }} b={{ x: x1, z: z0 }} ha={PAD_TOP + h - 0.08} hb={PAD_TOP + h - 0.08} n={6} />
      <Pennants a={{ x: x0, z: z1 }} b={{ x: x1, z: z1 }} ha={PAD_TOP + h - 0.08} hb={PAD_TOP + h - 0.08} n={6} />
    </group>
  );
}

/** Candy-striped arch over the street just before the funfair gate. */
function EntranceArch() {
  const a = NODES.S7, b = NODES.FUN;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
  const at = { x: a.x + ux * 0.3, z: a.z + uz * 0.3 };
  const nx = -uz, nz = ux;
  const span = 0.46;
  const h = 1.15;
  const arc = cachedGeo("arch-arc", () => new THREE.TorusGeometry(span, 0.035, 8, 24, Math.PI));
  const pole = solid(P.white, 0.6);
  return (
    <group position={[at.x, PAD_TOP, at.z]} rotation={[0, Math.atan2(-nz, nx), 0]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * span, 0, 0]}>
          <RBox size={[0.12, 0.05, 0.12]} radius={0.02} p={[0, 0.025, 0]} m={solid(P.deepBlue, 0.5)} />
          <Cyl rad={0.035} h={h} p={[0, h / 2, 0]} m={pole} low />
          {[0.2, 0.45, 0.7, 0.95].map((y) => <Cyl key={y} rad={0.037} h={0.08} p={[0, y, 0]} m={solid(RAIL, 0.6)} cast={false} low />)}
        </group>
      ))}
      <mesh geometry={arc} position={[0, h, 0]} material={solid(ZONE_ACCENT.funfair, 0.5)} castShadow />
      {Array.from({ length: 7 }, (_, i) => {
        const t = ((i + 0.5) / 7) * Math.PI;
        return <Ball key={i} rad={0.03} p={[Math.cos(t) * span, h + Math.sin(t) * span, 0.03]} m={glow(i % 2 ? P.lampGlow : "#ff9fb2", 0.6, 2.6)} cast={false} low />;
      })}
      <RBox size={[0.5, 0.16, 0.04]} radius={0.03} p={[0, h + span + 0.02, 0]} m={solid(RAIL, 0.6)} />
      <Box size={[0.4, 0.06, 0.045]} p={[0, h + span + 0.02, 0]} m={glow("#fff3c4", 0.5, 2.2)} cast={false} />
    </group>
  );
}

function TicketBooth({ x, z, rot }: { x: number; z: number; rot: number }) {
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, rot, 0]}>
      <RBox size={[0.3, 0.42, 0.26]} radius={0.03} p={[0, 0.21, 0]} m={solid(P.white, 0.7)} />
      {[-0.1, 0.1].map((dx) => <Box key={dx} size={[0.06, 0.42, 0.265]} p={[dx, 0.21, 0]} m={solid(RAIL, 0.7)} cast={false} />)}
      <Box size={[0.18, 0.12, 0.01]} p={[0, 0.3, 0.135]} m={glow(P.lampGlow, 0.4, 2)} cast={false} />
      <mesh geometry={cachedGeo("booth-roof", () => new THREE.ConeGeometry(0.26, 0.2, 4).rotateY(Math.PI / 4))} position={[0, 0.52, 0]} material={solid(ZONE_ACCENT.funfair, 0.6)} castShadow />
      <Ball rad={0.025} p={[0, 0.64, 0]} m={solid(RAIL, 0.5)} cast={false} low />
    </group>
  );
}

/** Small static ferris wheel; its face turned toward the usual camera diagonal. */
function FerrisWheel() {
  const { x, z, r } = FERRIS;
  const hub = r + 0.28;
  const frame = solid(P.white, 0.55);
  const rim = cachedGeo(`ferris-rim:${r}`, () => new THREE.TorusGeometry(r, 0.022, 6, 40));
  const colors = ["#ff7a8a", "#4fc3f7", "#ffd27a", "#7cc79a", "#b9a5ff", "#ff9a4d"];
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, Math.PI / 4, 0]}>
      <RBox size={[0.9, 0.05, 0.4]} radius={0.02} p={[0, 0.025, 0]} m={solid(P.deepBlue, 0.5)} />
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * 0.12]}>
          <Box size={[0.04, hub + 0.05, 0.04]} p={[-0.26, hub / 2, 0]} r={[0, 0, -0.3]} m={solid(P.deepBlue, 0.5)} />
          <Box size={[0.04, hub + 0.05, 0.04]} p={[0.26, hub / 2, 0]} r={[0, 0, 0.3]} m={solid(P.deepBlue, 0.5)} />
          <mesh geometry={rim} position={[0, hub, s * 0.06]} material={frame} castShadow />
        </group>
      ))}
      <Cyl rad={0.05} h={0.3} p={[0, hub, 0]} r={[Math.PI / 2, 0, 0]} m={solid(ZONE_ACCENT.funfair, 0.5)} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <Box key={i} size={[0.02, r, 0.02]} p={[Math.sin(a) * r / 2, hub + Math.cos(a) * r / 2, 0]} r={[0, 0, -a]} m={frame} />;
      })}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        const gx = Math.sin(a) * r, gy = hub + Math.cos(a) * r;
        return (
          <group key={i} position={[gx, gy - 0.1, 0]}>
            <RBox size={[0.13, 0.12, 0.13]} radius={0.03} p={[0, 0, 0]} m={solid(colors[i], 0.6)} />
            <RBox size={[0.15, 0.025, 0.15]} radius={0.01} p={[0, 0.08, 0]} m={solid(P.white, 0.6)} />
          </group>
        );
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <Ball key={i} rad={0.022} p={[Math.sin(a) * r, hub + Math.cos(a) * r, 0.1]} m={glow(i % 2 ? P.lampGlow : "#ff9fb2", 0.5, 2.6)} cast={false} low />;
      })}
    </group>
  );
}

/** Everything about the funfair that never moves (goes in the StaticBatch). */
export function FunfairStatic() {
  const zone = "funfair";
  const c = zoneCenter(zone);
  return (
    <group>
      <group position={[c.x, 0, c.z]}>
        <VenuePad zone={zone} color="#fff4e2" />
      </group>
      <Track />
      <Station />
      <QueueFence />
      <EntranceArch />
      <TicketBooth x={8.25} z={1.72} rot={-0.4} />
      <FerrisWheel />
      {[{ x: COASTER.cx + 0.25, z: COASTER.cz - 0.9 }, { x: COASTER.cx + 0.3, z: COASTER.cz + 0.9 }].map((p, i) => (
        <group key={i} position={[p.x, PAD_TOP, p.z]}>
          <Cyl rad={0.015} h={0.9} p={[0, 0.45, 0]} m={solid(P.white, 0.5)} low />
          <Box size={[0.2, 0.12, 0.01]} p={[0.1, 0.82, 0]} m={solid(i ? "#4fc3f7" : RAIL, 0.6)} />
        </group>
      ))}
    </group>
  );
}

// ---------------- the cart ----------------

const BODY = "#ffd24a";

function CartModel() {
  const body = solid(BODY, 0.45);
  const trim = solid(RAIL, 0.5);
  const seat = solid(P.accent, 0.6);
  const dark = solid(P.deepBlue, 0.5);
  const rows = [...new Set(COASTER_SEATS.map((s) => s.z))];
  return (
    <group>
      {/* wheels on the rails */}
      {[-1, 1].map((sx) => [0.24, -0.34].map((wz) => (
        <Cyl key={`${sx}${wz}`} rad={0.032} h={0.03} p={[sx * RAIL_HALF, -RAIL_DROP + 0.035, wz]} r={[0, 0, Math.PI / 2]} m={solid(STEEL, 0.4)} />
      )))}
      {/* everything above is laid out around the seat tops at y = CART_SEAT_HEIGHT */}
      <group position={[0, CART_SEAT_HEIGHT, 0]}>
        <RBox size={[0.3, 0.04, 0.8]} radius={0.015} p={[0, -0.095, -0.05]} m={dark} />
        <RBox size={[0.38, 0.04, 0.8]} radius={0.015} p={[0, -0.06, -0.05]} m={body} />
        {[-1, 1].map((s) => <RBox key={s} size={[0.04, 0.2, 0.8]} radius={0.015} p={[s * 0.19, 0.04, -0.05]} m={body} />)}
        <RBox size={[0.38, 0.22, 0.14]} radius={0.05} p={[0, 0.03, 0.38]} m={trim} />
        <Ball rad={0.03} p={[0, 0.06, 0.455]} m={glow(P.lampGlow, 0.6, 2.8)} cast={false} low />
        <RBox size={[0.38, 0.16, 0.06]} radius={0.02} p={[0, 0.0, -0.46]} m={trim} />
        {COASTER_SEATS.map((s, i) => (
          <group key={i} position={[s.x, 0, s.z]}>
            <RBox size={[0.14, 0.04, 0.16]} radius={0.015} p={[0, -0.02, 0]} m={seat} />
            <RBox size={[0.14, 0.2, 0.035]} radius={0.015} p={[0, 0.09, -0.1]} r={[-0.15, 0, 0]} m={seat} />
          </group>
        ))}
        {rows.map((z) => (
          <Cyl key={z} rad={0.012} h={0.34} p={[0, 0.14, z + 0.14]} r={[0, 0, Math.PI / 2]} m={solid(STEEL, 0.35)} low />
        ))}
      </group>
    </group>
  );
}

const IDLE = coasterPose(0);

/** The cart: follows coasterPose(sim.coaster.t) while a ride runs, rests at the station otherwise. */
export function CoasterCart({ sim }: { sim?: PlacesSim | null }) {
  const cart = useRef<THREE.Group>(null);
  const lastT = useRef(Number.NaN);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(COASTER.cx, 0.8, COASTER.cz), Math.max(COASTER.rx, COASTER.rz) + 0.6), []);

  useEffect(() => {
    cart.current?.position.set(IDLE.x, IDLE.y, IDLE.z);
    cart.current?.rotation.set(-IDLE.pitch, IDLE.yaw, 0, "YXZ");
  }, []);

  useFrame(({ camera, clock }) => {
    const g = cart.current;
    if (!g) return;
    const co = sim?.coaster;
    const t = co?.running ? co.t : 0;
    if (t === lastT.current) return;
    if (!onScreen(camera, clock.elapsedTime, sphere)) return;
    lastT.current = t;
    const p = t === 0 ? IDLE : coasterPose(t);
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(-p.pitch, p.yaw, 0, "YXZ");
  });

  return (
    <group ref={cart}>
      <StaticBatch>
        <CartModel />
      </StaticBatch>
    </group>
  );
}
