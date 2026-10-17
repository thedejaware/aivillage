"use client";

/**
 * Every place on Main Street, built around the layout's anchors so the spots
 * twins use (SPOTS) line up with a chair, seat, lane, plot, station or slot.
 * Static scenery goes into one StaticBatch; the few moving parts (cinema
 * picture, pool water, coaster cart, bikes, 💤 sign) live outside it and only
 * work while they are on screen. Each place is in ./venues/*.
 */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { ZONE_DISPLAY } from "@aivillage/shared";
import { groundLabelPlacement, EDGE_GAP } from "../../lib/village/venueLabels";
import { COASTER, zoneCenter, type Pt } from "../../lib/village/layout";
import { P, ZONE_ACCENT } from "./materials";
import { StaticBatch, type V3 } from "./parts";
import { GRASS_TOP, PAD_RADIUS } from "./scenery";
import { HOUSE_BODY, houseDoorWorld, labelSpot } from "./decor";
import { Cafe, Lawn, QuietCorner, Stage, stageMark } from "./venues/classic";
import { House, SleepSign } from "./venues/house";
import { Garden } from "./venues/garden";
import { Gym } from "./venues/gym";
import { PoolStatic, PoolWater } from "./venues/pool";
import { CinemaScreen, CinemaStatic } from "./venues/cinema";
import { CoasterCart, FunfairStatic } from "./venues/coaster";
import { BikeRack, Bikes } from "./venues/bikes";
import type { PlacesSim } from "./venues/visibility";

export type { PlacesSim } from "./venues/visibility";

// ---------------- night lights ----------------

/**
 * Warm pools of light at five places; zero by day, so the shader light count
 * never changes. Kept to five: every point light costs every lit pixel.
 */
function VenueLights({ night }: { night: number }) {
  const at = (zone: string, p: Pt, y: number): V3 => {
    const c = zoneCenter(zone);
    return [c.x + p.x, y, c.z + p.z];
  };
  const door = houseDoorWorld();
  const porch: V3 = [door.x + Math.sin(HOUSE_BODY.yaw) * 0.35, 0.75, door.z + Math.cos(HOUSE_BODY.yaw) * 0.35];
  return (
    <group>
      <pointLight position={at("maker_space", { x: 0, z: 0.55 }, 1.0)} color="#ffc98a" intensity={night * 2.4} distance={3.2} decay={2} />
      <pointLight position={at("plaza", stageMark(), 1.3)} color="#ffe2a8" intensity={night * 3} distance={3.2} decay={2} />
      <pointLight position={at("event_space", { x: 0.3, z: 0.2 }, 0.9)} color="#ffc2cf" intensity={night * 1.8} distance={2.8} decay={2} />
      <pointLight position={porch} color="#ffd59a" intensity={night * 2} distance={2.6} decay={2} />
      <pointLight position={at("cinema", { x: 0, z: 0.4 }, 1.2)} color="#d9c2ff" intensity={night * 1.8} distance={3} decay={2} />
    </group>
  );
}

// ---------------- signs ----------------

const pillStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 7, padding: "2px 8px", borderRadius: 999,
  background: "rgba(255,255,255,0.96)", boxShadow: "0 4px 12px rgba(20,40,80,0.12)",
  fontFamily: "var(--font-ui), Inter, system-ui, sans-serif", whiteSpace: "nowrap", userSelect: "none"
};

/** World height of the painted letters. */
const NAME_HEIGHT = 0.42;
const CANVAS_H = 160;

/** The page's UI font (next/font gives Inter a generated family name). */
function uiFont(): string {
  const v = typeof document !== "undefined" ? getComputedStyle(document.body).getPropertyValue("--font-ui").trim() : "";
  return v ? `${v}, Inter, system-ui, sans-serif` : "Inter, system-ui, sans-serif";
}

/** Paint `text` into a canvas: bold capitals in the venue colour with a white edge, like road paint. */
function paintName(canvas: HTMLCanvasElement, text: string, color: string): number {
  const ctx = canvas.getContext("2d")!;
  const font = `800 ${CANVAS_H * 0.62}px ${uiFont()}`;
  ctx.font = font;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "6px";
  const pad = 28;
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2;
  canvas.width = w;
  canvas.height = CANVAS_H;
  ctx.font = font; // resizing resets the context
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "6px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 16;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.strokeText(text, w / 2, CANVAS_H / 2 + 4);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, CANVAS_H / 2 + 4);
  return w / CANVAS_H;
}

/**
 * A venue's name painted flat on the ground at the edge nearest the camera,
 * turned to read upright (a map label, not a floating badge — it never covers
 * a twin's name). `more` shows "+N more built" for overflow structures.
 */
function VenueSign({ zone, more }: { zone: string; more: number }) {
  const anchor = LABEL_ANCHOR[zone];
  const c = anchor ?? zoneCenter(zone);
  // an anchored label sits right on its anchor (radius + gap = 0)
  const r = anchor ? -EDGE_GAP : PAD_RADIUS[zone] ?? 1.2;
  const accent = ZONE_ACCENT[zone] ?? P.accent;
  const group = useRef<THREE.Group>(null);
  const turn = useRef(0);
  const plane = useRef<THREE.Mesh>(null);
  const { texture, material } = useMemo(() => {
    const canvas = document.createElement("canvas");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const material = new THREE.MeshBasicMaterial({
      map: texture, transparent: true, depthWrite: false, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
    });
    return { texture, material };
  }, []);

  useEffect(() => {
    const draw = () => {
      const aspect = paintName(texture.image as HTMLCanvasElement, (ZONE_DISPLAY[zone] ?? zone).toUpperCase(), shade(accent, -0.18));
      texture.needsUpdate = true;
      plane.current?.scale.set(NAME_HEIGHT * aspect, NAME_HEIGHT, 1);
    };
    draw();
    void document.fonts?.ready.then(draw); // repaint once the UI font has loaded
    return () => { texture.dispose(); material.dispose(); };
  }, [texture, material, zone, accent]);

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const cam = { x: camera.position.x, z: camera.position.z };
    // anchored names sit on their anchor; the rest swing round their pad to stay off other places
    let p: { x: number; z: number; yaw: number };
    if (anchor) p = groundLabelPlacement(c, r, cam);
    else {
      const s = labelSpot(zone, c, r, cam, turn.current);
      turn.current = s.turn;
      p = s;
    }
    g.position.set(p.x, GRASS_TOP + 0.006, p.z);
    g.rotation.y = p.yaw;
  });

  return (
    <group ref={group}>
      <mesh ref={plane} rotation={[-Math.PI / 2, 0, 0]} material={material} renderOrder={1}>
        <planeGeometry args={[1, 1]} />
      </mesh>
      {more > 0 && (
        <Html position={[0, 0.05, 0.32]} center zIndexRange={[10, 0]} pointerEvents="none" style={{ pointerEvents: "none" }}>
          <div style={{ ...pillStyle, fontSize: 9, fontWeight: 600, color: P.muted }}>+{more} more built</div>
        </Html>
      )}
    </group>
  );
}

/** Places whose name is painted somewhere other than their pad's edge: the coaster's name lies inside its loop. */
const LABEL_ANCHOR: Record<string, Pt> = { funfair: { x: COASTER.cx, z: COASTER.cz } };

/** Darken/lighten a hex colour (HSL lightness). */
function shade(hex: string, amount: number): string {
  const col = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  col.getHSL(hsl);
  col.setHSL(hsl.h, Math.min(1, hsl.s + 0.1), Math.max(0, Math.min(1, hsl.l + amount)));
  return `#${col.getHexString()}`;
}

// ---------------- all venues ----------------

/**
 * Every place plus its painted name. `overflow` maps zone → count of hidden
 * extra structures; `sim` (optional) drives the cart, the bikes and the 💤 sign.
 */
export function Venues({ night, overflow, sim }: { night: number; overflow: Map<string, number>; sim?: PlacesSim | null }) {
  return (
    <group>
      <StaticBatch>
        <House />
        <QuietCorner />
        <BikeRack />
        <Cafe />
        <Garden />
        <Stage />
        <Gym />
        <PoolStatic />
        <Lawn />
        <CinemaStatic />
        <FunfairStatic />
      </StaticBatch>
      <PoolWater />
      <CinemaScreen />
      <CoasterCart sim={sim} />
      <Bikes sim={sim} />
      <SleepSign sim={sim} />
      <VenueLights night={night} />
      {Object.keys(PAD_RADIUS).map((z) => <VenueSign key={z} zone={z} more={overflow.get(z) ?? 0} />)}
    </group>
  );
}
