"use client";

/**
 * VillageCanvas — the 3D village (React Three Fiber). Composes the static world,
 * lighting with a day/night cycle, the twins (driven by VillageSim) and the
 * camera. Clicking a twin selects it; "focus" glides the camera to it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls } from "@react-three/drei";

type MapControlsImpl = React.ElementRef<typeof MapControls>;
import { LAYOUT_VERSION, type WorldState } from "@aivillage/shared";
import { VillageSim } from "../../lib/village/sim";
import { ISLAND_HALF } from "../../lib/village/layout";
import { daynessAt } from "../../lib/village/clock";
import { targetFps } from "../../lib/village/frameBudget";
import { guardControls } from "../../lib/village/controlsGuard";
import { VillageWorld, VillageLighting } from "./World";
import { TwinAvatar } from "./Twins";

/** The home view fits the whole Main Street map (from the south-east, looking down the street). */
const HOME_TARGET = new THREE.Vector3(0, 0, 0.8);
const HOME_POS = new THREE.Vector3(9, 27, 26);
/** HOME_POS fits a window at least this wide for its height; narrower windows back off. */
const HOME_ASPECT = 1.55;
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const POSE_SAVE_MS = 15_000;
/** Camera limits: near top-down to a low cinematic angle; close-up to the whole island. */
const MIN_POLAR = 0.15;
const MAX_POLAR = 1.45;
const MIN_DIST = 5;
const MAX_DIST = 60;
/** The camera's look-at point stays over the island. */
const TARGET_LIMIT = ISLAND_HALF;

export interface CameraApi {
  zoom(factor: number): void;
  rotate(radians: number): void;
  home(): void;
  focus(x: number, z: number): void;
}

/** The home camera position: farther back on narrow (portrait) windows so the whole street fits. */
function homePos(camera: THREE.Camera): THREE.Vector3 {
  const aspect = camera instanceof THREE.PerspectiveCamera ? camera.aspect : HOME_ASPECT;
  const off = HOME_POS.clone().sub(HOME_TARGET);
  const k = THREE.MathUtils.clamp(HOME_ASPECT / Math.max(0.1, aspect), 1, MAX_DIST / off.length());
  return HOME_TARGET.clone().addScaledVector(off, k);
}

/**
 * Map-style camera:
 *  - left-drag moves the map (hand cursor), right-drag or Shift + drag rotates;
 *  - the mouse wheel, a trackpad two-finger swipe and a pinch all zoom toward the cursor.
 * No damping: the map follows the pointer at once, even at a low frame rate.
 * Also owns the smooth moves for the buttons (zoom / rotate / home / focus).
 */
function CameraRig({ api }: { api: React.MutableRefObject<CameraApi | null> }) {
  const controls = useRef<MapControlsImpl>(null);
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
        glide.current = { target: HOME_TARGET.clone(), pos: homePos(camera) };
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

  // start on the home view (once — not as a prop, re-renders would reset it)
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    c.target.copy(HOME_TARGET);
    camera.position.copy(homePos(camera));
    c.update();
  }, [camera]);

  // un-stick the controls if a mouse-up gets lost (e.g. released in another app)
  useEffect(() => {
    const c = controls.current;
    return c ? guardControls(c) : undefined;
  }, []);

  // keep the look-at point over the island: shift camera + target together.
  // Both callbacks must stay the same function: drei re-connects the controls
  // when they change, and a re-connect mid-drag used to freeze drag and zoom.
  const clampTarget = useCallback(() => {
    const c = controls.current;
    if (!c) return;
    const t = c.target;
    const cx = THREE.MathUtils.clamp(t.x, -TARGET_LIMIT, TARGET_LIMIT);
    const cz = THREE.MathUtils.clamp(t.z, -TARGET_LIMIT, TARGET_LIMIT);
    const cy = THREE.MathUtils.clamp(t.y, 0, 2);
    if (cx === t.x && cz === t.z && cy === t.y) return;
    const delta = new THREE.Vector3(cx - t.x, cy - t.y, cz - t.z);
    t.add(delta);
    camera.position.add(delta);
  }, [camera]);
  const stopGlide = useCallback(() => { glide.current = null; }, []);

  return (
    <MapControls
      ref={controls}
      makeDefault
      enableDamping={false}
      screenSpacePanning={false}
      zoomToCursor
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minDistance={MIN_DIST}
      maxDistance={MAX_DIST}
      onChange={clampTarget}
      onStart={stopGlide}
    />
  );
}

/**
 * Drives redraws on demand: 30 fps while idle, 60 fps while the user moves the
 * camera, nothing while the tab is hidden (see frameBudget).
 */
function FrameLimiter({ paused }: { paused: boolean }) {
  const { invalidate, gl } = useThree();
  useEffect(() => {
    if (paused) return; // the village is paused: no frames at all
    let lastInteraction = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const fps = targetFps({ hidden: document.hidden, now: performance.now(), lastInteraction });
      if (fps === 0) return; // resumed by visibilitychange
      invalidate();
      timer = setTimeout(tick, 1000 / fps);
    };
    const touch = () => { lastInteraction = performance.now(); };
    const drag = (e: PointerEvent) => { if (e.buttons) touch(); }; // hovering alone stays at idle fps
    const onVisible = () => {
      clearTimeout(timer);
      if (!document.hidden) tick();
    };
    const el = gl.domElement;
    el.addEventListener("pointerdown", touch);
    el.addEventListener("pointermove", drag);
    el.addEventListener("wheel", touch, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    tick();
    return () => {
      clearTimeout(timer);
      el.removeEventListener("pointerdown", touch);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("wheel", touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [invalidate, gl, paused]);
  return null;
}

/**
 * Advances the simulation once per frame on its own clock: it only moves while
 * frames are drawn, so a hidden tab or a paused village resumes where it was
 * (nothing ends or jumps while nobody watches).
 */
function SimDriver({ sim, clock }: { sim: VillageSim; clock: React.MutableRefObject<number> }) {
  useFrame((_, delta) => {
    const dt = Math.min(0.1, Math.max(0.001, delta));
    clock.current += dt;
    sim.step(clock.current, dt);
  });
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
  controlsRight = 16,
  paused = false,
  savePoses = true
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
  /** auto-paused (nobody watching): draw nothing */
  paused?: boolean;
  /** remember where twins stand on the server (off for previews with made-up twins) */
  savePoses?: boolean;
}) {
  const onArriveRef = useRef(onOrderArrive);
  onArriveRef.current = onOrderArrive;
  const sim = useMemo(() => new VillageSim({ onOrderArrive: (id, s) => onArriveRef.current?.(id, s) }), []);
  const cameraApi = useRef<CameraApi | null>(null);
  const simClock = useRef(0);
  const [dayness, setDayness] = useState(() => daynessAt(Date.now()));

  useEffect(() => {
    sim.reconcile(state, simClock.current);
  }, [sim, state]);

  useEffect(() => {
    sim.speakingId = speakingTwinId;
  }, [sim, speakingTwinId]);

  // remember where everyone stands, so the village reopens exactly here
  useEffect(() => {
    if (!savePoses) return;
    const body = () => JSON.stringify({ poses: sim.poses().map((p) => ({ ...p, layout: LAYOUT_VERSION, x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3) })) });
    const save = () => {
      if (sim.twins.size === 0) return;
      void fetch(`${API}/api/poses`, { method: "PUT", headers: { "content-type": "application/json" }, body: body() }).catch(() => {});
    };
    // text/plain beacon: no CORS preflight, still delivered while the tab closes
    const beacon = () => { if (sim.twins.size > 0) navigator.sendBeacon?.(`${API}/api/poses`, new Blob([body()], { type: "text/plain" })); };
    const onVisibility = () => { if (document.hidden) beacon(); };
    const h = setInterval(() => { if (!document.hidden) save(); }, POSE_SAVE_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", beacon);
    return () => {
      clearInterval(h);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", beacon);
      save();
    };
  }, [sim, savePoses]);

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
      <div
        className="village-canvas"
        style={{ position: "fixed", inset: 0 }}
        onPointerDown={(e) => { if (e.button === 0) e.currentTarget.classList.add("dragging"); }}
        onPointerUp={(e) => e.currentTarget.classList.remove("dragging")}
        onPointerCancel={(e) => e.currentTarget.classList.remove("dragging")}
        onPointerLeave={(e) => e.currentTarget.classList.remove("dragging")}
      >
        {/* hand cursor: open over the map, closed while dragging, a pointer over a twin */}
        <style>{`
          .village-canvas canvas { cursor: grab; }
          .village-canvas.dragging canvas { cursor: grabbing; }
          body[data-hover-twin] .village-canvas canvas { cursor: pointer; }
        `}</style>
        <Canvas
          shadows={{ type: THREE.PCFSoftShadowMap }}
          frameloop="demand"
          dpr={[1, 1.5]}
          camera={{ position: HOME_POS.toArray(), fov: 32, near: 0.1, far: 300 }}
          gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
          onPointerMissed={() => onSelect(null)}
        >
          <VillageLighting dayness={dayness} />
          <VillageWorld structures={state.structures} myTwinId={myTwinId} dayness={dayness} sim={sim} />
          {state.twins.map((t) => (
            <TwinAvatar
              key={t.id}
              id={t.id}
              sim={sim}
              appearance={t.appearance}
              isMine={t.id === myTwinId}
              selected={t.id === selectedId}
              onSelect={onSelect}
            />
          ))}
          <SimDriver sim={sim} clock={simClock} />
          <FrameLimiter paused={paused} />
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
          { label: "+", title: "Zoom in (or two fingers / mouse wheel)", act: () => cameraApi.current?.zoom(1.3) },
          { label: "−", title: "Zoom out (or two fingers / mouse wheel)", act: () => cameraApi.current?.zoom(1 / 1.3) },
          { label: "⟲", title: "Rotate left (or Shift + drag)", act: () => cameraApi.current?.rotate(Math.PI / 4) },
          { label: "⟳", title: "Rotate right (or Shift + drag)", act: () => cameraApi.current?.rotate(-Math.PI / 4) },
          { label: "⌂", title: "Reset view", act: () => cameraApi.current?.home() }
        ].map((b) => (
          <button key={b.title} title={b.title} aria-label={b.title} onClick={b.act} style={camBtn}>
            {b.label}
          </button>
        ))}
        <span
          title={"Move: click and drag\nRotate: Shift + drag, or right-drag\nZoom: two fingers on the trackpad, pinch, or the mouse wheel"}
          aria-label="How to move the map: click and drag to move, Shift + drag to rotate, two fingers or the mouse wheel to zoom"
          style={{ ...camBtn, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#8a94a6", cursor: "help" }}
        >
          ?
        </span>
      </div>
    </>
  );
}

const camBtn: React.CSSProperties = {
  width: 34, height: 34, border: "none", background: "transparent", borderRadius: 8, cursor: "pointer",
  fontSize: 17, color: "#1b2433", fontFamily: "var(--font-ui), Inter, system-ui, sans-serif"
};
