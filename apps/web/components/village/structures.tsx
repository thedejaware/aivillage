"use client";

/** Twin-built projects: one toy-like model per ProjectType, placed on its tile. */
import { useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { ProjectType, WorldStructureView } from "@aivillage/shared";
import { tileToWorld } from "../../lib/village/layout";
import { P, cachedGeo, decal, glow, solid, unit } from "./materials";
import { Ball, Box, Cyl, Ico, RBox, StaticBatch } from "./parts";

const STRUCT_ACCENT: Record<ProjectType, string> = {
  fountain: "#4fc3f7",
  mural: "#ff8fa3",
  noodle_stand: "#ffb547",
  arcade_game: "#2f6bff",
  garden: "#3dbf7a",
  observatory: "#8b7cf6",
  stage: "#ffd27a",
  workshop: "#ff9a4d"
};

function Base({ accent }: { accent: string }) {
  const disc = cachedGeo("struct-base", () => new THREE.CylinderGeometry(0.56, 0.58, 0.02, 40).translate(0, 0.01, 0));
  const ring = cachedGeo("struct-ring", () => new THREE.RingGeometry(0.5, 0.54, 48).rotateX(-Math.PI / 2));
  return (
    <group>
      <mesh geometry={disc} material={solid(P.pad, 0.95)} receiveShadow />
      <mesh geometry={ring} material={decal(accent, 0.6)} position={[0, 0.022, 0]} />
    </group>
  );
}

/** The bobbing spray lives outside the static batch so it can animate. */
function FountainSpray() {
  const spray = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = spray.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.position.y = 0.66 + Math.sin(t * 3.2) * 0.035;
    const s = 1 + Math.sin(t * 6.4) * 0.08;
    g.scale.set(s, 1 / s, s);
    g.rotation.y = t * 0.6;
  });
  const mist = glow("#d8f4ff", 0.35, 1.4);
  return (
    <group ref={spray} position={[0, 0.66, 0]}>
      <Ball rad={0.07} p={[0, 0, 0]} m={mist} cast={false} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i / 4) * Math.PI * 2;
        return <Ball key={i} rad={0.03} p={[Math.cos(a) * 0.1, -0.08, Math.sin(a) * 0.1]} m={mist} cast={false} />;
      })}
    </group>
  );
}

function Fountain() {
  const stone = solid("#e9eef6", 0.7);
  const water = glow("#8fd3ff", 0.15, 0.8);
  return (
    <group>
      <Cyl rad={0.44} h={0.2} p={[0, 0.1, 0]} m={stone} />
      <Cyl rad={0.37} h={0.02} p={[0, 0.195, 0]} m={water} cast={false} />
      <Cyl rad={0.06} h={0.42} p={[0, 0.21, 0]} m={stone} low />
      <Cyl rad={0.17} h={0.05} p={[0, 0.44, 0]} m={stone} />
      <Cyl rad={0.14} h={0.012} p={[0, 0.467, 0]} m={water} cast={false} />
    </group>
  );
}

function Workshop() {
  const roof = cachedGeo("cone4", () => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4));
  return (
    <group>
      <RBox size={[0.75, 0.6, 0.62]} radius={0.04} p={[0, 0.3, 0]} m={solid("#eaf0fa", 0.85)} />
      <mesh geometry={roof} scale={[0.62, 0.36, 0.56]} position={[0, 0.78, 0]} material={solid(P.accent, 0.6)} castShadow />
      <Box size={[0.3, 0.32, 0.02]} p={[-0.14, 0.16, 0.315]} m={solid(P.deepBlue, 0.6)} />
      {[0.06, 0.14, 0.22].map((y) => <Box key={y} size={[0.28, 0.01, 0.022]} p={[-0.14, y, 0.318]} m={solid(P.metal, 0.6)} cast={false} />)}
      <Box size={[0.18, 0.15, 0.02]} p={[0.2, 0.38, 0.315]} m={glow(P.lampGlow, 0.5, 2.2)} cast={false} />
      <Cyl rad={0.01} h={0.3} p={[0.18, 1.0, -0.1]} m={solid(P.metal, 0.5)} low />
      <Ball rad={0.035} p={[0.18, 1.16, -0.1]} m={glow("#ff6b6b", 0.6, 2.4)} cast={false} />
    </group>
  );
}

function MiniStage() {
  const truss = solid(P.deepBlue, 0.5);
  return (
    <group>
      <Cyl rad={0.56} h={0.06} p={[0, 0.03, 0]} m={solid(P.stageRim, 0.7)} />
      <Cyl rad={0.5} h={0.1} p={[0, 0.05, 0]} m={solid(P.stage, 0.65)} />
      <Cyl rad={0.03} h={1.0} p={[-0.46, 0.5, -0.1]} m={truss} low />
      <Cyl rad={0.03} h={1.0} p={[0.46, 0.5, -0.1]} m={truss} low />
      <Box size={[1.0, 0.05, 0.05]} p={[0, 1.0, -0.1]} m={truss} />
      {[-0.3, 0, 0.3].map((x) => <Ball key={x} rad={0.04} p={[x, 0.95, -0.1]} m={glow(P.lampGlow, 0.7, 2.6)} cast={false} />)}
    </group>
  );
}

function Garden() {
  const leaf = solid(P.foliage, 0.9, true);
  const leafDark = solid(P.foliageDark, 0.9, true);
  return (
    <group>
      <RBox size={[0.86, 0.12, 0.66]} radius={0.04} p={[0, 0.06, 0]} m={solid(P.wood, 0.8)} />
      <Box size={[0.78, 0.02, 0.58]} p={[0, 0.12, 0]} m={solid("#9a7658", 0.95)} cast={false} />
      {([[-0.2, -0.08, 0.15], [0.12, -0.14, 0.18], [0.22, 0.14, 0.12], [-0.22, 0.17, 0.1]] as const).map(([x, z, r], i) => (
        <Ico key={i} rad={r} p={[x, 0.13 + r * 0.75, z]} r={[i, i * 0.7, 0]} m={i % 2 ? leafDark : leaf} />
      ))}
      {([[-0.05, 0.12, P.blanket], [0.04, 0.2, P.stage], [-0.32, -0.02, P.white], [0.32, -0.02, "#b9a5ff"]] as const).map(([x, z, c], i) => (
        <group key={i} position={[x, 0.13, z]}>
          <Cyl rad={0.006} h={0.12} p={[0, 0.06, 0]} m={leafDark} low cast={false} />
          <Ball rad={0.032} p={[0, 0.13, 0]} m={solid(c, 0.6)} cast={false} />
        </group>
      ))}
    </group>
  );
}

function Arcade() {
  return (
    <group>
      <RBox size={[0.46, 0.86, 0.4]} radius={0.05} p={[0, 0.43, 0]} m={solid(P.accent, 0.55)} />
      <Box size={[0.32, 0.25, 0.02]} p={[0, 0.58, 0.2]} r={[-0.12, 0, 0]} m={glow("#7fe3ff", 0.7, 2.4)} cast={false} />
      <RBox size={[0.48, 0.12, 0.42]} radius={0.04} p={[0, 0.9, 0]} m={glow(P.blanket, 0.5, 2)} />
      <RBox size={[0.44, 0.06, 0.18]} radius={0.02} p={[0, 0.4, 0.25]} r={[0.25, 0, 0]} m={solid(P.deepBlue, 0.6)} />
      <Cyl rad={0.008} h={0.06} p={[-0.1, 0.45, 0.27]} m={solid(P.metal)} low cast={false} />
      <Ball rad={0.022} p={[-0.1, 0.48, 0.27]} m={solid("#ff6b6b", 0.4)} cast={false} />
      <Ball rad={0.015} p={[0.06, 0.44, 0.28]} m={solid(P.stage, 0.4)} cast={false} />
      <Ball rad={0.015} p={[0.12, 0.44, 0.27]} m={solid("#7fe3ff", 0.4)} cast={false} />
    </group>
  );
}

function Observatory() {
  return (
    <group>
      <Cyl rad={0.4} h={0.55} p={[0, 0.275, 0]} m={solid(P.cafeWall, 0.85)} />
      <Cyl rad={0.42} h={0.04} p={[0, 0.56, 0]} m={solid(P.metal, 0.6)} />
      <mesh geometry={unit.dome()} scale={0.38} position={[0, 0.58, 0]} material={solid("#c9d4ff", 0.5)} castShadow />
      <Box size={[0.09, 0.3, 0.05]} p={[0, 0.8, 0.29]} r={[-0.55, 0, 0]} m={solid(P.deepBlue, 0.6)} />
      <Cyl rad={0.035} h={0.34} p={[0, 0.92, 0.3]} r={[0.9, 0, 0]} m={solid(P.deepBlue, 0.5)} />
      <Box size={[0.14, 0.24, 0.02]} p={[0, 0.17, 0.4]} m={solid(P.wood, 0.75)} />
      <Ball rad={0.03} p={[0.26, 0.42, 0.31]} m={glow("#b9a5ff", 0.5, 2.2)} cast={false} />
    </group>
  );
}

function NoodleStand() {
  const stripe = [P.cafeRoof, P.white];
  return (
    <group>
      <RBox size={[0.72, 0.42, 0.44]} radius={0.04} p={[0, 0.21, 0]} m={solid(P.wood, 0.75)} />
      <RBox size={[0.78, 0.04, 0.5]} radius={0.015} p={[0, 0.44, 0]} m={solid(P.white, 0.6)} />
      <Cyl rad={0.015} h={0.5} p={[-0.34, 0.7, -0.18]} m={solid(P.deepBlue, 0.5)} low />
      <Cyl rad={0.015} h={0.5} p={[0.34, 0.7, -0.18]} m={solid(P.deepBlue, 0.5)} low />
      <group position={[0, 0.98, 0.02]} rotation={[0.35, 0, 0]}>
        {[-0.3, -0.18, -0.06, 0.06, 0.18, 0.3].map((x, i) => (
          <Box key={x} size={[0.12, 0.02, 0.52]} p={[x, 0, 0]} m={solid(stripe[i % 2], 0.7)} />
        ))}
      </group>
      <Ball rad={0.055} p={[-0.3, 0.8, 0.24]} scale={[1, 1.25, 1]} m={glow("#ff7b6b", 0.6, 2.4)} cast={false} />
      <Ball rad={0.055} p={[0.3, 0.8, 0.24]} scale={[1, 1.25, 1]} m={glow(P.stage, 0.6, 2.4)} cast={false} />
      <Cyl rad={0.07} h={0.05} p={[0.1, 0.485, 0.05]} m={solid(P.white, 0.4)} />
      <Cyl rad={0.06} h={0.005} p={[0.1, 0.51, 0.05]} m={solid("#f2c14e", 0.5)} cast={false} />
    </group>
  );
}

function Mural() {
  const tiles: [number, number, number, number, string][] = [
    [-0.27, 0.42, 0.18, 0.18, P.blanket],
    [-0.05, 0.36, 0.2, 0.3, "#7fd3ff"],
    [0.2, 0.44, 0.24, 0.14, P.stage],
    [0.2, 0.27, 0.24, 0.14, "#9be3b0"],
    [-0.27, 0.22, 0.18, 0.18, "#b9a5ff"]
  ];
  return (
    <group>
      <RBox size={[0.86, 0.62, 0.1]} radius={0.04} p={[0, 0.31, 0]} m={solid(P.cafeWall, 0.85)} />
      {tiles.map(([x, y, w, h, c], i) => (
        <RBox key={i} size={[w, h, 0.02]} radius={0.01} p={[x, y, 0.055]} m={glow(c, 0.08, 0.6)} cast={false} />
      ))}
      <Ball rad={0.06} p={[0.31, 0.53, 0.06]} scale={[1, 1, 0.3]} m={glow("#ff9a4d", 0.1, 0.8)} cast={false} />
      {([[-0.3, P.blanket], [-0.2, "#7fd3ff"]] as const).map(([x, c]) => (
        <Cyl key={x} rad={0.035} h={0.07} p={[x, 0.035, 0.16]} m={solid(c, 0.5)} />
      ))}
    </group>
  );
}

function Model({ type }: { type: ProjectType }) {
  switch (type) {
    case "fountain": return <Fountain />;
    case "workshop": return <Workshop />;
    case "stage": return <MiniStage />;
    case "garden": return <Garden />;
    case "arcade_game": return <Arcade />;
    case "observatory": return <Observatory />;
    case "noodle_stand": return <NoodleStand />;
    default: return <Mural />;
  }
}

const yoursStyle: React.CSSProperties = {
  padding: "2px 8px", borderRadius: 999, background: "#fff7df", border: "1px solid #f2c14e",
  color: "#8a6100", fontSize: 9, fontWeight: 600, whiteSpace: "nowrap", userSelect: "none",
  boxShadow: "0 4px 12px rgba(20,40,80,0.12)", fontFamily: "var(--font-ui), Inter, system-ui, sans-serif"
};

/** One built structure on its tile; "★ yours" floats over the viewer's twin's builds. */
export function StructureView({ st, mine }: { st: WorldStructureView; mine: boolean }) {
  const p = tileToWorld(st.col, st.row);
  return (
    <group position={[p.x, 0, p.z]}>
      <StaticBatch key={st.type}>
        <Base accent={STRUCT_ACCENT[st.type] ?? P.accent} />
        <Model type={st.type} />
      </StaticBatch>
      {st.type === "fountain" && <FountainSpray />}
      {mine && (
        <Html position={[0, 1.35, 0]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ pointerEvents: "none" }}>
          <div style={yoursStyle}>★ yours</div>
        </Html>
      )}
    </group>
  );
}
