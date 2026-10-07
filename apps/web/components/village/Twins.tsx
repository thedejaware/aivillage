"use client";

/**
 * The twins as React Three Fiber objects. All behaviour lives in VillageSim;
 * every frame each avatar copies its twin's transform + pose and updates its
 * labels through refs (no React re-render per frame).
 */
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html, useGLTF } from "@react-three/drei";
import type { VillageSim } from "../../lib/village/sim";

export const TWIN_HEIGHT = 1.05;
/** If the characters walk sideways/backwards, tune this yaw offset (radians). */
const MODEL_YAW = 0;
const MODEL_URLS = ["/models/twin_male.glb", "/models/twin_female.glb"];
const ACCENT = "#2f6bff";
const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Scale a model to `targetH` and put its feet on the ground at the origin. */
function normalizeModel(model: THREE.Object3D, targetH: number): void {
  const b1 = new THREE.Box3().setFromObject(model);
  const size = b1.getSize(new THREE.Vector3());
  model.scale.setScalar(targetH / Math.max(size.y, 0.0001));
  model.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model);
  const c = b2.getCenter(new THREE.Vector3());
  model.position.x -= c.x;
  model.position.z -= c.z;
  model.position.y -= b2.min.y;
}

function GltfBody({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const m = scene.clone(true);
    normalizeModel(m, TWIN_HEIGHT);
    m.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    return m;
  }, [scene]);
  return <primitive object={model} />;
}

/** Capsule stand-in while the GLB loads (or if it is missing). */
function CapsuleBody({ color }: { color: number }) {
  return (
    <group>
      <mesh position={[0, 0.43, 0]} castShadow>
        <capsuleGeometry args={[0.18, 0.5, 6, 14]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <sphereGeometry args={[0.17, 18, 14]} />
        <meshStandardMaterial color={0xf2cda6} roughness={0.7} />
      </mesh>
    </group>
  );
}

const pill: React.CSSProperties = {
  fontFamily: "var(--font-ui), Inter, system-ui, sans-serif",
  whiteSpace: "nowrap",
  borderRadius: 999,
  boxShadow: "0 3px 10px rgba(20,40,80,0.16)"
};

export function TwinAvatar({
  id,
  sim,
  isMine,
  selected,
  onSelect
}: {
  id: string;
  sim: VillageSim;
  isMine: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const cup = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const nameEl = useRef<HTMLDivElement>(null);
  const statusEl = useRef<HTMLDivElement>(null);
  const bubbleEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLDivElement>(null);
  const label = useRef({ name: "", status: "", bubble: "", speaking: false });

  const twin0 = sim.twins.get(id);
  const color = twin0?.colorHex ?? 0x5b8cff;
  const url = MODEL_URLS[hash(id) % MODEL_URLS.length];

  useFrame(({ clock }) => {
    const tw = sim.twins.get(id);
    if (!tw || !root.current || !body.current) return;
    root.current.position.set(tw.x, 0, tw.z);
    body.current.rotation.set(tw.tiltX, tw.yaw + MODEL_YAW, tw.roll);
    body.current.position.y = tw.bodyY;
    if (cup.current) {
      cup.current.visible = tw.cupVisible;
      cup.current.position.y = 0.58 + tw.cupLift;
    }
    if (ring.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.2 + tw.phase) * 0.12;
      ring.current.scale.set(pulse, pulse, 1);
    }
    // labels: touch the DOM only when something changed
    const l = label.current;
    if (nameEl.current && l.name !== tw.name) nameEl.current.textContent = l.name = tw.name;
    const status = tw.status ?? "";
    if (statusEl.current && l.status !== status) {
      statusEl.current.textContent = l.status = status;
      statusEl.current.style.display = status ? "block" : "none";
    }
    const bubble = tw.bubble ?? "";
    if (bubbleEl.current && l.bubble !== bubble) {
      bubbleEl.current.textContent = l.bubble = bubble;
      bubbleEl.current.style.display = bubble ? "block" : "none";
    }
    const speaking = sim.speakingId === id;
    if (markEl.current && l.speaking !== speaking) {
      l.speaking = speaking;
      markEl.current.style.display = speaking ? "block" : "none";
    }
  });

  return (
    <group
      ref={root}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    >
      <group ref={body}>
        <Suspense fallback={<CapsuleBody color={color} />}>
          <GltfBody url={url} />
        </Suspense>
        {/* coffee prop, visible during the café activity */}
        <group ref={cup} position={[0.2, 0.58, 0.2]} visible={false}>
          <mesh castShadow>
            <cylinderGeometry args={[0.045, 0.038, 0.09, 12]} />
            <meshStandardMaterial color={0xfff3e0} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.045, 0]}>
            <cylinderGeometry args={[0.05, 0.05, 0.012, 12]} />
            <meshStandardMaterial color={0x6b4a2e} />
          </mesh>
        </group>
      </group>

      {/* ground ring: twin colour; accent blue + larger when selected */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <ringGeometry args={selected ? [0.36, 0.5, 40] : [0.3, 0.38, 36]} />
        <meshBasicMaterial color={selected ? ACCENT : color} transparent opacity={selected ? 0.9 : 0.55} depthWrite={false} />
      </mesh>
      {/* invisible, easier-to-hit click target */}
      <mesh position={[0, TWIN_HEIGHT / 2, 0]} visible={false}>
        <cylinderGeometry args={[0.32, 0.32, TWIN_HEIGHT, 8]} />
        <meshBasicMaterial />
      </mesh>

      <Html position={[0, TWIN_HEIGHT + 0.22, 0]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transform: "translateY(-50%)" }}>
          <div ref={markEl} style={{ ...pill, display: "none", background: hexCss(color), color: "#fff", fontSize: 13, padding: "2px 8px" }}>
            💬
          </div>
          <div
            ref={bubbleEl}
            style={{
              ...pill, display: "none", borderRadius: 10, maxWidth: 170, whiteSpace: "normal", textAlign: "center",
              background: "#ffffff", color: "#1b2433", fontSize: 11, lineHeight: 1.35, padding: "4px 9px",
              border: `1px solid ${hexCss(color)}55`
            }}
          />
          <div
            style={{
              ...pill, display: "flex", alignItems: "center", gap: 6, padding: "2px 8px 2px 6px",
              background: isMine ? ACCENT : "rgba(255,255,255,0.95)",
              color: isMine ? "#fff" : "#1b2433",
              border: selected ? `2px solid ${ACCENT}` : "1px solid rgba(20,40,80,0.08)",
              fontSize: 11, fontWeight: 600
            }}
          >
            <span style={{ width: 7, height: 7, borderRadius: 7, background: isMine ? "#fff" : hexCss(color) }} />
            <span ref={nameEl} />
            <span
              ref={statusEl}
              style={{
                display: "none", fontWeight: 500, fontSize: 10, padding: "1px 6px", borderRadius: 999,
                background: isMine ? "rgba(255,255,255,0.2)" : "#fff3e2", color: isMine ? "#fff" : "#a35a12"
              }}
            />
          </div>
        </div>
      </Html>
    </group>
  );
}

for (const u of MODEL_URLS) useGLTF.preload(u);
