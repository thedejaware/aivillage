"use client";

/**
 * The twins as React Three Fiber objects. All behaviour lives in VillageSim;
 * every frame each avatar reads its twin's transform + body animation and
 * updates its labels through refs (no React re-render per frame).
 */
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Appearance } from "@aivillage/shared";
import { avatarPose, bodyLift, isRiding, type VillageSim } from "../../lib/village/sim";
import { Avatar, type AvatarPose } from "./avatar";

export const TWIN_HEIGHT = 1.05;
const ACCENT = "#2f6bff";
const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const REST_POSE: AvatarPose = { anim: "idle", animTime: 0, walking: false, walkPhase: 0, speed: 1, item: null };

const pill: React.CSSProperties = {
  fontFamily: "var(--font-ui), Inter, system-ui, sans-serif",
  whiteSpace: "nowrap",
  borderRadius: 999,
  boxShadow: "0 3px 10px rgba(20,40,80,0.16)"
};

export function TwinAvatar({
  id,
  sim,
  appearance,
  isMine,
  selected,
  onSelect
}: {
  id: string;
  sim: VillageSim;
  appearance: Appearance;
  isMine: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const nameEl = useRef<HTMLDivElement>(null);
  const statusEl = useRef<HTMLDivElement>(null);
  const bubbleEl = useRef<HTMLDivElement>(null);
  const markEl = useRef<HTMLDivElement>(null);
  const badgeEl = useRef<HTMLDivElement>(null);
  const label = useRef({ name: "", status: "", bubble: "", speaking: false, hidden: false, ring: true });

  const twin0 = sim.twins.get(id);
  const color = twin0?.colorHex ?? 0x5b8cff;
  // world updates bring a fresh object each time — rebuild the body only when the look changes
  const lookKey = JSON.stringify(appearance);
  const look = useMemo(() => appearance, [lookKey]);
  // the sim runs on its own clock (see SimDriver); the pose carries the held item too
  const pose = useCallback((): AvatarPose => {
    const tw = sim.twins.get(id);
    return tw ? avatarPose(tw, sim.now) : REST_POSE;
  }, [sim, id]);

  useFrame(({ clock }) => {
    const tw = sim.twins.get(id);
    if (!tw || !root.current || !body.current) return;
    // asleep in the house: no body, no badge
    const l = label.current;
    if (l.hidden !== tw.hidden) {
      l.hidden = tw.hidden;
      root.current.visible = !tw.hidden;
      if (badgeEl.current) badgeEl.current.style.display = tw.hidden ? "none" : "flex";
    }
    if (tw.hidden) return;
    const lift = bodyLift(tw);
    const riding = isRiding(tw);
    // a coaster rider: the whole twin (badge included) rides up with the cart, tilted with the track
    root.current.position.set(tw.x, riding ? lift : 0, tw.z);
    body.current.position.y = riding ? 0 : lift;
    body.current.rotation.order = "YXZ";
    body.current.rotation.y = tw.yaw; // the rig animates everything else
    body.current.rotation.x = -tw.pitch; // + pitch = nose up
    const showRing = !riding && tw.task?.phase !== "swim";
    if (ring.current && l.ring !== showRing) {
      l.ring = showRing;
      ring.current.visible = showRing;
    }
    if (ring.current && showRing) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 2.2 + tw.phase) * 0.12;
      ring.current.scale.set(pulse, pulse, 1);
    }
    // labels: touch the DOM only when something changed
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
        document.body.dataset.hoverTwin = "1";
      }}
      onPointerOut={() => {
        delete document.body.dataset.hoverTwin;
      }}
    >
      <group ref={body}>
        <Avatar appearance={look} pose={pose} />
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
        <div ref={badgeEl} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, transform: "translateY(-50%)" }}>
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

