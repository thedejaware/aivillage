"use client";

/**
 * The bike rack by the house: a rack with hoops (static) and four bikes at
 * BIKE_SLOTS drawn as three instanced meshes. Bikes being ridden are hidden
 * (riders draw their own bike); the instance list is rewritten only when the
 * number of bikes out changes.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useFrame } from "@react-three/fiber";
import { BIKE_SLOTS, SPOTS, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, cachedGeo, solid } from "../materials";
import { Ball, Box, Cyl, RBox } from "../parts";
import { PAD_TOP } from "../scenery";
import { bikesShown } from "../decor";
import { VenuePad } from "./common";
import type { PlacesSim } from "./visibility";

const WHEEL_R = 0.1;
const BIKE_COLORS = ["#ff7a8a", "#4fc3f7", "#ffd27a", "#7cc79a"];
/** Bikes point toward the street (−z), as their spots face. */
const BIKE_YAW = Math.PI;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.BufferGeometry {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 6, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/** One bike (front at +z, wheels on the ground at y = 0), split by material. */
function bikeParts() {
  const R = V(0, WHEEL_R, -0.17), F = V(0, WHEEL_R, 0.17), B = V(0, WHEEL_R, -0.02);
  const S = V(0, 0.29, -0.07), H = V(0, 0.29, 0.11), Hb = V(0, 0.21, 0.13), stem = V(0, 0.34, 0.1);
  const frame = [
    tube(R, B, 0.008), tube(R, S, 0.007), tube(B, S, 0.01), tube(S, H, 0.01), tube(B, Hb, 0.011), tube(Hb, F, 0.008),
    tube(H, Hb, 0.012), tube(H, stem, 0.008), tube(V(-0.09, 0.34, 0.09), V(0.09, 0.34, 0.09), 0.007)
  ];
  const dark: THREE.BufferGeometry[] = [];
  for (const z of [R.z, F.z]) {
    const w = new THREE.TorusGeometry(WHEEL_R - 0.012, 0.012, 5, 18);
    w.rotateY(Math.PI / 2);
    w.translate(0, WHEEL_R, z);
    dark.push(w);
    dark.push(tube(V(-0.01, WHEEL_R, z), V(0.01, WHEEL_R, z), 0.018)); // hub
  }
  const saddle = new THREE.BoxGeometry(0.05, 0.02, 0.1);
  saddle.translate(S.x, S.y + 0.02, S.z - 0.01);
  dark.push(saddle);
  for (const x of [-0.09, 0.09]) dark.push(tube(V(x, 0.34, 0.09), V(x * 1.35, 0.34, 0.09), 0.012));
  const basket = new THREE.BoxGeometry(0.11, 0.07, 0.08);
  basket.translate(0, 0.33, 0.2);
  const clean = (list: THREE.BufferGeometry[]) => {
    const g = mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)));
    for (const x of list) x.dispose();
    return g;
  };
  return { frame: clean(frame), dark: clean(dark), basket: clean([basket]) };
}

/** Static rack: a ground rail and one hoop beside each slot's rear wheel. */
export function BikeRack() {
  const zone = "bike_rack";
  const c = zoneCenter(zone);
  const steel = solid("#c4cfdd", 0.35);
  const hoop = cachedGeo("bike-hoop", () => new THREE.TorusGeometry(0.12, 0.013, 6, 14, Math.PI).rotateY(Math.PI / 2));
  const rearZ = BIKE_SLOTS[0].z - Math.cos(BIKE_YAW) * 0.17;
  const xs = BIKE_SLOTS.map((s) => s.x);
  const x0 = Math.min(...xs) - 0.2, x1 = Math.max(...xs) + 0.2;
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={zone} color="#eaf6f8" />
      <Box size={[x1 - x0, 0.03, 0.05]} p={[(x0 + x1) / 2, PAD_TOP + 0.015, rearZ]} m={steel} />
      {BIKE_SLOTS.map((s, i) => (
        <mesh key={i} geometry={hoop} position={[s.x + 0.075, PAD_TOP + 0.02, rearZ - 0.02]} material={steel} castShadow receiveShadow />
      ))}
      {/* sign post with a bike icon board */}
      <group position={[x1 + 0.12, PAD_TOP, rearZ - 0.15]}>
        <Cyl rad={0.016} h={0.75} p={[0, 0.375, 0]} m={solid(P.deepBlue, 0.5)} low />
        <RBox size={[0.26, 0.2, 0.03]} radius={0.04} p={[0, 0.72, 0]} m={solid(ZONE_ACCENT.bike_rack, 0.6)} />
        {[-0.055, 0.055].map((x) => (
          <mesh key={x} geometry={cachedGeo("sign-wheel", () => new THREE.TorusGeometry(0.035, 0.008, 5, 12))} position={[x, 0.7, 0.018]} material={solid(P.white, 0.6)} />
        ))}
        <Box size={[0.08, 0.012, 0.01]} p={[0, 0.73, 0.018]} r={[0, 0, 0.5]} m={solid(P.white, 0.6)} cast={false} />
      </group>
      {/* bike pump */}
      <group position={[x0 - 0.12, PAD_TOP, rearZ - 0.1]}>
        <Cyl rad={0.03} h={0.3} p={[0, 0.15, 0]} m={solid(ZONE_ACCENT.bike_rack, 0.5)} low />
        <Box size={[0.1, 0.02, 0.02]} p={[0, 0.31, 0]} m={solid(P.deepBlue, 0.5)} />
        <Ball rad={0.04} p={[0, 0.02, 0]} m={solid(P.deepBlue, 0.5)} low />
      </group>
    </group>
  );
}

/** The four bikes; `sim.bikesInUse()` of them are hidden while ridden. */
export function Bikes({ sim }: { sim?: PlacesSim | null }) {
  const c = zoneCenter("bike_rack");
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const lastKey = useRef(-1);
  const parts = useMemo(bikeParts, []);
  const mats = useMemo(
    () => ({
      frame: new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45 }),
      dark: solid("#2a3550", 0.6),
      basket: solid(P.wood, 0.85)
    }),
    []
  );
  const slots = useMemo(() => {
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), BIKE_YAW);
    return BIKE_SLOTS.map((s) => new THREE.Matrix4().compose(V(c.x + s.x, PAD_TOP, c.z + s.z), q, V(1, 1, 1)));
  }, [c.x, c.z]);
  const colors = useMemo(() => BIKE_COLORS.map((h) => new THREE.Color(h)), []);
  /** Which entries of sim.spots are the rack slots (in slot order). */
  const spotIdx = useMemo(() => {
    const ids = SPOTS.filter((s) => s.kind === "bike").map((s) => s.id);
    return ids.map((id) => sim?.spots?.findIndex((s) => s.id === id) ?? -1);
  }, [sim]);
  useEffect(() => () => { parts.frame.dispose(); parts.dark.dispose(); parts.basket.dispose(); mats.frame.dispose(); }, [parts, mats]);

  useFrame(() => {
    const inUse = typeof sim?.bikesInUse === "function" ? sim.bikesInUse() : 0;
    let mask = 0;
    for (let i = 0; i < spotIdx.length; i++) {
      const sp = spotIdx[i] >= 0 ? sim?.spots?.[spotIdx[i]] : undefined;
      if (sp?.busyBy) mask |= 1 << i;
    }
    const key = (Number.isFinite(inUse) ? Math.max(0, Math.round(inUse)) : 0) * 64 + mask;
    if (key === lastKey.current) return;
    lastKey.current = key;
    const shown = bikesShown(slots.length, inUse, slots.map((_, i) => (mask & (1 << i)) !== 0));
    for (const mesh of refs.current) {
      if (!mesh) continue;
      let n = 0;
      shown.forEach((on, i) => {
        if (!on) return;
        mesh.setMatrixAt(n, slots[i]);
        if (mesh.material === mats.frame) mesh.setColorAt(n, colors[i]);
        n++;
      });
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  const list: [THREE.BufferGeometry, THREE.Material][] = [[parts.frame, mats.frame], [parts.dark, mats.dark], [parts.basket, mats.basket]];
  return (
    <group>
      {list.map(([g, m], i) => (
        <instancedMesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          args={[g, m, slots.length]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
      ))}
    </group>
  );
}
