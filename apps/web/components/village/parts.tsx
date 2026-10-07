"use client";

/**
 * Small reusable low-poly parts (boxes, trees, lamps, benches, flower beds).
 * Positions are mesh centres unless a prop says otherwise; geometry comes from
 * the shared cache in materials.ts.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { P, FLOWER_COLORS, glow, roundedBox, solid, unit } from "./materials";

export type V3 = [number, number, number];

interface MeshBits {
  p?: V3;
  r?: V3;
  m: THREE.Material;
  cast?: boolean;
  receive?: boolean;
}

export function Box({ size, p, r, m, cast = true, receive = true }: MeshBits & { size: V3 }) {
  return <mesh geometry={unit.box()} scale={size} position={p} rotation={r} material={m} castShadow={cast} receiveShadow={receive} />;
}

export function RBox({ size, radius = 0.03, p, r, m, cast = true, receive = true }: MeshBits & { size: V3; radius?: number }) {
  return (
    <mesh
      geometry={roundedBox(size[0], size[1], size[2], radius)}
      position={p} rotation={r} material={m} castShadow={cast} receiveShadow={receive}
    />
  );
}

/** Cylinder of radius `rad` and height `h`; `low` uses 8 sides (trunks, poles). */
export function Cyl({ rad, h, p, r, m, cast = true, receive = true, low = false }: MeshBits & { rad: number; h: number; low?: boolean }) {
  return (
    <mesh
      geometry={low ? unit.cyl8() : unit.cyl()} scale={[rad, h, rad]}
      position={p} rotation={r} material={m} castShadow={cast} receiveShadow={receive}
    />
  );
}

export function Ball({ rad, p, m, cast = true, scale }: MeshBits & { rad: number; scale?: V3 }) {
  return (
    <mesh
      geometry={unit.ball()} scale={scale ? [rad * scale[0], rad * scale[1], rad * scale[2]] : rad}
      position={p} material={m} castShadow={cast}
    />
  );
}

export function Ico({ rad, p, r, m, scale }: MeshBits & { rad: number; scale?: V3 }) {
  return (
    <mesh
      geometry={unit.ico()} scale={scale ? [rad * scale[0], rad * scale[1], rad * scale[2]] : rad}
      position={p} rotation={r} material={m} castShadow receiveShadow
    />
  );
}

export function Cone({ rad, h, p, r, m }: MeshBits & { rad: number; h: number }) {
  return <mesh geometry={unit.cone()} scale={[rad, h, rad]} position={p} rotation={r} material={m} castShadow receiveShadow />;
}

export type TreeKind = "round" | "pine" | "tall";

/** Low-poly tree standing on the ground at (x, y, z). */
export function Tree({ x, z, y = 0, s = 1, kind = "round", rot = 0 }: { x: number; z: number; y?: number; s?: number; kind?: TreeKind; rot?: number }) {
  const trunk = solid(P.wood);
  const leaf = solid(P.foliage, 0.9, true);
  const leafDark = solid(P.foliageDark, 0.9, true);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]} scale={s}>
      <Cyl rad={0.045} h={0.4} p={[0, 0.2, 0]} m={trunk} low />
      {kind === "round" && (
        <>
          <Ico rad={0.3} p={[0, 0.58, 0]} m={leaf} scale={[1, 0.92, 1]} />
          <Ico rad={0.18} p={[0.12, 0.82, -0.06]} r={[0.4, 0.6, 0]} m={leafDark} />
        </>
      )}
      {kind === "pine" && (
        <>
          <Cone rad={0.3} h={0.45} p={[0, 0.5, 0]} m={leafDark} />
          <Cone rad={0.22} h={0.38} p={[0, 0.78, 0]} r={[0, 0.4, 0]} m={leafDark} />
          <Cone rad={0.13} h={0.28} p={[0, 1.0, 0]} r={[0, 0.8, 0]} m={leaf} />
        </>
      )}
      {kind === "tall" && (
        <>
          <Ico rad={0.22} p={[0, 0.62, 0]} m={leaf} scale={[1, 1.6, 1]} />
          <Ico rad={0.12} p={[0.06, 0.98, 0.04]} m={leafDark} />
        </>
      )}
    </group>
  );
}

/** Cluster of 2–3 soft bush blobs. */
export function Bush({ x, z, y = 0, s = 1, rot = 0 }: { x: number; z: number; y?: number; s?: number; rot?: number }) {
  const leaf = solid(P.foliage, 0.9, true);
  const leafDark = solid(P.foliageDark, 0.9, true);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]} scale={s}>
      <Ico rad={0.16} p={[0, 0.12, 0]} m={leaf} scale={[1.15, 0.85, 1]} />
      <Ico rad={0.11} p={[0.15, 0.09, 0.05]} r={[0.3, 0.5, 0]} m={leafDark} />
      <Ico rad={0.09} p={[-0.13, 0.07, 0.07]} r={[0.6, 0.2, 0]} m={leaf} />
    </group>
  );
}

/** Street lamp; the head glows brighter at night. */
export function LampPost({ x, z, y = 0, h = 0.95 }: { x: number; z: number; y?: number; h?: number }) {
  const pole = solid(P.deepBlue, 0.55);
  return (
    <group position={[x, y, z]}>
      <RBox size={[0.11, 0.06, 0.11]} radius={0.02} p={[0, 0.03, 0]} m={pole} />
      <Cyl rad={0.02} h={h} p={[0, h / 2, 0]} m={pole} low />
      <Ball rad={0.065} p={[0, h + 0.05, 0]} m={glow(P.lampGlow, 0.45, 2.4)} cast={false} />
      <Cone rad={0.085} h={0.07} p={[0, h + 0.125, 0]} m={pole} />
    </group>
  );
}

/** Two-slat park bench, seat facing +z. */
export function ParkBench({ x, z, y = 0, rot = 0, w = 0.7 }: { x: number; z: number; y?: number; rot?: number; w?: number }) {
  const wood = solid(P.wood, 0.75);
  const frame = solid(P.deepBlue, 0.55);
  return (
    <group position={[x, y, z]} rotation={[0, rot, 0]}>
      {[-0.08, 0.0, 0.08].map((dz) => (
        <RBox key={dz} size={[w, 0.03, 0.07]} radius={0.012} p={[0, 0.22, dz]} m={wood} />
      ))}
      <RBox size={[w, 0.06, 0.025]} radius={0.01} p={[0, 0.33, -0.13]} r={[-0.12, 0, 0]} m={wood} />
      <RBox size={[w, 0.06, 0.025]} radius={0.01} p={[0, 0.42, -0.14]} r={[-0.12, 0, 0]} m={wood} />
      {[-1, 1].map((sx) => (
        <group key={sx} position={[sx * (w / 2 - 0.06), 0, 0]}>
          <Box size={[0.03, 0.21, 0.03]} p={[0, 0.105, 0.09]} m={frame} />
          <Box size={[0.03, 0.42, 0.03]} p={[0, 0.21, -0.12]} m={frame} />
          <Box size={[0.03, 0.03, 0.26]} p={[0, 0.2, -0.01]} m={frame} />
        </group>
      ))}
    </group>
  );
}

/** Raised wooden bed with a sprinkle of flowers. */
export function FlowerBed({ x, z, w = 0.6, d = 0.3, seed = 1, rot = 0 }: { x: number; z: number; w?: number; d?: number; seed?: number; rot?: number }) {
  const n = Math.max(3, Math.round(w * d * 40));
  const flowers: { x: number; z: number; c: string }[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
    const b = Math.sin(seed * 39.3468 + i * 11.135) * 24634.6345;
    flowers.push({
      x: ((a - Math.floor(a)) - 0.5) * (w - 0.12),
      z: ((b - Math.floor(b)) - 0.5) * (d - 0.1),
      c: FLOWER_COLORS[(i + seed) % FLOWER_COLORS.length]
    });
  }
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <RBox size={[w, 0.09, d]} radius={0.03} p={[0, 0.045, 0]} m={solid(P.wood, 0.8)} />
      <Box size={[w - 0.06, 0.02, d - 0.06]} p={[0, 0.09, 0]} m={solid(P.foliageDark, 0.95)} cast={false} />
      {flowers.map((f, i) => (
        <Ball key={i} rad={0.028} p={[f.x, 0.125, f.z]} m={solid(f.c, 0.6)} cast={false} />
      ))}
    </group>
  );
}

const BATCH_ATTRS = ["position", "normal", "uv"] as const;

/**
 * Renders static children once, then replaces them with one merged mesh per
 * material (and shadow flags) — hundreds of props become a few draw calls.
 * Children must be plain meshes: no lights, Html, refs or animation.
 */
export function StaticBatch({ children }: { children: ReactNode }) {
  const src = useRef<THREE.Group>(null);
  const [merged, setMerged] = useState<THREE.Mesh[] | null>(null);

  useLayoutEffect(() => {
    const g = src.current;
    if (!g) return;
    g.updateWorldMatrix(true, true);
    const inv = g.matrixWorld.clone().invert();
    const buckets = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
    const local = new THREE.Matrix4();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const name of Object.keys(geo.attributes)) {
        if (!(BATCH_ATTRS as readonly string[]).includes(name)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.uv) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.clearGroups();
      geo.applyMatrix4(local.multiplyMatrices(inv, m.matrixWorld));
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
      let b = buckets.get(key);
      if (!b) {
        b = { mat: m.material, cast: m.castShadow, receive: m.receiveShadow, geos: [] };
        buckets.set(key, b);
      }
      b.geos.push(geo);
    });
    const out: THREE.Mesh[] = [];
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geos, false);
      for (const x of b.geos) x.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, b.mat);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      out.push(mesh);
    }
    setMerged(out);
    return () => {
      for (const mesh of out) mesh.geometry.dispose();
    };
  }, []);

  return (
    <group>
      {merged ? merged.map((m) => <primitive key={m.uuid} object={m} />) : <group ref={src}>{children}</group>}
    </group>
  );
}
