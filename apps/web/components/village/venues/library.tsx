"use client";

/**
 * The library: an open pavilion like the gym — a slatted roof on four posts
 * over the back half, a low back wall, no front wall — with two bookcases of
 * colourful spines (LIBRARY.shelves), four armchairs round a rug facing the
 * middle (LIBRARY.armchairs), four desks with chairs and desk lamps on the east
 * (LIBRARY.desks), a reading lamp, a side table and plants. Lamps glow at night.
 * The path comes in from +z and stays clear.
 *
 * LibraryStatic goes in the StaticBatch. DeskLaptops shows a laptop on each
 * desk only while its seat is free (a studying twin brings its own laptop).
 */
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { LIBRARY, zoneCenter } from "../../../lib/village/layout";
import { P, ZONE_ACCENT, glow, solid, unit } from "../materials";
import { Ball, Box, Cyl, Ico, RBox } from "../parts";
import { PAD_TOP, SEAT_Y } from "../scenery";
import { VenuePad } from "./common";
import { onScreen, type PlacesSim } from "./visibility";
import { DESK, LIBRARY_ROOF, LIBRARY_RUG, SHELF, bookRow, libraryProp } from "./placeProps";

const ZONE = "library";
const FRAME = "#2a3550";
const SHELF_WOOD = "#8a6446";
const WALL = "#f3ece0";
const CHAIR_COLORS = ["#3dbf9a", "#f5a623", "#ff7a8a", "#8a7cf6"];
const accent = () => ZONE_ACCENT[ZONE] ?? P.accent;

/** A bookcase facing +z, centred at its footprint's middle, standing on the pad. */
function Bookcase({ x, z, w, seed }: { x: number; z: number; w: number; seed: number }) {
  const wood = solid(SHELF_WOOD, 0.8);
  const { h, d, rows } = SHELF;
  const plinth = 0.05, cap = 0.03, side = 0.03;
  const rowH = (h - plinth - cap) / rows;
  const inner = w - 2 * side;
  return (
    <group position={[x, PAD_TOP, z]}>
      <Box size={[w, plinth, d]} p={[0, plinth / 2, 0]} m={wood} />
      <RBox size={[w + 0.03, cap, d + 0.02]} radius={0.008} p={[0, h - cap / 2, 0]} m={wood} />
      {[-1, 1].map((s) => <Box key={s} size={[side, h, d]} p={[s * (w / 2 - side / 2), h / 2, 0]} m={wood} />)}
      <Box size={[w, h, 0.015]} p={[0, h / 2, -d / 2 + 0.0075]} m={solid("#6f4f37", 0.85)} cast={false} />
      {Array.from({ length: rows - 1 }, (_, k) => (
        <Box key={k} size={[inner, 0.02, d - 0.015]} p={[0, plinth + (k + 1) * rowH - 0.01, 0.0075]} m={wood} cast={false} />
      ))}
      {Array.from({ length: rows }, (_, k) => {
        const y0 = plinth + k * rowH + (k > 0 ? 0.01 : 0);
        return bookRow(seed * 7 + k, inner, rowH - 0.04).map((b, i) => (
          <group key={`${k}-${i}`} position={[-inner / 2 + b.x - b.w / 2, y0, 0.01]} rotation={[0, 0, -b.tilt]}>
            <Box size={[b.w, b.h, d * 0.7]} p={[b.w / 2, b.h / 2, 0]} m={solid(b.color, 0.75)} cast={false} />
          </group>
        ));
      })}
    </group>
  );
}

/** Armchair facing local +z; cushion top at SEAT_Y.armchair. */
function Armchair({ x, z, yaw, color }: { x: number; z: number; yaw: number; color: string }) {
  const top = SEAT_Y.armchair - PAD_TOP;
  const fabric = solid(color, 0.85);
  return (
    <group position={[x, PAD_TOP, z]} rotation={[0, yaw, 0]}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
        <Cyl key={`${sx}${sz}`} rad={0.012} h={0.04} p={[sx * 0.14, 0.02, sz * 0.12]} m={solid(P.woodDark, 0.8)} cast={false} low />
      ))}
      <RBox size={[0.34, top - 0.1, 0.32]} radius={0.03} p={[0, 0.04 + (top - 0.1) / 2, 0]} m={fabric} />
      <RBox size={[0.22, 0.06, 0.26]} radius={0.025} p={[0, top - 0.03, 0.02]} m={solid(P.white, 0.9)} />
      <RBox size={[0.34, 0.3, 0.08]} radius={0.03} p={[0, top + 0.08, -0.13]} r={[-0.12, 0, 0]} m={fabric} />
      {[-1, 1].map((s) => <RBox key={s} size={[0.06, 0.1, 0.3]} radius={0.025} p={[s * 0.14, top + 0.01, 0]} m={fabric} />)}
    </group>
  );
}

/** Desk (toward +x of its sitter) with a lamp at the far corner; the chair stands at seatX facing +x. */
function Desk({ x, z, seatX, i }: { x: number; z: number; seatX: number; i: number }) {
  const wood = solid(P.wood, 0.75);
  const frame = solid(FRAME, 0.55);
  const top = DESK.top;
  const seat = SEAT_Y.desk - PAD_TOP;
  return (
    <group position={[0, PAD_TOP, 0]}>
      <group position={[x, 0, z]}>
        <RBox size={[DESK.w, 0.025, DESK.d]} radius={0.01} p={[0, top - 0.0125, 0]} m={wood} />
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
          <Box key={`${sx}${sz}`} size={[0.025, top - 0.025, 0.025]} p={[sx * (DESK.w / 2 - 0.03), (top - 0.025) / 2, sz * (DESK.d / 2 - 0.03)]} m={frame} />
        ))}
        <Box size={[0.02, 0.1, DESK.d - 0.08]} p={[DESK.w / 2 - 0.03, top - 0.08, 0]} m={frame} cast={false} />
        {/* desk lamp at the far corner: base, arm, shade, glowing bulb */}
        <group position={[DESK.w / 2 - 0.07, top, DESK.d / 2 - 0.08]}>
          <Cyl rad={0.03} h={0.012} p={[0, 0.006, 0]} m={frame} cast={false} />
          <Cyl rad={0.005} h={0.16} p={[-0.02, 0.085, 0]} r={[0, 0, 0.25]} m={frame} cast={false} low />
          <mesh geometry={unit.cone()} position={[-0.05, 0.17, 0]} rotation={[0, 0, 0.5]} scale={[0.04, 0.05, 0.04]} material={solid(accent(), 0.55)} />
          <Ball rad={0.016} p={[-0.06, 0.145, 0]} m={glow(P.lampGlow, 0.4, 2.6)} cast={false} low />
        </group>
        {/* a notebook and pen, or a small stack of books */}
        {i % 2 === 0 ? (
          <group position={[-0.03, top, -DESK.d / 2 + 0.1]}>
            <Box size={[0.08, 0.008, 0.06]} p={[0, 0.004, 0]} r={[0, 0.2, 0]} m={solid(P.white, 0.9)} cast={false} />
            <Cyl rad={0.003} h={0.06} p={[0.01, 0.01, 0.03]} r={[Math.PI / 2, 0, 0.6]} m={solid(accent(), 0.6)} cast={false} low />
          </group>
        ) : (
          <group position={[0.05, top, -DESK.d / 2 + 0.08]}>
            {["#e2574c", "#2f6bff", "#ffd27a"].map((c, k) => (
              <Box key={c} size={[0.09 - k * 0.008, 0.018, 0.065]} p={[0, 0.009 + k * 0.018, 0]} r={[0, k * 0.15, 0]} m={solid(c, 0.75)} cast={false} />
            ))}
          </group>
        )}
      </group>
      {/* chair: backrest behind the sitter (−x), seat top at SEAT_Y.desk */}
      <group position={[seatX, 0, z]} rotation={[0, Math.PI / 2, 0]}>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => (
          <Cyl key={`${sx}${sz}`} rad={0.011} h={seat - 0.02} p={[sx * 0.075, (seat - 0.02) / 2, sz * 0.075]} m={frame} low />
        ))}
        <RBox size={[0.2, 0.035, 0.2]} radius={0.014} p={[0, seat - 0.0175, 0]} m={solid(CHAIR_COLORS[i % CHAIR_COLORS.length], 0.7)} />
        <RBox size={[0.2, 0.16, 0.03]} radius={0.014} p={[0, seat + 0.12, -0.095]} r={[-0.1, 0, 0]} m={solid(CHAIR_COLORS[i % CHAIR_COLORS.length], 0.7)} />
      </group>
    </group>
  );
}

/** Slatted roof on four posts over the back half, and a low wall behind the shelves. */
function Pavilion() {
  const R = LIBRARY_ROOF;
  const frame = solid(FRAME, 0.5);
  const w = R.x1 - R.x0, d = R.z1 - R.z0;
  const cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2;
  const slats: number[] = [];
  for (let z = R.z0 + 0.12; z < R.z1 - 0.04; z += 0.2) slats.push(z);
  return (
    <group position={[0, PAD_TOP, 0]}>
      {[[R.x0, R.z0], [R.x1, R.z0], [R.x0, R.z1], [R.x1, R.z1]].map(([x, z]) => (
        <group key={`${x}${z}`}>
          <RBox size={[0.11, 0.05, 0.11]} radius={0.015} p={[x, 0.025, z]} m={frame} />
          <Box size={[0.06, R.y, 0.06]} p={[x, R.y / 2, z]} m={frame} />
        </group>
      ))}
      <Box size={[w + 0.1, 0.08, 0.07]} p={[cx, R.y, R.z0]} m={frame} />
      <Box size={[w + 0.1, 0.08, 0.07]} p={[cx, R.y, R.z1]} m={frame} />
      <Box size={[w + 0.12, 0.05, 0.015]} p={[cx, R.y + 0.005, R.z1 + 0.04]} m={solid(accent(), 0.6)} cast={false} />
      {[R.x0, R.x1].map((x) => <Box key={x} size={[0.07, 0.08, d]} p={[x, R.y, cz]} m={frame} />)}
      {slats.map((z) => <Box key={z} size={[w + 0.12, 0.05, 0.045]} p={[cx, R.y + 0.065, z]} m={solid(P.white, 0.6)} />)}
      <RBox size={[w - 0.06, 0.42, 0.06]} radius={0.02} p={[cx, 0.21, R.z0]} m={solid(WALL, 0.9)} />
      <Box size={[w - 0.02, 0.03, 0.08]} p={[cx, 0.435, R.z0]} m={solid(SHELF_WOOD, 0.8)} />
    </group>
  );
}

function PottedPlant({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, PAD_TOP, z]} scale={s}>
      <Cyl rad={0.08} h={0.15} p={[0, 0.075, 0]} m={solid("#e4a07a", 0.8)} />
      <Ico rad={0.12} p={[0, 0.26, 0]} m={solid(P.foliage, 0.9, true)} scale={[1, 1.3, 1]} />
      <Ico rad={0.07} p={[0.05, 0.38, -0.02]} m={solid(P.foliageDark, 0.9, true)} />
    </group>
  );
}

/** Everything about the library that never moves (goes in the StaticBatch). */
export function LibraryStatic() {
  const c = zoneCenter(ZONE);
  const side = libraryProp("side-table");
  const lamp = libraryProp("floor-lamp");
  const front = libraryProp("plant-front");
  const byDesk = libraryProp("plant-desk");
  const rug = LIBRARY_RUG;
  return (
    <group position={[c.x, 0, c.z]}>
      <VenuePad zone={ZONE} color="#f3f1fb" />
      <Cyl rad={rug.r} h={0.006} p={[rug.x, PAD_TOP + 0.003, rug.z]} m={solid("#c9b8f0", 0.95)} cast={false} />
      <Cyl rad={rug.r - 0.08} h={0.006} p={[rug.x, PAD_TOP + 0.005, rug.z]} m={solid("#f6e3b4", 0.95)} cast={false} />
      <Cyl rad={rug.r - 0.2} h={0.006} p={[rug.x, PAD_TOP + 0.007, rug.z]} m={solid("#c9b8f0", 0.95)} cast={false} />
      <Pavilion />
      {LIBRARY.shelves.map((s, i) => <Bookcase key={i} x={s.x} z={s.z} w={s.w} seed={i + 3} />)}
      {LIBRARY.armchairs.map((a, i) => (
        <Armchair key={i} x={a.x} z={a.z} yaw={Math.atan2(-a.x, -a.z)} color={CHAIR_COLORS[i % CHAIR_COLORS.length]} />
      ))}
      {LIBRARY.desks.map((d, i) => <Desk key={i} x={d.x} z={d.z} seatX={d.seatX} i={i} />)}
      {/* side table between the back armchairs: books and a mug */}
      <group position={[side.x, PAD_TOP, side.z]}>
        <Cyl rad={0.09} h={0.02} p={[0, 0.2, 0]} m={solid(P.wood, 0.75)} />
        <Cyl rad={0.012} h={0.19} p={[0, 0.095, 0]} m={solid(FRAME, 0.55)} low />
        <Cyl rad={0.05} h={0.01} p={[0, 0.005, 0]} m={solid(FRAME, 0.55)} cast={false} />
        <Box size={[0.08, 0.02, 0.06]} p={[-0.02, 0.22, 0]} r={[0, 0.4, 0]} m={solid("#3dbf7a", 0.75)} cast={false} />
        <Cyl rad={0.018} h={0.035} p={[0.04, 0.228, 0.02]} m={solid(P.white, 0.5)} cast={false} />
      </group>
      {/* reading lamp between the front armchairs */}
      <group position={[lamp.x, PAD_TOP, lamp.z]}>
        <Cyl rad={0.06} h={0.015} p={[0, 0.0075, 0]} m={solid(FRAME, 0.55)} cast={false} />
        <Cyl rad={0.008} h={0.6} p={[0, 0.3, 0]} m={solid(FRAME, 0.55)} low />
        <Cyl rad={0.07} h={0.09} p={[0, 0.62, 0]} m={glow("#ffe9b8", 0.3, 2.2)} cast={false} />
      </group>
      <PottedPlant x={front.x} z={front.z} />
      <PottedPlant x={byDesk.x} z={byDesk.z} s={0.85} />
    </group>
  );
}

// ---------------- live: laptops on free desks ----------------

/** Open laptop facing its sitter (−x): keyboard toward the chair, screen at the far side. */
function Laptop({ open }: { open: boolean }) {
  const body = solid("#c9d3df", 0.4);
  if (!open) {
    return (
      <group>
        <RBox size={[0.09, 0.012, 0.13]} radius={0.004} p={[0, 0.006, 0]} m={body} cast={false} />
        <Ball rad={0.008} p={[0, 0.0125, 0]} scale={[1, 0.1, 1]} m={solid(P.white, 0.4)} cast={false} low />
      </group>
    );
  }
  return (
    <group>
      <Box size={[0.09, 0.006, 0.13]} p={[0, 0.003, 0]} m={body} cast={false} />
      <Box size={[0.05, 0.002, 0.11]} p={[-0.008, 0.007, 0]} m={solid("#3a4558", 0.6)} cast={false} />
      <group position={[0.045, 0.006, 0]} rotation={[0, 0, -0.25]}>
        <Box size={[0.006, 0.085, 0.13]} p={[0, 0.0425, 0]} m={body} cast={false} />
        <Box size={[0.002, 0.07, 0.115]} p={[-0.0035, 0.0425, 0]} m={glow("#9fd6ff", 0.5, 1.6)} cast={false} />
      </group>
    </group>
  );
}

/**
 * A laptop on each desk while its seat (spot `desk-i`) is free; a twin who
 * studies brings its own. Without a sim every desk shows one. Polls the sim
 * a few times a second, only while the library is on screen.
 */
export function DeskLaptops({ sim }: { sim?: PlacesSim | null }) {
  const c = zoneCenter(ZONE);
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(c.x + 1.2, 0.4, c.z), 1.3), [c.x, c.z]);
  const [busyMask, setBusyMask] = useState(0);
  const lastPoll = useRef(-1);
  /** Which entries of sim.spots are the desk seats (in desk order). */
  const spotIdx = useMemo(() => LIBRARY.desks.map((_, i) => sim?.spots?.findIndex((s) => s.id === `desk-${i}`) ?? -1), [sim]);

  useFrame(({ camera, clock }) => {
    const t = clock.elapsedTime;
    if (t - lastPoll.current < 0.25 && t >= lastPoll.current) return;
    if (!onScreen(camera, t, sphere)) return;
    lastPoll.current = t;
    let mask = 0;
    for (let i = 0; i < spotIdx.length; i++) {
      const sp = spotIdx[i] >= 0 ? sim?.spots?.[spotIdx[i]] : undefined;
      if (sp?.busyBy) mask |= 1 << i;
    }
    if (mask !== busyMask) setBusyMask(mask);
  });

  return (
    <group position={[c.x, PAD_TOP + DESK.top, c.z]}>
      {LIBRARY.desks.map((d, i) => (busyMask & (1 << i) ? null : (
        <group key={i} position={[d.x - 0.04, 0, d.z - 0.02]}>
          <Laptop open={i % 2 === 0} />
        </group>
      )))}
    </group>
  );
}
