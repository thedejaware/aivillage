"use client";

/**
 * The hobby garden: three raised plots (carrots, lettuce, tomatoes) at the
 * layout's GARDEN_PLOTS, a watering can, a crate of picked veg, a tool shed,
 * sunflowers and a low picket fence behind the beds.
 */
import * as THREE from "three";
import { GARDEN_PLOTS, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, decal, flatSlab, solid } from "../materials";
import { Ball, Box, Cone, Cyl, Ico, RBox } from "../parts";
import { GRASS_TOP, PAD_RADIUS } from "../scenery";
import { circleShape } from "./common";

const PLOT_W = 0.58;
const PLOT_D = 0.42;
const BED_H = 0.12;
const SOIL = "#8a6446";
const LEAF = "#6cc06a";
const LEAF_DARK = "#4fa356";

function RaisedBed({ children }: { children: React.ReactNode }) {
  const wood = solid(P.wood, 0.8);
  return (
    <group>
      {[-1, 1].map((s) => (
        <RBox key={`x${s}`} size={[PLOT_W, BED_H, 0.04]} radius={0.012} p={[0, BED_H / 2, s * (PLOT_D / 2 - 0.02)]} m={wood} />
      ))}
      {[-1, 1].map((s) => (
        <RBox key={`z${s}`} size={[0.04, BED_H, PLOT_D - 0.08]} radius={0.012} p={[s * (PLOT_W / 2 - 0.02), BED_H / 2, 0]} m={wood} />
      ))}
      <Box size={[PLOT_W - 0.07, 0.02, PLOT_D - 0.07]} p={[0, BED_H - 0.025, 0]} m={solid(SOIL, 0.95)} cast={false} />
      <group position={[0, BED_H - 0.015, 0]}>{children}</group>
    </group>
  );
}

function Carrots() {
  const orange = solid("#ff8a3d", 0.7);
  const leaf = solid(LEAF, 0.85, true);
  const out: React.ReactNode[] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 4; i++) {
      const x = -0.18 + i * 0.12, z = -0.08 + r * 0.16;
      out.push(
        <group key={`${r}${i}`} position={[x, 0, z]} rotation={[0, i * 1.3 + r, 0]}>
          <Cone rad={0.022} h={0.04} p={[0, 0.012, 0]} r={[Math.PI, 0, 0]} m={orange} />
          <Cone rad={0.012} h={0.08} p={[0.012, 0.07, 0]} r={[0, 0, -0.35]} m={leaf} />
          <Cone rad={0.012} h={0.09} p={[-0.012, 0.075, 0]} r={[0, 0, 0.35]} m={leaf} />
          <Cone rad={0.011} h={0.07} p={[0, 0.065, 0.012]} r={[0.35, 0, 0]} m={leaf} />
        </group>
      );
    }
  }
  return <>{out}</>;
}

function Lettuce() {
  const light = solid("#9be08a", 0.85, true);
  const dark = solid(LEAF, 0.85, true);
  const out: React.ReactNode[] = [];
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 3; i++) {
      const x = -0.16 + i * 0.16, z = -0.08 + r * 0.16;
      out.push(
        <group key={`${r}${i}`} position={[x, 0, z]}>
          <Ico rad={0.06} p={[0, 0.035, 0]} r={[0.2, i, 0.3]} scale={[1, 0.7, 1]} m={dark} />
          <Ico rad={0.04} p={[0, 0.06, 0]} r={[0.5, i * 2, 0]} m={light} />
        </group>
      );
    }
  }
  return <>{out}</>;
}

function Tomatoes() {
  const stake = solid(P.woodDark, 0.8);
  const leaf = solid(LEAF_DARK, 0.85, true);
  const red = solid("#ff4d4d", 0.45);
  return (
    <>
      {[-0.17, 0, 0.17].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl rad={0.008} h={0.36} p={[0, 0.18, 0]} m={stake} low />
          <Ico rad={0.07} p={[0, 0.12, 0]} r={[0.3, i, 0]} scale={[1, 1.3, 1]} m={leaf} />
          <Ico rad={0.05} p={[0.01, 0.25, 0.01]} r={[0, i * 2, 0.4]} m={leaf} />
          <Ball rad={0.026} p={[0.05, 0.1, 0.04]} m={red} low />
          <Ball rad={0.022} p={[-0.04, 0.17, 0.05]} m={red} low />
          <Ball rad={0.024} p={[0.03, 0.22, -0.05]} m={red} low />
          <Ball rad={0.02} p={[-0.05, 0.07, -0.04]} m={solid("#ffb547", 0.5)} low />
        </group>
      ))}
    </>
  );
}

function WateringCan({ x, z, rot }: { x: number; z: number; rot: number }) {
  const m = solid("#4fc3f7", 0.45);
  return (
    <group position={[x, GRASS_TOP, z]} rotation={[0, rot, 0]}>
      <Cyl rad={0.06} h={0.11} p={[0, 0.055, 0]} m={m} />
      <Cyl rad={0.01} h={0.14} p={[0.09, 0.08, 0]} r={[0, 0, -0.9]} m={m} low />
      <Cyl rad={0.02} h={0.02} p={[0.145, 0.125, 0]} r={[0, 0, -0.9]} m={m} low />
      <mesh geometry={cachedGeo("can-handle", () => new THREE.TorusGeometry(0.045, 0.008, 6, 12, Math.PI))} position={[-0.01, 0.11, 0]} material={m} castShadow />
    </group>
  );
}

function Crate({ x, z, rot }: { x: number; z: number; rot: number }) {
  const wood = solid(P.wood, 0.8);
  return (
    <group position={[x, GRASS_TOP, z]} rotation={[0, rot, 0]}>
      <RBox size={[0.24, 0.12, 0.17]} radius={0.015} p={[0, 0.06, 0]} m={wood} />
      <Box size={[0.25, 0.014, 0.18]} p={[0, 0.04, 0]} m={solid(P.woodDark, 0.8)} cast={false} />
      {[[-0.06, -0.03, "#ff8a3d"], [0.02, 0.04, "#ff4d4d"], [0.07, -0.04, "#9be08a"], [-0.05, 0.05, "#ff4d4d"], [0.0, -0.02, "#ff8a3d"]].map(([dx, dz, c], i) => (
        <Ball key={i} rad={0.032} p={[dx as number, 0.13, dz as number]} m={solid(c as string, 0.6)} cast={false} low />
      ))}
    </group>
  );
}

function Shed({ x, z, rot }: { x: number; z: number; rot: number }) {
  const wall = solid("#d9efd3", 0.85);
  const roof = solid("#5aa86b", 0.75);
  return (
    <group position={[x, GRASS_TOP, z]} rotation={[0, rot, 0]}>
      <RBox size={[0.46, 0.46, 0.36]} radius={0.03} p={[0, 0.23, 0]} m={wall} />
      <RBox size={[0.54, 0.05, 0.46]} radius={0.02} p={[0, 0.5, 0]} r={[0.18, 0, 0]} m={roof} />
      <RBox size={[0.16, 0.3, 0.02]} radius={0.01} p={[0.08, 0.16, 0.185]} m={solid(ZONE_ACCENT.garden, 0.7)} />
      <Box size={[0.012, 0.3, 0.022]} p={[0.08, 0.16, 0.192]} m={solid(P.white, 0.7)} cast={false} />
      {/* rake + spade leaning on the wall */}
      <Cyl rad={0.008} h={0.42} p={[-0.14, 0.2, 0.22]} r={[0.25, 0, 0]} m={solid(P.woodDark, 0.8)} low />
      <Box size={[0.1, 0.012, 0.02]} p={[-0.14, 0.41, 0.27]} m={solid(P.metal, 0.5)} />
      <Cyl rad={0.008} h={0.36} p={[-0.04, 0.18, 0.22]} r={[0.2, 0, 0]} m={solid(P.woodDark, 0.8)} low />
      <RBox size={[0.06, 0.08, 0.012]} radius={0.004} p={[-0.04, 0.03, 0.2]} m={solid(P.metal, 0.5)} />
    </group>
  );
}

function Sunflower({ x, z, h = 0.55 }: { x: number; z: number; h?: number }) {
  return (
    <group position={[x, GRASS_TOP, z]}>
      <Cyl rad={0.01} h={h} p={[0, h / 2, 0]} m={solid(LEAF_DARK, 0.8)} low />
      <Cone rad={0.04} h={0.02} p={[0.03, h * 0.5, 0]} r={[0, 0, -1.2]} m={solid(LEAF, 0.85, true)} />
      <Cyl rad={0.07} h={0.02} p={[0, h, 0.01]} r={[1.2, 0, 0]} m={solid("#ffd23f", 0.6)} />
      <Cyl rad={0.035} h={0.025} p={[0, h + 0.005, 0.015]} r={[1.2, 0, 0]} m={solid("#7a4a2a", 0.8)} />
    </group>
  );
}

/** Low picket fence on an arc behind the beds. */
function Fence({ r, a0, a1 }: { r: number; a0: number; a1: number }) {
  const white = solid(P.white, 0.7);
  const n = 18;
  const pickets: React.ReactNode[] = [];
  const rails: React.ReactNode[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pickets.push(<RBox key={i} size={[0.035, 0.17, 0.02]} radius={0.008} p={[Math.cos(a) * r, 0.085, Math.sin(a) * r]} r={[0, -a + Math.PI / 2, 0]} m={white} />);
    if (i < n) {
      const am = a + (a1 - a0) / n / 2;
      const len = 2 * r * Math.sin((a1 - a0) / n / 2);
      rails.push(<Box key={`r${i}`} size={[len, 0.02, 0.012]} p={[Math.cos(am) * r, 0.1, Math.sin(am) * r]} r={[0, -am + Math.PI / 2, 0]} m={white} />);
    }
  }
  return <group position={[0, GRASS_TOP, 0]}>{pickets}{rails}</group>;
}

export function Garden() {
  const zone = "garden";
  const c = zoneCenter(zone);
  const r = PAD_RADIUS[zone];
  const lawn = cachedGeo(`garden-lawn:${r}`, () => flatSlab(`garden-lawn-shape:${r}`, circleShape(r), GRASS_TOP));
  const ring = cachedGeo(`lawn-ring:${r}`, () => new THREE.RingGeometry(r - 0.07, r - 0.03, 64).rotateX(-Math.PI / 2));
  const crops = [<Carrots key="c" />, <Lettuce key="l" />, <Tomatoes key="t" />];
  return (
    <group position={[c.x, 0, c.z]}>
      <mesh geometry={lawn} material={solid("#cde8b5", 0.95)} receiveShadow />
      <mesh geometry={ring} material={decal(ZONE_ACCENT[zone], 0.55)} position={[0, GRASS_TOP + 0.003, 0]} />
      {GARDEN_PLOTS.map((p, i) => (
        <group key={i} position={[p.x, GRASS_TOP, p.z]}>
          <RaisedBed>{crops[i % crops.length]}</RaisedBed>
        </group>
      ))}
      {/* a soil path where the gardeners stand */}
      {GARDEN_PLOTS.map((p, i) => (
        <Box key={`path${i}`} size={[0.34, 0.006, 0.22]} p={[p.x, GRASS_TOP + 0.003, p.z - 0.4]} m={solid("#d9c3a2", 0.95)} cast={false} />
      ))}
      <Fence r={1.27} a0={0.22} a1={Math.PI - 0.22} />
      <Sunflower x={-1.18} z={0.3} />
      <Sunflower x={-1.08} z={0.5} h={0.48} />
      <Sunflower x={1.18} z={0.3} h={0.5} />
      <WateringCan x={-0.42} z={0.38} rot={0.6} />
      <Crate x={0.42} z={0.36} rot={-0.3} />
      <Shed x={-0.9} z={-0.68} rot={0.75} />
    </group>
  );
}
