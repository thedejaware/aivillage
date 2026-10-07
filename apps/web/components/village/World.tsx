"use client";

/**
 * The static village scene (no characters) for React Three Fiber, in the bright
 * "WareTrack" diorama look. Render both inside a `<Canvas shadows>`:
 *   <VillageLighting dayness={d} />
 *   <VillageWorld structures={...} myTwinId={...} dayness={d} />
 * `dayness` is 0 at midnight and 1 at noon; lamps and windows glow as it drops.
 */
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { DEFAULT_ZONES, type WorldStructureView } from "@aivillage/shared";
import { setNightness } from "./materials";
import { Ground } from "./ground";
import { Venues } from "./venues";
import { StructureView } from "./structures";

export { SEAT_Y, STAGE_TOP } from "./scenery";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function nearestZone(col: number, row: number): string {
  let best = DEFAULT_ZONES[0].name;
  let bd = Infinity;
  for (const z of DEFAULT_ZONES) {
    const d = (z.col - col) ** 2 + (z.row - row) ** 2;
    if (d < bd) { bd = d; best = z.name; }
  }
  return best;
}

/** First structure per half-tile is built; later ones count toward the nearest venue's "+N more". */
function dedupe(structures: WorldStructureView[]) {
  const seen = new Set<string>();
  const built: WorldStructureView[] = [];
  const overflow = new Map<string, number>();
  for (const st of structures) {
    const key = `${Math.round(st.col * 2)},${Math.round(st.row * 2)}`;
    if (seen.has(key)) {
      const z = nearestZone(st.col, st.row);
      overflow.set(z, (overflow.get(z) ?? 0) + 1);
      continue;
    }
    seen.add(key);
    built.push(st);
  }
  return { built, overflow };
}

export function VillageWorld({ structures, myTwinId, dayness }: { structures: WorldStructureView[]; myTwinId: string | null; dayness: number }) {
  const night = 1 - clamp01(dayness);
  useEffect(() => { setNightness(night); }, [night]);
  const { built, overflow } = useMemo(() => dedupe(structures), [structures]);
  return (
    <group>
      <Ground />
      <Venues night={night} overflow={overflow} />
      {built.map((st) => (
        <StructureView key={st.id} st={st} mine={!!myTwinId && st.builtByTwinId === myTwinId} />
      ))}
    </group>
  );
}

// ---------------- lighting + sky ----------------

const C = (hex: string) => new THREE.Color(hex);
const SKY = {
  top: { night: C("#2c3e6b"), dusk: C("#8ea2d6"), day: C("#8fc3f0") },
  horizon: { night: C("#4a5d94"), dusk: C("#f0d5c8"), day: C("#e7f1fb") },
  sun: { night: C("#a9bfff"), dusk: C("#ffc591"), day: C("#fff6e8") },
  hemiSky: { night: C("#8299dd"), day: C("#e3efff") },
  hemiGround: { night: C("#38456a"), day: C("#efe7d8") },
  ambient: { night: C("#c4d0ff"), day: C("#ffffff") }
};

/** night → dusk over the first part of the morning, dusk → day after. */
function ramp(set: { night: THREE.Color; dusk: THREE.Color; day: THREE.Color }, d: number, out: THREE.Color): THREE.Color {
  out.copy(set.night).lerp(set.dusk, smooth(0, 0.22, d));
  return out.lerp(set.day, smooth(0.18, 0.6, d));
}

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = vDir.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
  col = mix(col, uHorizon * 0.92, clamp(-h * 2.0, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function VillageLighting({ dayness }: { dayness: number }) {
  const d = clamp01(dayness);
  const scene = useThree((s) => s.scene);
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);

  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        toneMapped: false
      }),
    []
  );
  const bg = useMemo(() => new THREE.Color(), []);
  const fog = useMemo(() => new THREE.Fog("#e7f1fb", 32, 85), []);

  useEffect(() => {
    const prevBg = scene.background, prevFog = scene.fog;
    scene.background = bg;
    scene.fog = fog;
    return () => {
      scene.background = prevBg;
      scene.fog = prevFog;
    };
  }, [scene, bg, fog]);

  useEffect(() => () => sky.dispose(), [sky]);

  useLayoutEffect(() => {
    const l = sun.current;
    if (!l) return;
    const cam = l.shadow.camera;
    cam.left = -9; cam.right = 9; cam.top = 9; cam.bottom = -9;
    cam.near = 1; cam.far = 45;
    cam.updateProjectionMatrix();
    l.shadow.mapSize.set(2048, 2048);
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.025;
  }, []);

  useLayoutEffect(() => {
    const top = sky.uniforms.uTop.value as THREE.Color;
    const hor = sky.uniforms.uHorizon.value as THREE.Color;
    ramp(SKY.top, d, top);
    ramp(SKY.horizon, d, hor);
    bg.copy(hor);
    fog.color.copy(hor);
    if (sun.current) {
      ramp(SKY.sun, d, sun.current.color);
      sun.current.intensity = 0.6 + 1.25 * smooth(0.02, 0.6, d);
      // the moon hangs on the opposite side so night shadows still read
      sun.current.position.set(-6 + 13 * d, 10 + 5 * d, 7 - 2 * d);
    }
    const lit = smooth(0, 0.6, d);
    if (hemi.current) {
      hemi.current.color.copy(SKY.hemiSky.night).lerp(SKY.hemiSky.day, lit);
      hemi.current.groundColor.copy(SKY.hemiGround.night).lerp(SKY.hemiGround.day, lit);
      hemi.current.intensity = 0.7 + 0.2 * lit;
    }
    if (amb.current) {
      amb.current.color.copy(SKY.ambient.night).lerp(SKY.ambient.day, lit);
      amb.current.intensity = 0.28 + 0.07 * lit;
    }
  }, [d, sky, bg, fog]);

  return (
    <>
      <mesh material={sky} scale={60} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <hemisphereLight ref={hemi} />
      <ambientLight ref={amb} />
      <directionalLight ref={sun} castShadow position={[7, 15, 5]} />
    </>
  );
}
