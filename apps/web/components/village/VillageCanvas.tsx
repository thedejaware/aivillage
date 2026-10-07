"use client";

/**
 * VillageCanvas — the 3D village (React Three Fiber). Composes the static world,
 * lighting with a day/night cycle, the twins (driven by VillageSim) and the
 * camera. Clicking a twin selects it; "focus" glides the camera to it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

type OrbitControlsImpl = React.ElementRef<typeof OrbitControls>;
import type { WorldState } from "@aivillage/shared";
import { VillageSim } from "../../lib/village/sim";
import { daynessAt } from "../../lib/village/clock";
import { VillageWorld, VillageLighting } from "./World";
import { TwinAvatar } from "./Twins";

const HOME_POS = new THREE.Vector3(11, 10.5, 11);
const HOME_TARGET = new THREE.Vector3(0, 0, 0);

export interface CameraApi {
  zoom(factor: number): void;
  rotate(radians: number): void;
  home(): void;
  focus(x: number, z: number): void;
}

/** Owns OrbitControls and smooth camera moves (focus / home). */
function CameraRig({ api }: { api: React.MutableRefObject<CameraApi | null> }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const glide = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null);

  useEffect(() => {
    api.current = {
      zoom(factor) {
        const c = controls.current;
        if (!c) return;
        const dir = camera.position.clone().sub(c.target);
        const d = THREE.MathUtils.clamp(dir.length() / factor, c.minDistance, c.maxDistance);
        glide.current = { target: c.target.clone(), pos: c.target.clone().addScaledVector(dir.normalize(), d) };
      },
      rotate(radians) {
        const c = controls.current;
        if (!c) return;
        const off = camera.position.clone().sub(c.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
        glide.current = { target: c.target.clone(), pos: c.target.clone().add(off) };
      },
      home() {
        glide.current = { target: HOME_TARGET.clone(), pos: HOME_POS.clone() };
      },
      focus(x, z) {
        const c = controls.current;
        if (!c) return;
        const target = new THREE.Vector3(x, 0.4, z);
        const off = camera.position.clone().sub(c.target).setLength(11);
        glide.current = { target, pos: target.clone().add(off) };
      }
    };
    return () => { api.current = null; };
  }, [api, camera]);

  useFrame((_, delta) => {
    const g = glide.current;
    const c = controls.current;
    if (!g || !c) return;
    const k = 1 - Math.exp(-delta * 5);
    c.target.lerp(g.target, k);
    camera.position.lerp(g.pos, k);
    if (c.target.distanceTo(g.target) < 0.01 && camera.position.distanceTo(g.pos) < 0.01) glide.current = null;
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      minPolarAngle={0.35}
      maxPolarAngle={1.25}
      minDistance={6}
      maxDistance={34}
      onStart={() => { glide.current = null; }}
    />
  );
}

/** Advances the simulation once per frame. */
function SimDriver({ sim }: { sim: VillageSim }) {
  useFrame((_, delta) => sim.step(performance.now() / 1000, Math.min(0.1, Math.max(0.001, delta))));
  return null;
}

export default function VillageCanvas({
  state,
  myTwinId,
  speakingTwinId,
  selectedId,
  onSelect,
  onOrderArrive,
  focusRequest,
  controlsRight = 16
}: {
  state: WorldState;
  myTwinId: string | null;
  speakingTwinId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** fired once when a twin reaches the place its owner sent it */
  onOrderArrive?: (twinId: string, status: string) => void;
  /** bump `n` to glide the camera to twin `id` */
  focusRequest?: { id: string; n: number } | null;
  /** keeps the camera buttons clear of the inspector card */
  controlsRight?: number;
}) {
  const onArriveRef = useRef(onOrderArrive);
  onArriveRef.current = onOrderArrive;
  const sim = useMemo(() => new VillageSim({ onOrderArrive: (id, s) => onArriveRef.current?.(id, s) }), []);
  const cameraApi = useRef<CameraApi | null>(null);
  const [dayness, setDayness] = useState(() => daynessAt(Date.now()));

  useEffect(() => {
    sim.reconcile(state, performance.now() / 1000);
  }, [sim, state]);

  useEffect(() => {
    sim.speakingId = speakingTwinId;
  }, [sim, speakingTwinId]);

  // the sky changes slowly — re-render the world twice a second, not every frame
  useEffect(() => {
    const h = setInterval(() => setDayness(daynessAt(Date.now())), 500);
    return () => clearInterval(h);
  }, []);

  useEffect(() => {
    if (!focusRequest) return;
    const tw = sim.twins.get(focusRequest.id);
    if (tw) cameraApi.current?.focus(tw.x, tw.z);
  }, [sim, focusRequest]);

  return (
    <>
      <div style={{ position: "fixed", inset: 0 }}>
        <Canvas
          shadows={{ type: THREE.PCFSoftShadowMap }}
          dpr={[1, 2]}
          camera={{ position: HOME_POS.toArray(), fov: 32, near: 0.1, far: 300 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          onPointerMissed={() => onSelect(null)}
        >
          <VillageLighting dayness={dayness} />
          <VillageWorld structures={state.structures} myTwinId={myTwinId} dayness={dayness} />
          {state.twins.map((t) => (
            <TwinAvatar
              key={t.id}
              id={t.id}
              sim={sim}
              isMine={t.id === myTwinId}
              selected={t.id === selectedId}
              onSelect={onSelect}
            />
          ))}
          <SimDriver sim={sim} />
          <CameraRig api={cameraApi} />
        </Canvas>
      </div>

      {/* camera buttons, WareTrack-style vertical strip */}
      <div
        style={{
          position: "fixed", top: 96, right: controlsRight, zIndex: 15, display: "flex", flexDirection: "column", gap: 2,
          background: "rgba(255,255,255,0.92)", backdropFilter: "blur(8px)", borderRadius: 12, padding: 4,
          boxShadow: "0 8px 28px rgba(20,40,80,0.14)", border: "1px solid rgba(20,40,80,0.06)",
          transition: "right 0.25s ease"
        }}
      >
        {[
          { label: "+", title: "Zoom in", act: () => cameraApi.current?.zoom(1.3) },
          { label: "−", title: "Zoom out", act: () => cameraApi.current?.zoom(1 / 1.3) },
          { label: "⟲", title: "Rotate left", act: () => cameraApi.current?.rotate(Math.PI / 4) },
          { label: "⟳", title: "Rotate right", act: () => cameraApi.current?.rotate(-Math.PI / 4) },
          { label: "⌂", title: "Reset view", act: () => cameraApi.current?.home() }
        ].map((b) => (
          <button key={b.title} title={b.title} aria-label={b.title} onClick={b.act} style={camBtn}>
            {b.label}
          </button>
        ))}
      </div>
    </>
  );
}

const camBtn: React.CSSProperties = {
  width: 34, height: 34, border: "none", background: "transparent", borderRadius: 8, cursor: "pointer",
  fontSize: 17, color: "#1b2433", fontFamily: "var(--font-ui), Inter, system-ui, sans-serif"
};
