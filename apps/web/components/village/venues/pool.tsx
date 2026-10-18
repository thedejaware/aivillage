"use client";

/**
 * The pool: a tiled deck with the basin cut into the island (4 lanes along z,
 * 3 lane ropes), a ladder, a row of eight sun loungers at POOL.loungers on the
 * road side (a parasol in each gap between neighbours, none on the x = 0 path),
 * and a water surface a little below the deck whose shimmer moves only while
 * the pool is on screen.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { POOL, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, flatSlab, getNightness, roundedRectAt, solid } from "../materials";
import { Ball, Box, Cyl, RBox } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { POOL_DECK } from "../decor";
import { Parasol } from "./common";
import { onScreen } from "./visibility";

/** Water surface: a little below the deck so swimmers sit half in it. */
export const WATER_Y = PAD_TOP - 0.06;
const FLOOR_Y = -0.5;
const LINER = "#a6dcf3";

function Lounger({ x, z }: { x: number; z: number }) {
  const frame = solid(P.white, 0.5);
  const cushion = solid("#9fd6ff", 0.85);
  const top = SEAT_Y.lounger - PAD_TOP;
  return (
    <group position={[x, PAD_TOP, z]}>
      {[[-1, 0.3], [1, 0.3], [-1, -0.26], [1, -0.26]].map(([sx, dz]) => (
        <Box key={`${sx}${dz}`} size={[0.025, top - 0.03, 0.025]} p={[sx * 0.12, (top - 0.03) / 2, dz]} m={frame} />
      ))}
      <RBox size={[0.28, 0.03, 0.44]} radius={0.01} p={[0, top - 0.035, 0.12]} m={frame} />
      <RBox size={[0.26, 0.035, 0.42]} radius={0.015} p={[0, top - 0.0175, 0.12]} m={cushion} />
      <Box size={[0.262, 0.004, 0.08]} p={[0, top + 0.001, 0.2]} m={solid(P.white, 0.9)} cast={false} />
      <group position={[0, top - 0.02, -0.08]} rotation={[0.75, 0, 0]}>
        <RBox size={[0.28, 0.03, 0.3]} radius={0.01} p={[0, 0, -0.15]} m={frame} />
        <RBox size={[0.26, 0.035, 0.28]} radius={0.015} p={[0, 0.03, -0.15]} m={cushion} />
      </group>
      {/* a folded towel at the foot */}
      <RBox size={[0.2, 0.025, 0.08]} radius={0.01} p={[0, top + 0.012, 0.3]} m={solid(P.blanket, 0.9)} />
    </group>
  );
}

function Ladder({ x, z }: { x: number; z: number }) {
  const steel = solid("#dfe6ef", 0.25);
  const arc = cachedGeo("ladder-arc", () => new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI));
  return (
    <group position={[x, 0, z]}>
      {[-0.1, 0.1].map((dz) => (
        <group key={dz} position={[0, 0, dz]}>
          <Cyl rad={0.012} h={0.5} p={[-0.07, -0.05, 0]} m={steel} low />
          <mesh geometry={arc} position={[0, 0.2, 0]} material={steel} castShadow />
          <Cyl rad={0.012} h={0.2} p={[0.07, 0.1, 0]} m={steel} low />
        </group>
      ))}
      {[-0.1, -0.22, -0.34].map((y) => <Box key={y} size={[0.05, 0.015, 0.2]} p={[-0.06, y, 0]} m={steel} />)}
    </group>
  );
}

function Lifebuoy({ x, z }: { x: number; z: number }) {
  const ring = cachedGeo("lifebuoy", () => new THREE.TorusGeometry(0.08, 0.025, 8, 16));
  return (
    <group position={[x, PAD_TOP, z]}>
      <Cyl rad={0.014} h={0.5} p={[0, 0.25, 0]} m={solid(P.white, 0.5)} low />
      <mesh geometry={ring} position={[0, 0.36, 0.03]} material={solid("#ff5f5f", 0.6)} castShadow />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        return <Box key={i} size={[0.03, 0.055, 0.055]} p={[Math.cos(a) * 0.08, 0.36 + Math.sin(a) * 0.08, 0.03]} r={[0, 0, a]} m={solid(P.white, 0.6)} cast={false} />;
      })}
    </group>
  );
}

function PottedPlant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, PAD_TOP, z]} scale={s}>
      <Cyl rad={0.09} h={0.16} p={[0, 0.08, 0]} m={solid("#e4a07a", 0.8)} />
      <Ball rad={0.13} p={[0, 0.27, 0]} m={solid(P.foliage, 0.9, true)} low />
      <Ball rad={0.08} p={[0.06, 0.37, 0.02]} m={solid(P.foliageDark, 0.9, true)} low />
    </group>
  );
}

/** Everything about the pool that never moves (goes in the StaticBatch). */
export function PoolStatic() {
  const c = zoneCenter("pool");
  const D = POOL_DECK;
  const deck = useMemo(() => {
    const s = roundedRectAt(D.x, D.z, D.w, D.d, 0.4) as THREE.Shape;
    s.holes.push(roundedRectAt(POOL.x, POOL.z, POOL.w, POOL.d, 0.05, new THREE.Path()));
    return flatSlab(`pool-deck:${D.w}:${D.d}`, s, PAD_TOP);
  }, [D.x, D.z, D.w, D.d]);
  const hw = POOL.w / 2, hd = POOL.d / 2;
  const wallH = PAD_TOP - FLOOR_Y;
  const liner = solid(LINER, 0.4);
  const coping = solid(P.white, 0.6);
  const ropeLen = POOL.d - 0.12;
  const floats = Math.round(ropeLen / 0.115); // ~one float every 0.115
  // parasols sit in the gap between neighbouring loungers on the same side of the path
  const parasols = POOL.loungers.slice(1)
    .map((l, i) => ({ a: POOL.loungers[i], b: l }))
    .filter(({ a, b }) => Math.sign(a.x - POOL.x) === Math.sign(b.x - POOL.x))
    .map(({ a, b }) => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 - 0.05 }));
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh geometry={deck} material={solid("#eef6fb", 0.9)} receiveShadow />
      <group position={[POOL.x, 0, POOL.z]}>
        {/* liner walls + floor with lane stripes */}
        {[-1, 1].map((s) => (
          <group key={s}>
            <Box size={[0.04, wallH, POOL.d]} p={[s * (hw - 0.025), FLOOR_Y + wallH / 2, 0]} m={liner} cast={false} />
            <Box size={[POOL.w, wallH, 0.04]} p={[0, FLOOR_Y + wallH / 2, s * (hd - 0.025)]} m={liner} cast={false} />
            <RBox size={[0.1, 0.03, POOL.d + 0.1]} radius={0.01} p={[s * hw, PAD_TOP + 0.005, 0]} m={coping} cast={false} />
            <RBox size={[POOL.w + 0.1, 0.03, 0.1]} radius={0.01} p={[0, PAD_TOP + 0.005, s * hd]} m={coping} cast={false} />
          </group>
        ))}
        <Box size={[POOL.w, 0.02, POOL.d]} p={[0, FLOOR_Y - 0.01, 0]} m={solid("#8fd3f0", 0.5)} cast={false} />
        {POOL.lanes.map((x) => (
          <Box key={x} size={[0.05, 0.004, POOL.d - 0.36]} p={[x, FLOOR_Y + 0.002, 0]} m={solid("#2f6bb8", 0.6)} cast={false} />
        ))}
        {/* lane ropes between the lanes: red/white floats */}
        {POOL.lanes.slice(1).map((x, k) => {
          const rx = (x + POOL.lanes[k]) / 2;
          return Array.from({ length: floats }, (_, i) => (
            <Cyl
              key={`${k}-${i}`} rad={0.016} h={ropeLen / floats - 0.006} low
              p={[rx, WATER_Y + 0.006, -ropeLen / 2 + (i + 0.5) * (ropeLen / floats)]} r={[Math.PI / 2, 0, 0]}
              m={solid(i % 3 === 0 ? "#ff5f5f" : i % 3 === 1 ? P.white : "#2f6bff", 0.6)} cast={false}
            />
          ));
        })}
        {/* ladder on the +x wall near the lounger end, outside the outer lane */}
        <Ladder x={hw - 0.04} z={hd - 0.5} />
        {/* lane numbers painted at the near end */}
        {POOL.lanes.map((x, i) => (
          <Box key={`n${x}`} size={[0.05 + i * 0.012, 0.004, 0.05]} p={[x, PAD_TOP + 0.022, hd + 0.0]} m={solid(ZONE_ACCENT.pool, 0.7)} cast={false} />
        ))}
      </group>
      {POOL.loungers.map((l, i) => <Lounger key={i} x={l.x} z={l.z} />)}
      {parasols.map((p, i) => (
        <Parasol key={`p${i}`} x={p.x} z={p.z} h={1.0} r={0.3} a={P.white} b={ZONE_ACCENT.pool} />
      ))}
      {/* side strips beside the basin and the front corners past the loungers; all inside the pad */}
      <Lifebuoy x={-2.3} z={-1.5} />
      <PottedPlant x={-2.4} z={-2.6} />
      <PottedPlant x={2.4} z={-2.6} />
      <PottedPlant x={-2.85} z={0.2} s={0.9} />
      <PottedPlant x={2.85} z={0.2} s={0.9} />
    </group>
  );
}

/** Soft caustic lines; tiled over the water and slid slowly. */
function causticCanvas(): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 128;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  ctx.fillStyle = "#c6ecfb";
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    const x = r() * 128, y = r() * 128, a = r() * Math.PI * 2, l = 18 + r() * 26;
    ctx.beginPath();
    // draw each stroke 9 times (offset ±128) so the texture tiles seamlessly
    for (const ox of [-128, 0, 128]) {
      for (const oy of [-128, 0, 128]) {
        ctx.moveTo(x + ox, y + oy);
        ctx.quadraticCurveTo(x + ox + Math.cos(a + 1) * l * 0.6, y + oy + Math.sin(a + 1) * l * 0.6, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      }
    }
    ctx.stroke();
  }
  return cv;
}

/** The water plane. Its shimmer (texture slide + night glow) updates only when on screen and the tab is visible. */
export function PoolWater() {
  const c = zoneCenter("pool");
  const pos = useMemo(() => new THREE.Vector3(c.x + POOL.x, WATER_Y, c.z + POOL.z), [c.x, c.z]);
  const sphere = useMemo(() => new THREE.Sphere(pos.clone(), Math.hypot(POOL.w, POOL.d) / 2), [pos]);
  const night = useRef(-1);
  const { geo, mat, tex } = useMemo(() => {
    const tex = new THREE.CanvasTexture(causticCanvas());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(POOL.w * 0.85, POOL.d * 0.85); // same caustic size at any basin size
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      color: "#56c4ef", map: tex, transparent: true, opacity: 0.84, roughness: 0.12, metalness: 0,
      emissive: "#2fa6e6", emissiveIntensity: 0, depthWrite: false
    });
    const geo = new THREE.PlaneGeometry(POOL.w - 0.08, POOL.d - 0.08).rotateX(-Math.PI / 2);
    return { geo, mat, tex };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); tex.dispose(); }, [geo, mat, tex]);

  useFrame(({ camera, clock }) => {
    if (!onScreen(camera, clock.elapsedTime, sphere)) return;
    const t = clock.elapsedTime;
    tex.offset.set(t * 0.018 + Math.sin(t * 0.7) * 0.02, t * 0.03);
    const n = getNightness();
    if (Math.abs(n - night.current) > 0.01) {
      night.current = n;
      mat.emissiveIntensity = 0.05 + 0.55 * n;
    }
  });

  return <mesh geometry={geo} material={mat} position={pos} receiveShadow renderOrder={1} />;
}
