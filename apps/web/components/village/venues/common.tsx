"use client";

/** Shared pieces for the places: pads, string lights, pennants, parasols. */
import { useMemo } from "react";
import * as THREE from "three";
import { zoneCenter, type Pt } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, decal, glow, solid } from "../materials";
import { Ball, Cyl, type V3 } from "../parts";
import { PAD_RADIUS, PAD_TOP } from "../scenery";

/** World point → coordinates relative to a zone's centre. */
export const local = (zone: string, p: Pt): Pt => {
  const c = zoneCenter(zone);
  return { x: p.x - c.x, z: p.z - c.z };
};

export function circleShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(0, 0, r, 0, Math.PI * 2, false);
  return s;
}

/** Round paved pad with a thin accent ring — the venue's "zone" decal. */
export function VenuePad({ zone, color, top = PAD_TOP }: { zone: string; color: string; top?: number }) {
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

export const BULB_COLORS = [P.lampGlow, P.blanket, "#9fd6ff", P.stage, "#a8e6be"];

/** A sagging wire with glowing bulbs between two points at height h. */
export function StringLights({ a, b, h, n = 8, sag = 0.22 }: { a: Pt; b: Pt; h: number; n?: number; sag?: number }) {
  const { curveGeo, bulbs } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const bulbs: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = h - sag * 4 * t * (1 - t);
      const p = new THREE.Vector3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t);
      pts.push(p);
      if (i > 0 && i < n) bulbs.push([p.x, y - 0.035, p.z]);
    }
    const curveGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.006, 4, false);
    return { curveGeo, bulbs };
  }, [a, b, h, n, sag]);
  return (
    <group>
      <mesh geometry={curveGeo} material={solid(P.muted, 0.6)} />
      {bulbs.map((p, i) => (
        <Ball key={i} rad={0.032} p={p} m={glow(BULB_COLORS[i % BULB_COLORS.length], 0.6, 2.6)} cast={false} low />
      ))}
    </group>
  );
}

const PENNANT_COLORS = ["#ff7a8a", "#ffd27a", "#4fc3f7", "#7cc79a", "#b9a5ff"];

/** A line of little triangle flags between two points (heights ha, hb). */
export function Pennants({ a, b, ha, hb, n = 9 }: { a: Pt; b: Pt; ha: number; hb: number; n?: number }) {
  const flag = cachedGeo("pennant", () => {
    const s = new THREE.Shape();
    s.moveTo(-0.045, 0);
    s.lineTo(0.045, 0);
    s.lineTo(0, -0.1);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false });
    g.translate(0, 0, -0.003);
    return g;
  });
  const { wire, flags } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const flags: { p: V3; yaw: number }[] = [];
    const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const y = ha + (hb - ha) * t - 0.12 * 4 * t * (1 - t);
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t));
      if (i > 0 && i < n) flags.push({ p: [a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t], yaw });
    }
    return { wire: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.005, 4, false), flags };
  }, [a, b, ha, hb, n]);
  return (
    <group>
      <mesh geometry={wire} material={solid(P.muted, 0.6)} />
      {flags.map((f, i) => (
        <mesh key={i} geometry={flag} position={f.p} rotation={[0, f.yaw, 0]} material={solid(PENNANT_COLORS[i % PENNANT_COLORS.length], 0.7)} castShadow />
      ))}
    </group>
  );
}

/** Two-tone patio umbrella standing on the ground at (x, z). */
export function Parasol({ x, z, y = PAD_TOP, h = 1.05, r = 0.36, a = P.white, b = P.cafeRoof }: { x: number; z: number; y?: number; h?: number; r?: number; a?: string; b?: string }) {
  const canopy = cachedGeo("parasol", () => new THREE.ConeGeometry(1, 1, 8, 1, true).translate(0, 0.5, 0));
  const inner = cachedGeo("parasol-inner", () => new THREE.ConeGeometry(1, 1, 8, 1, false).translate(0, 0.5, 0));
  return (
    <group position={[x, y, z]}>
      <Cyl rad={0.07} h={0.03} p={[0, 0.015, 0]} m={solid(P.metal, 0.5)} />
      <Cyl rad={0.014} h={h} p={[0, h / 2, 0]} m={solid(P.white, 0.5)} low />
      <mesh geometry={inner} position={[0, h - 0.17, 0]} scale={[r, 0.17, r]} material={solid(a, 0.75)} castShadow />
      <mesh geometry={canopy} position={[0, h - 0.1, 0]} scale={[r * 0.55, 0.1, r * 0.55]} rotation={[0, Math.PI / 8, 0]} material={solid(b, 0.75)} castShadow />
      <Ball rad={0.022} p={[0, h + 0.01, 0]} m={solid(b, 0.6)} cast={false} low />
    </group>
  );
}
