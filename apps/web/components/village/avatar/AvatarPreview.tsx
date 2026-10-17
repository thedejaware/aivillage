"use client";

/**
 * A small turntable for the avatar builder: its own <Canvas>, soft studio
 * light, a round pedestal, slow auto-rotate that the user can drag. Renders
 * on demand at ~30 fps to keep laptops cool.
 */
import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Appearance, BodyAnim } from "@aivillage/shared";
import { Avatar } from "./Avatar";
import type { AvatarPose } from "./types";
import { geo, mat } from "./assets";
import { headCenterY } from "./features";
import * as THREE from "three";

const FPS = 30;

export type PreviewFocus = "body" | "face";

/** Camera framing per focus: orbit target height, distance and polar angle. */
const FOCUS = {
  body: { y: 0.55, dist: 3.3, polar: 1.47 },
  // whole head incl. chin/beard and tall hair (afro, bun) fits from 220 to 440 px tall
  face: { y: 0.86, dist: 2.0, polar: 1.5 }
} as const;

const spherical = new THREE.Spherical();
const offset = new THREE.Vector3();

/**
 * Smoothly moves the orbit camera between the full body and a close-up of the
 * head (like Bitmoji zooming in while you edit the eyes). In face mode the
 * turntable stops and the camera drifts back to the front after a drag.
 */
function FocusRig({ focus, headY }: { focus: PreviewFocus; headY: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    | (THREE.EventDispatcher<{ start: object; end: object }> & { target: THREE.Vector3; autoRotate: boolean; minAzimuthAngle: number; maxAzimuthAngle: number })
    | null;
  const drag = useRef({ active: false, endedAt: -10 });
  const snapped = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const start = () => { drag.current.active = true; };
    const end = () => { drag.current.active = false; drag.current.endedAt = performance.now() / 1000; };
    controls.addEventListener("start", start);
    controls.addEventListener("end", end);
    return () => {
      controls.removeEventListener("start", start);
      controls.removeEventListener("end", end);
    };
  }, [controls]);

  useFrame((_, delta) => {
    if (!controls) return;
    const f = FOCUS[focus];
    const want = focus === "face" ? headY : f.y;
    // first frame: jump straight to the framing (no fly-in from the origin)
    const k = snapped.current ? 1 - Math.exp(-Math.min(delta, 0.1) * 5) : 1;
    snapped.current = true;
    controls.autoRotate = focus === "body";
    // face mode: only a small drag around the front
    controls.minAzimuthAngle = focus === "face" ? -0.9 : -Infinity;
    controls.maxAzimuthAngle = focus === "face" ? 0.9 : Infinity;

    const t = controls.target;
    offset.copy(camera.position).sub(t);
    spherical.setFromVector3(offset);
    t.y += (want - t.y) * k;
    spherical.radius += (f.dist - spherical.radius) * k;
    if (focus === "face") {
      // wrap the turntable angle into (-π, π] so the camera takes the short way to the front
      let th = spherical.theta % (Math.PI * 2);
      if (th > Math.PI) th -= Math.PI * 2;
      if (th < -Math.PI) th += Math.PI * 2;
      const idle = !drag.current.active && performance.now() / 1000 - drag.current.endedAt > 1.4;
      spherical.theta = idle ? th - th * k * 0.6 : th;
    }
    if (!drag.current.active) spherical.phi += (f.polar - spherical.phi) * k * 0.5;
    camera.position.copy(t).add(offset.setFromSpherical(spherical));
    camera.lookAt(t);
  });
  return null;
}

function Ticker() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(() => invalidate(), 1000 / FPS);
    return () => window.clearInterval(id);
  }, [invalidate]);
  return null;
}

/** Keep the full body in frame for any canvas aspect (narrow canvases step back). */
function Framing() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  useEffect(() => {
    camera.zoom = Math.min(1, aspect / 1.05);
    camera.updateProjectionMatrix();
  }, [camera, aspect]);
  return null;
}

function Pedestal() {
  return (
    <group>
      <mesh
        geometry={geo("pedestal", () => new THREE.CylinderGeometry(0.44, 0.47, 0.08, 48))}
        material={mat("#ffffff", { rough: 0.9 })}
        position={[0, -0.04, 0]}
        receiveShadow
      />
      <mesh
        geometry={geo("pedestalRim", () => new THREE.TorusGeometry(0.455, 0.012, 8, 64))}
        material={mat("#dfe6ef", { rough: 0.9 })}
        position={[0, -0.005, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
    </group>
  );
}

function PreviewAvatar({ appearance, anim }: { appearance: Appearance; anim: BodyAnim }) {
  const now = () => performance.now() / 1000;
  const animStart = useRef(now());
  const wave = useRef({ start: -10, until: -10 });
  const first = useRef(true);
  const out = useRef<AvatarPose>({ anim, animTime: 0, walking: false, walkPhase: 0, speed: 1 });
  const lookKey = useMemo(() => JSON.stringify(appearance), [appearance]);

  useEffect(() => {
    animStart.current = now();
  }, [anim]);

  // a friendly wave whenever the look changes
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    wave.current = { start: now(), until: now() + 1.7 };
  }, [lookKey]);

  const pose = useMemo(
    () => () => {
      const t = now();
      const p = out.current;
      if (anim === "idle" && t < wave.current.until) {
        p.anim = "wave";
        p.animTime = t - wave.current.start;
      } else {
        p.anim = anim;
        p.animTime = t - animStart.current;
      }
      return p;
    },
    [anim]
  );

  return <Avatar appearance={appearance} pose={pose} />;
}

export default function AvatarPreview({
  appearance, anim = "idle", height = 320, focus = "body"
}: {
  appearance: Appearance;
  anim?: BodyAnim;
  height?: number;
  /** "face" zooms the camera in on the head (editing eyes, nose…); "body" shows the whole avatar */
  focus?: PreviewFocus;
}) {
  return (
    <div style={{ width: "100%", height, touchAction: "none" }}>
      <Canvas
        frameloop="demand"
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 22, position: [0, 0.8, 3.0], near: 0.1, far: 20 }}
      >
        <Ticker />
        <Framing />
        <hemisphereLight args={["#ffffff", "#dfe6ef", 1.25]} />
        <directionalLight
          position={[1.6, 3.2, 2.4]}
          intensity={1.7}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-1}
          shadow-camera-right={1}
          shadow-camera-top={1.5}
          shadow-camera-bottom={-0.5}
          shadow-bias={-0.0005}
          shadow-radius={4}
        />
        <directionalLight position={[-2, 1.4, -1.5]} intensity={0.55} color="#dce8ff" />
        <Pedestal />
        <PreviewAvatar appearance={appearance} anim={anim} />
        <FocusRig focus={focus} headY={headCenterY(appearance) + 0.05} />
        <OrbitControls
          makeDefault
          enableZoom={false}
          enablePan={false}
          autoRotate
          autoRotateSpeed={focus === "face" ? 0 : 1.1}
          minPolarAngle={0.9}
          maxPolarAngle={1.75}
        />
      </Canvas>
    </div>
  );
}
