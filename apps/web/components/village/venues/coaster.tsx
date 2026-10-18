"use client";

/**
 * The funfair at the east end of the street: a small rollercoaster (two rails,
 * sleepers and a spine along COASTER_TRACK, posts down to the ground), a
 * station at t = 0 with a fenced queue along COASTER_QUEUE, an entrance arch
 * over the station's north end (the walk from the FUN gate down to the queue,
 * and the track), a ticket booth and a static ferris wheel. One 4-seat cart
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
import { COASTER, COASTER_SEATS, COASTER_TRACK, coasterPose, zoneCenter, type Pt, type Pt3 } from "../../../lib/village/layout";
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

/**
 * Rope fence lining the queue (world). COASTER_QUEUE winds from the head by the
 * station, (8.2, −0.2), south to the tail at (8.25, −1.15). One run lines its
 * west side and stops short of the x = 7.5 road (posts ≥ 0.48 off it); one runs
 * behind the tail. The track side stays open: the cart passes ~0.35 east of the
 * queue, so a rope there would cross it. Every post is ≥ 0.2 from a queue spot.
 */
const FENCE_RUNS: Pt[][] = [
  [{ x: 7.99, z: -0.3 }, { x: 7.99, z: -0.8 }],
  [{ x: 7.98, z: -1.38 }, { x: 8.25, z: -1.45 }, { x: 8.48, z: -1.42 }]
];

function QueueFence() {
  const post = solid(P.deepBlue, 0.5);
  const rope = solid(ZONE_ACCENT.funfair, 0.6);
  return (
    <group>
      {FENCE_RUNS.map((line, k) => (
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

/**
 * Station frame at t = 0 (world), shared with the entrance arch, whose poles are
 * its north corners. The track runs north through it at x ≈ s.x. The west posts
 * sit 0.48 off the x = 7.5 road, west of the walk from the FUN gate (8.2, 0.9)
 * down to the queue head; the north end (z1) stays 0.33 short of the S7 → FUN
 * road and the south end (z0) 0.24 from the queue head.
 */
const STATION = (() => {
  const s = coasterPose(0);
  return { s, x0: s.x - 0.57, x1: s.x + 0.45, z0: s.z - 0.4, z1: s.z + 0.3, h: 1.32 };
})();

/** Station at t = 0: a low boarding deck beside the track under an open, flag-dressed frame. */
function Station() {
  const { s, x0, x1, z0, z1, h } = STATION;
  const frame = solid(ZONE_ACCENT.funfair, 0.55);
  const deckX = s.x - RAIL_HALF - 0.17;
  // the deck runs the length of the frame and a bit past the arch; the queue head waits just off its south end
  const d0 = z0, d1 = z1 + 0.25;
  return (
    <group>
      <RBox size={[0.22, 0.04, d1 - d0]} radius={0.012} p={[deckX, PAD_TOP + 0.02, (d0 + d1) / 2]} m={solid(P.wood, 0.8)} />
      <Box size={[0.03, 0.004, d1 - d0]} p={[deckX + 0.095, PAD_TOP + 0.042, (d0 + d1) / 2]} m={solid(P.stage, 0.6)} cast={false} />
      {/* south corners only: the arch's poles are the north ones */}
      {[x0, x1].map((x) => (
        <group key={x} position={[x, PAD_TOP, z0]}>
          <RBox size={[0.1, 0.04, 0.1]} radius={0.015} p={[0, 0.02, 0]} m={solid(P.deepBlue, 0.5)} />
          <Cyl rad={0.026} h={h} p={[0, h / 2, 0]} m={frame} low />
          <Ball rad={0.04} p={[0, h + 0.02, 0]} m={glow(P.lampGlow, 0.6, 2.6)} cast={false} low />
        </group>
      ))}
      {[x0, x1].map((x) => <Box key={x} size={[0.05, 0.05, z1 - z0]} p={[x, PAD_TOP + h - 0.05, (z0 + z1) / 2]} m={frame} />)}
      {[z0, z1].map((z) => <Box key={z} size={[x1 - x0, 0.05, 0.05]} p={[(x0 + x1) / 2, PAD_TOP + h - 0.05, z]} m={frame} />)}
      {/* striped sign board on the outer beam, stopping short of the arch */}
      <group position={[x0 - 0.02, PAD_TOP + h + 0.12, (z0 + z1 - 0.12) / 2]}>
        {Array.from({ length: 6 }, (_, i) => {
          const len = z1 - z0 - 0.12;
          return <Box key={i} size={[0.03, 0.2, len / 6]} p={[0, 0, -len / 2 + (i + 0.5) * (len / 6)]} m={solid(i % 2 ? P.white : RAIL, 0.6)} />;
        })}
      </group>
      <Pennants a={{ x: x0, z: z0 }} b={{ x: x1, z: z0 }} ha={PAD_TOP + h - 0.08} hb={PAD_TOP + h - 0.08} n={6} />
      <Pennants a={{ x: x0, z: z1 }} b={{ x: x1, z: z1 }} ha={PAD_TOP + h - 0.08} hb={PAD_TOP + h - 0.08} n={6} />
    </group>
  );
}

/**
 * Candy-striped arch at the station's north end: its poles are the frame's north
 * corners, so it spans both the walk from the FUN gate down to the queue and the
 * track (the cart passes under it). Its face looks along the track (±z).
 */
function EntranceArch() {
  const { x0, x1, z1, h } = STATION;
  const span = (x1 - x0) / 2;
  const arc = cachedGeo(`arch-arc:${span.toFixed(3)}`, () => new THREE.TorusGeometry(span, 0.035, 8, 24, Math.PI));
  const pole = solid(P.white, 0.6);
  return (
    <group position={[(x0 + x1) / 2, PAD_TOP, z1]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * span, 0, 0]}>
          <RBox size={[0.12, 0.05, 0.12]} radius={0.02} p={[0, 0.025, 0]} m={solid(P.deepBlue, 0.5)} />
          <Cyl rad={0.035} h={h} p={[0, h / 2, 0]} m={pole} low />
          {[0.2, 0.45, 0.7, 0.95, 1.2].map((y) => <Cyl key={y} rad={0.037} h={0.08} p={[0, y, 0]} m={solid(RAIL, 0.6)} cast={false} low />)}
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

/** Small static ferris wheel south of the oval (FERRIS, ~0.9 clear of the track); its face turned toward the usual camera diagonal. */
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
      {/* north of the gate: ≥ 0.45 off the x = 7.5 road, its roof ~0.15 clear of the cart */}
      <TicketBooth x={8.15} z={2.1} rot={-0.4} />
      <FerrisWheel />
      {/* two flag signs in the middle of the oval, clear of the track */}
      {[{ x: COASTER.cx + 0.25, z: COASTER.cz - 0.4 * COASTER.rz }, { x: COASTER.cx + 0.3, z: COASTER.cz + 0.4 * COASTER.rz }].map((p, i) => (
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
