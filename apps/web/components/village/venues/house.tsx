"use client";

/**
 * The shared house at the west end of the street: a cosy gabled cottage with
 * a lower side room on each side, turned to face its door spot, warm windows that glow at night, and a
 * floating 💤 sign above the roof while anyone sleeps inside.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { zoneCenter } from "../../../lib/village/layout";
import { P, cachedGeo, glow, solid } from "../materials";
import { Ball, Box, Bush, Cyl, RBox } from "../parts";
import { PAD_TOP } from "../scenery";
import { HOUSE_BODY, HOUSE_SCALE, HOUSE_WING } from "../decor";
import { VenuePad } from "./common";
import { onScreen, type PlacesSim } from "./visibility";

const WALL_H = 0.92;
const ROOF_H = 0.55;
const WALL = "#fff3e6";
const ROOF = "#7d6fe0";
const TRIM = "#ffffff";
const SHUTTER = "#9d91f2";

function Window({ x, y, z, ry = 0, w = 0.24, h = 0.24 }: { x: number; y: number; z: number; ry?: number; w?: number; h?: number }) {
  const lit = glow("#ffd58a", 0.12, 2.3);
  return (
    <group position={[x, y, z]} rotation={[0, ry, 0]}>
      <RBox size={[w + 0.06, h + 0.06, 0.03]} radius={0.012} p={[0, 0, 0.005]} m={solid(TRIM, 0.6)} />
      <Box size={[w, h, 0.02]} p={[0, 0, 0.018]} m={lit} cast={false} />
      <Box size={[0.012, h, 0.022]} p={[0, 0, 0.025]} m={solid(TRIM, 0.6)} cast={false} />
      <Box size={[w, 0.012, 0.022]} p={[0, 0, 0.025]} m={solid(TRIM, 0.6)} cast={false} />
      {[-1, 1].map((s) => (
        <RBox key={s} size={[0.07, h + 0.04, 0.02]} radius={0.008} p={[s * (w / 2 + 0.07), 0, 0.01]} m={solid(SHUTTER, 0.7)} />
      ))}
    </group>
  );
}

function FlowerBox({ x, y, z }: { x: number; y: number; z: number }) {
  return (
    <group position={[x, y, z]}>
      <RBox size={[0.28, 0.06, 0.07]} radius={0.015} p={[0, 0, 0]} m={solid(P.wood, 0.8)} />
      {[-0.09, -0.03, 0.03, 0.09].map((dx, i) => (
        <Ball key={dx} rad={0.028} p={[dx, 0.045, 0]} m={solid(i % 2 ? P.blanket : P.stage, 0.7)} cast={false} low />
      ))}
    </group>
  );
}

/** A gable end: the triangle under a roof whose ridge runs along x. */
function gableGeo(key: string, w: number, d: number, h: number): THREE.BufferGeometry {
  return cachedGeo(key, () => {
    const s = new THREE.Shape();
    s.moveTo(-d / 2, 0);
    s.lineTo(d / 2, 0);
    s.lineTo(0, h * (d / 2) / (d / 2 + 0.1));
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: w - 0.04, bevelEnabled: false });
    g.translate(0, 0, -(w - 0.04) / 2);
    g.rotateY(Math.PI / 2);
    return g;
  });
}

/** A side room on side `s` (−1 left, +1 right), in the house frame: lower walls and roof, its own windows. */
function Wing({ s }: { s: -1 | 1 }) {
  const { w, d, wallH, roofH } = HOUSE_WING;
  const mainW = 1.4 * HOUSE_SCALE, mainD = 1.1 * HOUSE_SCALE;
  const x = s * (mainW / 2 + w / 2 - 0.03);
  const z = -(mainD - d) / 2 + 0.04; // a little set back from the main front
  const slope = Math.atan2(roofH, d / 2 + 0.1);
  const slabLen = Math.hypot(roofH, d / 2 + 0.1) + 0.05;
  const wall = solid(WALL, 0.9);
  const roof = solid(ROOF, 0.7);
  const fz = d / 2;
  return (
    <group position={[x, 0, z]}>
      <RBox size={[w + 0.06, 0.1, d + 0.1]} radius={0.03} p={[0, 0.05, 0]} m={solid("#e7e1f2", 0.9)} />
      <RBox size={[w, wallH, d]} radius={0.05} p={[0, wallH / 2 + 0.05, 0]} m={wall} />
      <mesh geometry={gableGeo(`house-wing-gable:${w}:${d}:${roofH}`, w, d, roofH)} position={[0, wallH + 0.04, 0]} material={wall} castShadow receiveShadow />
      {[-1, 1].map((k) => (
        <RBox key={k} size={[w + 0.12, 0.06, slabLen]} radius={0.03} p={[s * 0.03, wallH + 0.05 + roofH / 2 + 0.02, k * (d / 4 + 0.03)]} r={[k * slope, 0, 0]} m={roof} />
      ))}
      <RBox size={[w + 0.12, 0.06, 0.08]} radius={0.03} p={[s * 0.03, wallH + roofH + 0.07, 0]} m={solid("#6a5cd0", 0.7)} />
      <Window x={0} y={0.48} z={fz} />
      <FlowerBox x={0} y={0.31} z={fz + 0.05} />
      <Window x={s * (w / 2)} y={0.48} z={0} ry={s * Math.PI / 2} />
      <Window x={0} y={0.48} z={-fz} ry={Math.PI} />
    </group>
  );
}

/** The cottage in its own frame: front (door) at +z. Drawn at its first size; House scales it up. */
function Cottage() {
  const w = 1.4, d = 1.1;
  const slope = Math.atan2(ROOF_H, d / 2 + 0.1);
  const slabLen = Math.hypot(ROOF_H, d / 2 + 0.1) + 0.06;
  const gable = gableGeo(`house-gable:${w}:${d}`, w, d, ROOF_H);
  const wall = solid(WALL, 0.9);
  const roof = solid(ROOF, 0.7);
  const wood = solid(P.wood, 0.75);
  const fz = d / 2;
  return (
    <group>
      <RBox size={[w + 0.1, 0.1, d + 0.1]} radius={0.03} p={[0, 0.05, 0]} m={solid("#e7e1f2", 0.9)} />
      <RBox size={[w, WALL_H, d]} radius={0.05} p={[0, WALL_H / 2 + 0.05, 0]} m={wall} />
      <mesh geometry={gable} position={[0, WALL_H + 0.04, 0]} material={wall} castShadow receiveShadow />
      {[-1, 1].map((s) => (
        <RBox key={s} size={[w + 0.18, 0.07, slabLen]} radius={0.03} p={[0, WALL_H + 0.05 + ROOF_H / 2 + 0.02, s * (d / 4 + 0.035)]} r={[s * slope, 0, 0]} m={roof} />
      ))}
      <RBox size={[w + 0.2, 0.07, 0.09]} radius={0.03} p={[0, WALL_H + ROOF_H + 0.08, 0]} m={solid("#6a5cd0", 0.7)} />
      {/* chimney */}
      <RBox size={[0.16, 0.42, 0.16]} radius={0.03} p={[-w * 0.28, WALL_H + ROOF_H - 0.02, -0.18]} m={solid("#e4c9b4", 0.85)} />
      <RBox size={[0.2, 0.05, 0.2]} radius={0.02} p={[-w * 0.28, WALL_H + ROOF_H + 0.2, -0.18]} m={solid("#d4b49c", 0.85)} />
      {/* round attic window in the front gable */}
      <Cyl rad={0.075} h={0.03} p={[0, WALL_H + 0.2, fz + 0.005]} r={[Math.PI / 2, 0, 0]} m={solid(TRIM, 0.6)} />
      <Cyl rad={0.055} h={0.03} p={[0, WALL_H + 0.2, fz + 0.012]} r={[Math.PI / 2, 0, 0]} m={glow("#ffd58a", 0.12, 2.3)} cast={false} />
      {/* door, step, porch light, mat */}
      <RBox size={[0.3, 0.5, 0.04]} radius={0.02} p={[0, 0.33, fz + 0.012]} m={solid(TRIM, 0.6)} />
      <RBox size={[0.24, 0.46, 0.04]} radius={0.02} p={[0, 0.32, fz + 0.025]} m={solid("#8a6ad8", 0.7)} />
      <Ball rad={0.014} p={[0.08, 0.31, fz + 0.05]} m={solid(P.stage, 0.4)} cast={false} low />
      <Box size={[0.1, 0.1, 0.012]} p={[0, 0.46, fz + 0.046]} m={glow("#ffd58a", 0.2, 2.3)} cast={false} />
      <RBox size={[0.42, 0.05, 0.14]} radius={0.015} p={[0, 0.025, fz + 0.07]} m={solid("#e7e1f2", 0.9)} />
      <Box size={[0.26, 0.006, 0.12]} p={[0, 0.053, fz + 0.075]} m={solid("#ff8fa3", 0.95)} cast={false} />
      <Box size={[0.02, 0.02, 0.08]} p={[0.22, 0.62, fz + 0.04]} m={solid(P.deepBlue, 0.5)} />
      <Ball rad={0.04} p={[0.22, 0.57, fz + 0.08]} m={glow(P.lampGlow, 0.5, 2.6)} cast={false} low />
      {/* windows: two at the front, one per side, two at the back */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <Window x={s * 0.42} y={0.55} z={fz} />
          <FlowerBox x={s * 0.42} y={0.38} z={fz + 0.05} />
          <Window x={s * (w / 2)} y={0.55} z={0} ry={s * Math.PI / 2} />
          <Window x={s * 0.35} y={0.55} z={-fz} ry={Math.PI} />
        </group>
      ))}
      {/* a bench by the front wall and a planter */}
      <group position={[0.48, 0, fz + 0.22]}>
        <RBox size={[0.3, 0.03, 0.12]} radius={0.01} p={[0, 0.19, 0]} m={wood} />
        <Box size={[0.03, 0.18, 0.1]} p={[-0.12, 0.09, 0]} m={wood} />
        <Box size={[0.03, 0.18, 0.1]} p={[0.12, 0.09, 0]} m={wood} />
      </group>
      <group position={[-0.55, 0, fz + 0.16]}>
        <Cyl rad={0.07} h={0.13} p={[0, 0.065, 0]} m={solid("#e4a07a", 0.8)} />
        <Ball rad={0.09} p={[0, 0.2, 0]} m={solid(P.foliage, 0.9, true)} low />
      </group>
    </group>
  );
}

export function House() {
  const zone = "home";
  const c = zoneCenter(zone);
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#f3f0fb" />
      <group position={[HOUSE_BODY.x, PAD_TOP, HOUSE_BODY.z]} rotation={[0, HOUSE_BODY.yaw, 0]}>
        <group scale={HOUSE_SCALE}>
          <Cottage />
        </group>
        <Wing s={-1} />
        <Wing s={1} />
        <Bush x={-HOUSE_BODY.w / 2 - 0.1} z={0.15} s={1.1} />
        <Bush x={HOUSE_BODY.w / 2 + 0.08} z={-0.25} s={0.9} rot={1.2} />
      </group>
    </group>
  );
}

// ---------------- the 💤 sign ----------------

function paintSleep(canvas: HTMLCanvasElement, count: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const r = H * 0.42;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(125,111,224,0.55)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (count > 1) ctx.roundRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84, r);
  else ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `${Math.round(H * 0.5)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  if (count > 1) {
    ctx.fillText("💤", W * 0.36, H * 0.54);
    ctx.fillStyle = "#5a4cc4";
    ctx.font = `800 ${Math.round(H * 0.42)}px Inter, system-ui, sans-serif`;
    ctx.fillText(`×${count}`, W * 0.7, H * 0.54);
  } else {
    ctx.fillText("💤", W / 2, H * 0.54);
  }
}

/** Floats above the roof while anyone sleeps inside; bobs gently only when on screen. */
export function SleepSign({ sim }: { sim?: PlacesSim | null }) {
  const c = zoneCenter("home");
  const base = useMemo(
    () => new THREE.Vector3(c.x + HOUSE_BODY.x, PAD_TOP + (WALL_H + ROOF_H) * HOUSE_SCALE + 0.55, c.z + HOUSE_BODY.z),
    [c.x, c.z]
  );
  const sphere = useMemo(() => new THREE.Sphere(base.clone(), 0.6), [base]);
  const sprite = useRef<THREE.Sprite>(null);
  const shown = useRef(-1);
  const { texture, material } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 96;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    return { texture, material };
  }, []);
  useEffect(() => () => { texture.dispose(); material.dispose(); }, [texture, material]);

  useFrame(({ camera, clock }) => {
    const s = sprite.current;
    if (!s) return;
    const n = typeof sim?.sleepingCount === "function" ? sim.sleepingCount() : 0;
    if (n !== shown.current) {
      shown.current = n;
      s.visible = n > 0;
      if (n > 0) {
        paintSleep(texture.image as HTMLCanvasElement, n);
        texture.needsUpdate = true;
        s.scale.set(n > 1 ? 0.72 : 0.42, 0.36, 1);
      }
    }
    if (n > 0 && onScreen(camera, clock.elapsedTime, sphere)) {
      s.position.set(base.x, base.y + Math.sin(clock.elapsedTime * 1.6) * 0.06, base.z);
    }
  });

  return <sprite ref={sprite} material={material} position={base} visible={false} renderOrder={3} />;
}
