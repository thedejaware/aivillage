"use client";

/**
 * The open-air cinema: a big screen at CINEMA.screen facing two rows of five
 * seats (seat tops at SEAT_Y.cinema), string lights, a projector post with a
 * faint beam, and a popcorn cart. The screen shows simple moving abstract
 * colours and shapes (no films): a 300×160 canvas (same aspect as the 3.0×1.6
 * screen) redrawn ~10 times a second, only while the screen is on screen and
 * the tab is visible.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CINEMA, SPOTS, zoneCenter, type Pt } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, beam, cachedGeo, glow, solid } from "../materials";
import { Ball, Box, Cyl, RBox } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { StringLights, VenuePad, local } from "./common";
import { onScreen } from "./visibility";

const SCREEN_BOTTOM = 0.55;
const FRAME = "#24304a";
const SEAT_RED = "#e0457b";
/** Height of the light-string poles; the strings hang just below the top. */
const POLE_H = 1.5;

/** Folding cinema seat facing +z; cushion top at SEAT_Y.cinema. */
function CinemaSeat({ x, z }: { x: number; z: number }) {
  const frame = solid(FRAME, 0.5);
  const red = solid(SEAT_RED, 0.75);
  const top = SEAT_Y.cinema - PAD_TOP;
  return (
    <group position={[x, PAD_TOP, z]}>
      <RBox size={[0.24, 0.05, 0.22]} radius={0.018} p={[0, top - 0.025, 0.01]} m={red} />
      <RBox size={[0.24, 0.26, 0.05]} radius={0.02} p={[0, top + 0.12, -0.11]} r={[-0.12, 0, 0]} m={red} />
      {[-1, 1].map((s) => (
        <group key={s}>
          <Box size={[0.03, top + 0.08, 0.2]} p={[s * 0.14, (top + 0.08) / 2, -0.01]} m={frame} />
          <RBox size={[0.045, 0.03, 0.22]} radius={0.01} p={[s * 0.14, top + 0.09, 0]} m={frame} />
        </group>
      ))}
      {/* cup holder on the right arm */}
      <Cyl rad={0.025} h={0.03} p={[0.14, top + 0.115, 0.08]} m={frame} />
    </group>
  );
}

function PopcornCart({ x, z, rot }: { x: number; z: number; rot: number }) {
  const red = solid("#ff5f5f", 0.7);
  const white = solid(P.white, 0.7);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, rot, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={cachedGeo("cart-wheel", () => new THREE.TorusGeometry(0.07, 0.015, 6, 14))} position={[s * 0.19, 0.08, 0]} rotation={[0, Math.PI / 2, 0]} material={solid(FRAME, 0.5)} castShadow />
      ))}
      <RBox size={[0.36, 0.28, 0.26]} radius={0.03} p={[0, 0.27, 0]} m={red} />
      {[-0.12, 0, 0.12].map((dx) => <Box key={dx} size={[0.06, 0.28, 0.265]} p={[dx, 0.27, 0]} m={white} cast={false} />)}
      <Box size={[0.32, 0.22, 0.22]} p={[0, 0.52, 0]} m={solid("#fff6d8", 0.3)} />
      {Array.from({ length: 9 }, (_, i) => (
        <Ball key={i} rad={0.035} p={[-0.1 + (i % 3) * 0.1, 0.46 + Math.floor(i / 3) * 0.05, -0.05 + ((i * 7) % 3) * 0.05]} m={solid("#ffe08a", 0.8)} cast={false} low />
      ))}
      <RBox size={[0.42, 0.04, 0.32]} radius={0.015} p={[0, 0.66, 0]} m={red} />
      <Cyl rad={0.012} h={0.2} p={[0, 0.78, 0]} m={white} low />
      <Ball rad={0.05} p={[0, 0.9, 0]} m={glow(P.lampGlow, 0.5, 2.4)} cast={false} low />
      {/* a few tubs on the counter */}
      {[-0.11, 0.11].map((dx) => (
        <group key={dx} position={[dx, 0.68, 0.11]}>
          <Cyl rad={0.03} h={0.06} p={[0, 0.03, 0]} m={red} />
          <Ball rad={0.028} p={[0, 0.065, 0]} m={solid("#ffe08a", 0.8)} cast={false} low />
        </group>
      ))}
    </group>
  );
}

/** Projector on a post behind the seats, beaming at the screen (the beam shows mostly at night). */
function Projector({ at, target }: { at: Pt; target: THREE.Vector3 }) {
  const y = 0.95;
  const { pos, quat, len } = useMemo(() => {
    const a = new THREE.Vector3(at.x, PAD_TOP + y, at.z + 0.1);
    const dir = target.clone().sub(a);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    return { pos: a.clone().add(target).multiplyScalar(0.5), quat, len };
  }, [at, target]);
  const pyramid = cachedGeo("projector-beam", () => new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4));
  const frame = solid(FRAME, 0.5);
  return (
    <group>
      <group position={[at.x, PAD_TOP, at.z]}>
        <RBox size={[0.16, 0.05, 0.16]} radius={0.02} p={[0, 0.025, 0]} m={frame} />
        <Cyl rad={0.02} h={y - 0.06} p={[0, (y - 0.06) / 2, 0]} m={frame} low />
        <RBox size={[0.16, 0.1, 0.2]} radius={0.025} p={[0, y, 0]} m={solid("#3a4558", 0.5)} />
        <Cyl rad={0.035} h={0.04} p={[0, y, 0.11]} r={[Math.PI / 2, 0, 0]} m={glow("#fff3c4", 0.8, 3)} cast={false} />
        {[-0.045, 0.045].map((dx) => <Cyl key={dx} rad={0.045} h={0.02} p={[dx, y + 0.1, -0.02]} r={[0, 0, Math.PI / 2]} m={frame} />)}
      </group>
      <mesh geometry={pyramid} position={pos} quaternion={quat} scale={[CINEMA.screen.w * 0.42, len, CINEMA.screen.h * 0.42]} material={beam("#fff3c4", 0.015, 0.07)} />
    </group>
  );
}

/** Screen frame + legs (static). The picture itself is <CinemaScreen/>. */
export function CinemaStatic() {
  const zone = "cinema";
  const c = zoneCenter(zone);
  const S = CINEMA.screen;
  const frame = solid(FRAME, 0.5);
  const seats = SPOTS.filter((s) => s.zone === zone && s.kind === "cinema").map((s) => ({ ...local(zone, s), id: s.id }));
  const midY = SCREEN_BOTTOM + S.h / 2;
  const target = useMemo(() => new THREE.Vector3(c.x + S.x, midY, c.z + S.z - 0.04), [c.x, c.z, S.x, S.z, midY]);
  // fixed props (local): outside the seat block, clear of the road (x = 0, −z), inside the pad
  const backPoles: Pt[] = [{ x: -1.75, z: -0.3 }, { x: 1.75, z: -0.3 }];
  const top = SCREEN_BOTTOM + S.h + 0.05;
  return (
    <group>
      <group position={[c.x, 0, c.z]}>
        <VenuePad zone={zone} color="#f4eefb" />
        {/* screen frame, legs and braces */}
        <group position={[S.x, PAD_TOP, S.z]}>
          <RBox size={[S.w + 0.14, S.h + 0.14, 0.06]} radius={0.03} p={[0, midY - PAD_TOP, 0]} m={frame} />
          {[-1, 1].map((s) => (
            <group key={s} position={[s * (S.w / 2 + 0.02), 0, 0]}>
              <Box size={[0.07, midY + 0.1, 0.07]} p={[0, (midY + 0.1) / 2, 0.06]} m={frame} />
              <Box size={[0.05, 0.9, 0.05]} p={[0, 0.42, 0.3]} r={[-0.55, 0, 0]} m={frame} />
              <RBox size={[0.16, 0.05, 0.5]} radius={0.02} p={[0, 0.025, 0.2]} m={frame} />
            </group>
          ))}
          <Box size={[S.w + 0.14, 0.05, 0.02]} p={[0, SCREEN_BOTTOM - 0.12, -0.03]} m={solid(ZONE_ACCENT.cinema, 0.6)} cast={false} />
          {/* bulbs along the frame top (~0.27 apart, whatever the width) */}
          {Array.from({ length: 12 }, (_, i) => (
            <Ball key={i} rad={0.025} p={[-S.w / 2 + (i * S.w) / 11, top - PAD_TOP + 0.03, -0.035]} m={glow(P.lampGlow, 0.6, 2.6)} cast={false} low />
          ))}
        </group>
        {seats.map((s) => <CinemaSeat key={s.id} x={s.x} z={s.z} />)}
        {/* a low step under each row */}
        {CINEMA.rows.map((rz) => (
          <Box key={rz} size={[CINEMA.seatsX[CINEMA.seatsX.length - 1] - CINEMA.seatsX[0] + 0.4, 0.01, 0.3]} p={[0, PAD_TOP + 0.005, rz]} m={solid("#e6dcf5", 0.9)} cast={false} />
        ))}
        <PopcornCart x={-1.5} z={-1.1} rot={0.7} />
        {backPoles.map((p, i) => (
          <group key={i} position={[p.x, PAD_TOP, p.z]}>
            <Cyl rad={0.02} h={POLE_H} p={[0, POLE_H / 2, 0]} m={frame} low />
            <Ball rad={0.028} p={[0, POLE_H + 0.01, 0]} m={frame} cast={false} low />
          </group>
        ))}
        <StringLights a={backPoles[0]} b={{ x: S.x - S.w / 2 - 0.02, z: S.z }} h={PAD_TOP + POLE_H - 0.02} n={11} sag={0.2} />
        <StringLights a={backPoles[1]} b={{ x: S.x + S.w / 2 + 0.02, z: S.z }} h={PAD_TOP + POLE_H - 0.02} n={11} sag={0.2} />
        <StringLights a={backPoles[0]} b={backPoles[1]} h={PAD_TOP + POLE_H - 0.02} n={13} sag={0.17} />
      </group>
      <Projector at={{ x: c.x + 0.95, z: c.z - 0.6 }} target={target} />
    </group>
  );
}

// ---------------- the picture ----------------

const W = 300; // 300×160 matches the 3.0×1.6 screen, so shapes are not stretched
const H = 160;
const HUES = Array.from({ length: 72 }, (_, i) => `hsl(${i * 5}, 72%, 62%)`);
const DEEP = Array.from({ length: 72 }, (_, i) => `hsl(${i * 5}, 55%, 22%)`);
const hueAt = (deg: number) => ((Math.round(deg / 5) % 72) + 72) % 72;

/** One frame of drifting abstract shapes. No allocations besides the canvas calls. */
function paintScreen(ctx: CanvasRenderingContext2D, t: number): void {
  const base = t * 14;
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.fillStyle = DEEP[hueAt(base + 200)];
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  // big soft colour fields
  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 3; i++) {
    const x = W * (0.5 + 0.38 * Math.sin(t * (0.21 + i * 0.07) + i * 2.1));
    const y = H * (0.5 + 0.35 * Math.cos(t * (0.17 + i * 0.05) + i));
    ctx.fillStyle = HUES[hueAt(base + i * 120)];
    ctx.beginPath();
    ctx.arc(x, y, 54 + 15 * Math.sin(t * 0.6 + i), 0, Math.PI * 2);
    ctx.fill();
  }
  // crisp shapes: squares, triangles and rings that spin and drift
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 5; i++) {
    const x = W * (0.5 + 0.42 * Math.sin(t * (0.33 + i * 0.09) + i * 1.3));
    const y = H * (0.5 + 0.4 * Math.sin(t * (0.27 + i * 0.11) + i * 2.4));
    const s = 11 + 7 * Math.sin(t * 0.9 + i * 1.7);
    const a = t * (0.6 + i * 0.2);
    ctx.fillStyle = HUES[hueAt(base * 1.5 + i * 72 + 40)];
    ctx.strokeStyle = ctx.fillStyle;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.beginPath();
    if (i % 3 === 0) ctx.rect(-s, -s, s * 2, s * 2);
    else if (i % 3 === 1) { ctx.moveTo(0, -s * 1.3); ctx.lineTo(s * 1.15, s * 0.7); ctx.lineTo(-s * 1.15, s * 0.7); ctx.closePath(); }
    if (i % 3 === 2) { ctx.lineWidth = 4; ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke(); }
    else ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
}

/** The moving picture on both faces of the screen (the default camera sees the back). */
export function CinemaScreen() {
  const c = zoneCenter("cinema");
  const S = CINEMA.screen;
  const midY = SCREEN_BOTTOM + S.h / 2;
  const center = useMemo(() => new THREE.Vector3(c.x + S.x, midY, c.z + S.z), [c.x, c.z, S.x, S.z, midY]);
  const sphere = useMemo(() => new THREE.Sphere(center.clone(), Math.hypot(S.w, S.h) / 2 + 0.1), [center, S.w, S.h]);
  const last = useRef(-1);
  const { tex, mat, ctx } = useMemo(() => {
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (ctx) paintScreen(ctx, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    return { tex, mat, ctx };
  }, []);
  const geo = cachedGeo(`screen:${S.w}:${S.h}`, () => new THREE.PlaneGeometry(S.w, S.h));
  useEffect(() => () => { tex.dispose(); mat.dispose(); }, [tex, mat]);

  useFrame(({ camera, clock }) => {
    if (!ctx) return;
    const t = clock.elapsedTime;
    if (t - last.current < 0.1) return; // ~10 fps is plenty for slow shapes
    if (!onScreen(camera, t, sphere)) return;
    last.current = t;
    paintScreen(ctx, t);
    tex.needsUpdate = true;
  });

  return (
    <group position={center}>
      {/* front faces the seats (−z), back faces the street side (+z) */}
      <mesh geometry={geo} material={mat} position={[0, 0, -0.035]} rotation={[0, Math.PI, 0]} />
      <mesh geometry={geo} material={mat} position={[0, 0, 0.035]} />
    </group>
  );
}
