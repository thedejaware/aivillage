"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { WorldState, WorldTwinView, WorldStructureView, WorldZone, ProjectType } from "@aivillage/shared";

const TILE_W = 64;
const TILE_H = 32;
const C0 = -2, C1 = 9, R0 = -2, R1 = 9;

const isoX = (col: number, row: number) => (col - row) * (TILE_W / 2);
const isoY = (col: number, row: number) => (col + row) * (TILE_H / 2);

const ZONE_ACCENT: Record<string, number> = {
  plaza: 0x5be0c8, maker_space: 0xffa24b, network_hub: 0x3ddc97, event_space: 0xff9a5b
};

const prettyZone = (n: string) => n.replace(/_/g, " ").toUpperCase();
const short = (s: string) => (s.length > 56 ? s.slice(0, 54).trimEnd() + "…" : s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
/** Multiply a hex colour's channels by f (shading for iso faces). */
function shade(color: number, f: number): number {
  const r = clamp(Math.round(((color >> 16) & 0xff) * f), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) * f), 0, 255);
  const b = clamp(Math.round((color & 0xff) * f), 0, 255);
  return (r << 16) | (g << 8) | b;
}

/** Isometric box: ground diamond centre (x, gy), half-width w, height h. */
function isoBox(g: Graphics, x: number, gy: number, w: number, h: number, color: number): void {
  const d = w / 2;
  // left face
  g.poly([x - w, gy - h, x, gy - h + d, x, gy + d, x - w, gy]).fill({ color: shade(color, 0.72) });
  // right face
  g.poly([x + w, gy - h, x, gy - h + d, x, gy + d, x + w, gy]).fill({ color: shade(color, 0.5) });
  // top face
  g.poly([x, gy - h - d, x + w, gy - h, x, gy - h + d, x - w, gy - h]).fill({ color: shade(color, 1.12) });
  g.poly([x, gy - h - d, x + w, gy - h, x, gy - h + d, x - w, gy - h]).stroke({ color: 0xffffff, alpha: 0.12, width: 1 });
}

interface TwinSprite {
  root: Container;
  figure: Container;
  legL: Graphics;
  legR: Graphics;
  ring: Graphics;
  bubble: Container | null;
  say: string | null;
  tx: number;
  ty: number;
  /** anchor: the twin's "home" spot from the last world frame (wander returns near it) */
  ax: number;
  ay: number;
  /** staggered frame target: applied when the clock passes applyAt */
  nextTx: number;
  nextTy: number;
  applyAt: number;
  /** ambient life: when to take the next idle stroll */
  nextWanderAt: number;
  /** per-twin walking speed so they don't move in lockstep */
  speed: number;
  walk: number;
  phase: number;
}

interface Scene {
  app: Application;
  world: Container;
  entities: Container;
  twins: Map<string, TwinSprite>;
  structures: Set<string>;
  occupied: Set<string>;
  overflow: Map<string, { count: number; text: Text }>;
  zones: WorldZone[];
  sprays: Graphics[];
  motes: { g: Graphics; x: number; y: number; v: number; a: number }[];
  myId: { readonly current: string | null };
  tick: number;
}

export default function WorldCanvas({ state, myTwinId }: { state: WorldState; myTwinId?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const pending = useRef<WorldState>(state);
  const myIdRef = useRef<string | null>(myTwinId ?? null);

  useEffect(() => {
    myIdRef.current = myTwinId ?? null;
  }, [myTwinId]);

  const zoom = (factor: number) => {
    const sc = sceneRef.current;
    if (!sc) return;
    const w = sc.world;
    const cx = sc.app.screen.width / 2;
    const cy = sc.app.screen.height / 2;
    const old = w.scale.x;
    const ns = clamp(old * factor, 0.4, 3.5);
    w.x = cx - (cx - w.x) * (ns / old);
    w.y = cy - (cy - w.y) * (ns / old);
    w.scale.set(ns);
  };

  useEffect(() => {
    let destroyed = false;
    let app: Application | null = null;
    const cleanups: Array<() => void> = [];

    (async () => {
      const instance = new Application();
      await instance.init({ background: 0x05070f, antialias: true, resizeTo: window });
      if (destroyed) {
        instance.destroy(true, { children: true });
        return;
      }
      app = instance;
      ref.current!.replaceChildren(app.canvas);

      // deep-space backdrop: nebula blots + stars
      const nebula = new Graphics();
      const nebulaColors = [0x1a1440, 0x0e2a4a, 0x241040];
      for (let i = 0; i < 6; i++) {
        nebula.ellipse(Math.random() * app.screen.width, Math.random() * app.screen.height, 220 + Math.random() * 260, 120 + Math.random() * 160)
          .fill({ color: nebulaColors[i % 3], alpha: 0.16 });
      }
      app.stage.addChild(nebula);
      const stars = new Graphics();
      for (let i = 0; i < 260; i++) {
        stars.circle(Math.random() * app.screen.width, Math.random() * app.screen.height, Math.random() * 1.4)
          .fill({ color: 0xffffff, alpha: Math.random() * 0.65 + 0.1 });
      }
      app.stage.addChild(stars);

      const world = new Container();
      world.x = app.screen.width / 2;
      world.y = app.screen.height / 2 - 110;
      app.stage.addChild(world);

      drawPlatform(world);
      drawZoneFloors(world, pending.current.zones);

      const entities = new Container();
      entities.sortableChildren = true;
      world.addChild(entities);

      const scene: Scene = {
        app, world, entities, twins: new Map(), structures: new Set(),
        occupied: new Set(), overflow: new Map(), zones: pending.current.zones,
        sprays: [], motes: [], myId: myIdRef, tick: 0
      };
      sceneRef.current = scene;

      drawZoneLabels(world, pending.current.zones);
      spawnMotes(scene, world);

      app.ticker.add(() => animate(scene));
      reconcile(scene, pending.current);

      // camera: wheel zoom + drag pan
      const canvas = app.canvas as HTMLCanvasElement;
      let dragging = false, lx = 0, ly = 0;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const old = world.scale.x;
        const ns = clamp(old * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.4, 3.5);
        world.x = mx - (mx - world.x) * (ns / old);
        world.y = my - (my - world.y) * (ns / old);
        world.scale.set(ns);
      };
      const onDown = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; canvas.style.cursor = "grabbing"; };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        world.x += e.clientX - lx;
        world.y += e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
      };
      const onUp = () => { dragging = false; canvas.style.cursor = "grab"; };
      canvas.style.cursor = "grab";
      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      cleanups.push(() => {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      });
    })();

    return () => {
      destroyed = true;
      sceneRef.current = null;
      for (const c of cleanups) c();
      if (app) app.destroy(true, { children: true });
    };
  }, []);

  useEffect(() => {
    pending.current = state;
    if (sceneRef.current) reconcile(sceneRef.current, state);
  }, [state]);

  return (
    <>
      <div ref={ref} style={{ position: "fixed", inset: 0 }} />
      <div style={{ position: "fixed", left: 22, bottom: 20, zIndex: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => zoom(1.2)} style={zoomBtn}>+</button>
        <button onClick={() => zoom(1 / 1.2)} style={zoomBtn}>−</button>
        <span style={{ color: "#5e729c", fontSize: 11, fontFamily: "monospace" }}>scroll to zoom · drag to pan</span>
      </div>
    </>
  );
}

const zoomBtn: React.CSSProperties = {
  width: 30, height: 30, background: "#16314f", color: "#9fd9ff", border: "1px solid #2f63a0",
  borderRadius: 6, fontSize: 16, cursor: "pointer", fontFamily: "monospace"
};

// ---------------- world dressing ----------------

function drawPlatform(world: Container): void {
  const top = { x: isoX(C0, R0), y: isoY(C0, R0) };
  const right = { x: isoX(C1, R0) + TILE_W / 2, y: isoY(C1, R0) + TILE_H / 2 };
  const bottom = { x: isoX(C1, R1), y: isoY(C1, R1) + TILE_H };
  const left = { x: isoX(C0, R1) - TILE_W / 2, y: isoY(C0, R1) + TILE_H / 2 };
  const depth = 26;

  const g = new Graphics();
  // under-glow (floating in space)
  g.ellipse((left.x + right.x) / 2, bottom.y + 34, (right.x - left.x) / 2.1, 26).fill({ color: 0x1b3f7a, alpha: 0.18 });
  // slab sides
  g.poly([left.x, left.y, bottom.x, bottom.y, bottom.x, bottom.y + depth, left.x, left.y + depth]).fill({ color: 0x0a1226 });
  g.poly([bottom.x, bottom.y, right.x, right.y, right.x, right.y + depth, bottom.x, bottom.y + depth]).fill({ color: 0x060a14 });
  g.moveTo(left.x, left.y + depth).lineTo(bottom.x, bottom.y + depth).lineTo(right.x, right.y + depth)
    .stroke({ color: 0x39d0ff, alpha: 0.25, width: 1.5 });
  // top surface
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).fill({ color: 0x0c1a36 });
  // fine grid
  for (let c = C0; c <= C1 + 1; c++) {
    g.moveTo(isoX(c, R0), isoY(c, R0)).lineTo(isoX(c, R1 + 1), isoY(c, R1 + 1)).stroke({ color: 0x3a7bd5, width: 1, alpha: 0.22 });
  }
  for (let r = R0; r <= R1 + 1; r++) {
    g.moveTo(isoX(C0, r), isoY(C0, r)).lineTo(isoX(C1 + 1, r), isoY(C1 + 1, r)).stroke({ color: 0x3a7bd5, width: 1, alpha: 0.22 });
  }
  // glowing rim (double stroke = glow)
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).stroke({ color: 0x5be0c8, width: 4, alpha: 0.18 });
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).stroke({ color: 0x7df0dc, width: 1.6, alpha: 0.8 });
  world.addChild(g);
}

function drawZoneFloors(world: Container, zones: WorldZone[]): void {
  const g = new Graphics();
  for (const z of zones) {
    const accent = ZONE_ACCENT[z.name] ?? 0x5b8cff;
    const cx = isoX(z.col, z.row);
    const cy = isoY(z.col, z.row) + TILE_H / 2;
    const w = TILE_W * 2.6;
    const h = TILE_H * 2.6;
    g.poly([cx, cy - h, cx + w, cy, cx, cy + h, cx - w, cy]).fill({ color: accent, alpha: 0.05 });
    g.poly([cx, cy - h, cx + w, cy, cx, cy + h, cx - w, cy]).stroke({ color: accent, alpha: 0.28, width: 1.2 });
  }
  world.addChild(g);
}

function drawZoneLabels(world: Container, zones: WorldZone[]): void {
  for (const z of zones) {
    const accent = ZONE_ACCENT[z.name] ?? 0x8fb6ff;
    const label = new Text({
      text: prettyZone(z.name),
      style: new TextStyle({ fill: accent, fontSize: 11, fontFamily: "monospace", letterSpacing: 2, fontWeight: "bold" })
    });
    label.anchor.set(0.5, 0.5);
    const pill = new Graphics();
    const px = isoX(z.col, z.row);
    const py = isoY(z.col, z.row) + TILE_H * 2.4;
    pill.roundRect(px - label.width / 2 - 8, py - 9, label.width + 16, 18, 4).fill({ color: 0x060a14, alpha: 0.85 });
    pill.roundRect(px - label.width / 2 - 8, py - 9, label.width + 16, 18, 4).stroke({ color: accent, alpha: 0.4, width: 1 });
    label.x = px;
    label.y = py;
    world.addChild(pill, label);
  }
}

function spawnMotes(sc: Scene, world: Container): void {
  for (let i = 0; i < 36; i++) {
    const g = new Graphics();
    const x = isoX(C0 + Math.random() * (C1 - C0), R0 + Math.random() * (R1 - R0));
    const y = isoY(C0 + Math.random() * (C1 - C0), R0 + Math.random() * (R1 - R0)) - Math.random() * 60;
    const a = 0.12 + Math.random() * 0.25;
    g.circle(0, 0, 0.8 + Math.random() * 1.1).fill({ color: 0x9fd9ff, alpha: a });
    g.x = x; g.y = y;
    world.addChild(g);
    sc.motes.push({ g, x, y, v: 0.06 + Math.random() * 0.1, a });
  }
}

// ---------------- structures (real designs) ----------------

function drawStructure(sc: Scene, type: ProjectType, x: number, gy: number): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  // soft ground glow
  const accent: number = ({
    fountain: 0x5be0c8, mural: 0xff6f9c, noodle_stand: 0xffd166, arcade_game: 0x5b8cff,
    garden: 0x3ddc97, observatory: 0xc98cff, stage: 0xff9a5b, workshop: 0xffa24b
  } as Record<ProjectType, number>)[type] ?? 0x5b8cff;
  g.ellipse(x, gy + 6, 20, 8).fill({ color: accent, alpha: 0.08 });

  switch (type) {
    case "fountain": {
      isoBox(g, x, gy + 4, 16, 6, 0x2e5d8a); // stone basin
      g.poly([x, gy - 2 - 6, x + 11, gy - 2, x, gy - 2 + 6, x - 11, gy - 2]).fill({ color: 0x53d6e8, alpha: 0.95 }); // water
      isoBox(g, x, gy - 2, 3, 9, 0x3a6d9a); // column
      const spray = new Graphics();
      spray.circle(x, gy - 16, 2.4).fill({ color: 0xbdf6ff, alpha: 0.9 });
      spray.circle(x - 4, gy - 12, 1.5).fill({ color: 0xbdf6ff, alpha: 0.7 });
      spray.circle(x + 4, gy - 12, 1.5).fill({ color: 0xbdf6ff, alpha: 0.7 });
      c.addChild(spray);
      sc.sprays.push(spray);
      break;
    }
    case "workshop": {
      isoBox(g, x, gy + 2, 14, 20, 0xb96a2e); // building
      g.poly([x, gy - 18 - 9, x + 15, gy - 18, x, gy - 18 + 9, x - 15, gy - 18]).fill({ color: 0x7a4620 }); // roof
      g.poly([x, gy - 18 - 9, x + 15, gy - 18, x, gy - 18 + 9, x - 15, gy - 18]).stroke({ color: 0xffc98a, alpha: 0.35, width: 1 });
      g.poly([x - 9, gy - 6, x - 4, gy - 3.5, x - 4, gy + 4, x - 9, gy + 1.5]).fill({ color: 0x3a2414 }); // door
      g.poly([x + 4, gy - 9, x + 9, gy - 11.5, x + 9, gy - 5.5, x + 4, gy - 3]).fill({ color: 0xffdf9e, alpha: 0.95 }); // lit window
      g.moveTo(x + 6, gy - 24).lineTo(x + 6, gy - 32).stroke({ color: 0x888, width: 1 });
      g.circle(x + 6, gy - 33, 1.4).fill({ color: 0xff6b6b, alpha: 0.9 }); // antenna
      break;
    }
    case "stage": {
      isoBox(g, x, gy + 3, 18, 7, 0x8a4a2e); // platform
      isoBox(g, x - 13, gy - 4, 1.6, 17, 0x333a4d); // posts
      isoBox(g, x + 13, gy - 4, 1.6, 17, 0x333a4d);
      g.rect(x - 14, gy - 22, 28, 3).fill({ color: 0x222836 }); // truss
      for (const lx of [-9, 0, 9]) {
        g.circle(x + lx, gy - 19, 4.5).fill({ color: 0xffe28a, alpha: 0.18 });
        g.circle(x + lx, gy - 19, 1.8).fill({ color: 0xfff3c4, alpha: 0.95 });
      }
      break;
    }
    case "garden": {
      g.poly([x, gy + 4 - 8, x + 15, gy + 4, x, gy + 4 + 8, x - 15, gy + 4]).fill({ color: 0x2c4a2e }); // bed
      g.poly([x, gy + 4 - 8, x + 15, gy + 4, x, gy + 4 + 8, x - 15, gy + 4]).stroke({ color: 0x6bd6a0, alpha: 0.3, width: 1 });
      for (const [bx, by, r] of [[-6, -2, 4.5], [3, -5, 5.5], [7, 1, 3.8]] as const) {
        g.circle(x + bx, gy + by - 3, r).fill({ color: 0x1f8a54 });
        g.circle(x + bx - 1, gy + by - 5, r * 0.7).fill({ color: 0x3ddc97 });
      }
      g.circle(x - 3, gy - 6, 1).fill({ color: 0xffd1e8 }); // blossoms
      g.circle(x + 6, gy - 8, 1).fill({ color: 0xfff3a6 });
      break;
    }
    case "arcade_game": {
      isoBox(g, x, gy + 2, 12, 17, 0x3b5bd9);
      g.poly([x + 3, gy - 10, x + 9, gy - 13, x + 9, gy - 4, x + 3, gy - 1]).fill({ color: 0x54e8ff, alpha: 0.95 }); // screen
      g.rect(x - 8, gy - 20, 16, 3).fill({ color: 0x8fb0ff }); // marquee
      break;
    }
    case "observatory": {
      isoBox(g, x, gy + 2, 13, 15, 0x7a4ecb);
      g.circle(x, gy - 17, 8).fill({ color: 0xa88ae0 }); // dome
      g.circle(x - 2, gy - 19, 8).fill({ color: 0xc4aef0, alpha: 0.5 });
      g.rect(x - 1, gy - 25, 2, 8).fill({ color: 0x2a1e44 }); // slit
      break;
    }
    case "noodle_stand": {
      isoBox(g, x, gy + 3, 12, 9, 0xc9a13c);
      g.poly([x, gy - 6 - 8, x + 14, gy - 6, x, gy - 6 + 8, x - 14, gy - 6]).fill({ color: 0xd94f4f }); // awning
      g.poly([x, gy - 6 - 8, x + 14, gy - 6, x, gy - 6 + 8, x - 14, gy - 6]).stroke({ color: 0xffe9c4, alpha: 0.5, width: 1 });
      g.circle(x - 9, gy - 12, 1.8).fill({ color: 0xffd166, alpha: 0.95 }); // lantern
      break;
    }
    default: { // mural
      isoBox(g, x, gy + 2, 15, 12, 0x8a3a5a);
      for (let i = 0; i < 5; i++) {
        g.rect(x - 11 + i * 4.4, gy - 9 + (i % 2) * 3, 3.2, 3.2)
          .fill({ color: [0xff6f9c, 0x5be0c8, 0xffd166, 0x5b8cff, 0x3ddc97][i], alpha: 0.9 });
      }
    }
  }
  c.zIndex = gy;
  sc.entities.addChild(c);
  return c;
}

// ---------------- twins ----------------

function createTwin(t: WorldTwinView, sc: Scene): TwinSprite {
  const root = new Container();

  const ring = new Graphics();
  ring.ellipse(0, TILE_H / 2 + 2, 13, 5).fill({ color: 0x3aa0ff, alpha: 0.15 });
  ring.ellipse(0, TILE_H / 2 + 2, 13, 5).stroke({ color: 0x6fc3ff, width: 1.5, alpha: 0.8 });
  root.addChild(ring);

  const shadow = new Graphics();
  shadow.ellipse(0, TILE_H / 2 + 1, 7, 2.6).fill({ color: 0x000000, alpha: 0.4 });
  root.addChild(shadow);

  const figure = new Container();
  const outline = new Graphics(); // subtle dark silhouette behind for pop
  outline.roundRect(-4.8, -13.4, 9.6, 24.4, 3).fill({ color: 0x080b14, alpha: 0.55 });
  const legL = new Graphics();
  legL.rect(-2.8, 5, 2.3, 5.2).fill({ color: 0x232c42 });
  legL.rect(-3.3, 9.6, 3.2, 1.9).fill({ color: 0x11141d });
  const legR = new Graphics();
  legR.rect(0.5, 5, 2.3, 5.2).fill({ color: 0x232c42 });
  legR.rect(0.2, 9.6, 3.2, 1.9).fill({ color: 0x11141d });
  const torso = new Graphics();
  torso.roundRect(-4.2, -4, 8.4, 10, 2).fill({ color: t.colorHex });
  torso.poly([-4.2, -4, -1, -4, -1, 6, -4.2, 6]).fill({ color: 0x000000, alpha: 0.18 }); // side shading
  const armL = new Graphics();
  armL.rect(-5.8, -3, 1.9, 6).fill({ color: shade(t.colorHex, 0.8) });
  armL.rect(-5.8, 2.6, 1.9, 1.6).fill({ color: 0xf2cda6 }); // hand
  const armR = new Graphics();
  armR.rect(3.9, -3, 1.9, 6).fill({ color: shade(t.colorHex, 0.9) });
  armR.rect(3.9, 2.6, 1.9, 1.6).fill({ color: 0xf2cda6 });
  const head = new Graphics();
  head.roundRect(-3.2, -12.4, 6.4, 7.4, 2).fill({ color: 0xf2cda6 });
  head.poly([-3.2, -12.4, -1.2, -12.4, -1.2, -5, -3.2, -5]).fill({ color: 0x000000, alpha: 0.1 });
  const hair = new Graphics();
  hair.roundRect(-3.5, -13.2, 7, 3.4, 1.6).fill({ color: 0x211b2c });
  hair.rect(-3.5, -11, 1.4, 2.6).fill({ color: 0x211b2c }); // sideburn
  const face = new Graphics();
  face.rect(-1.7, -9.2, 1.1, 1.2).fill({ color: 0x191922 });
  face.rect(0.8, -9.2, 1.1, 1.2).fill({ color: 0x191922 });
  face.rect(-0.6, -6.8, 1.4, 0.7).fill({ color: 0xc98a7a }); // mouth
  figure.addChild(outline, legL, legR, armL, armR, torso, head, hair, face);
  figure.y = TILE_H / 2;
  figure.scale.set(2.0);
  root.addChild(figure);

  const name = new Text({ text: (t.flag ? t.flag + " " : "") + t.name, style: new TextStyle({ fill: 0xeaf0ff, fontSize: 10, fontFamily: "monospace" }) });
  name.anchor.set(0.5, 0);
  name.y = TILE_H / 2 + 16;
  const nameBg = new Graphics();
  nameBg.roundRect(-name.width / 2 - 4, name.y - 1, name.width + 8, name.height + 2, 3).fill({ color: 0x070b16, alpha: 0.65 });
  root.addChild(nameBg, name);

  root.x = isoX(t.col, t.row);
  root.y = isoY(t.col, t.row);
  root.zIndex = root.y + 1000; // twins in front of same-row structures
  sc.entities.addChild(root);

  const now = performance.now() / 1000;
  return {
    root, figure, legL, legR, ring, bubble: null, say: null,
    tx: root.x, ty: root.y, ax: root.x, ay: root.y,
    nextTx: root.x, nextTy: root.y, applyAt: 0,
    nextWanderAt: now + 1.5 + Math.random() * 4,
    speed: 0.038 + ((hash(t.id) >> 4) % 28) / 1000, // 0.038–0.066: everyone walks differently
    walk: 0, phase: (hash(t.id) % 628) / 100
  };
}

function updateBubble(spr: TwinSprite, sayText: string): void {
  if (spr.bubble) {
    spr.root.removeChild(spr.bubble);
    spr.bubble.destroy({ children: true });
    spr.bubble = null;
  }
  if (!sayText) return;
  const pad = 6;
  const txt = new Text({ text: short(sayText), style: new TextStyle({ fill: 0xd7e4ff, fontSize: 9, fontFamily: "monospace", wordWrap: true, wordWrapWidth: 118, lineHeight: 12 }) });
  const bw = txt.width + pad * 2;
  const bh = txt.height + pad * 2;
  const bubble = new Container();
  const bg = new Graphics();
  bg.roundRect(-bw / 2, 0, bw, bh, 6).fill({ color: 0x0a1120, alpha: 0.95 }).stroke({ color: 0x3a7bd5, width: 1, alpha: 0.8 });
  bg.poly([-4, bh, 4, bh, 0, bh + 6]).fill({ color: 0x0a1120, alpha: 0.95 });
  txt.x = -bw / 2 + pad;
  txt.y = pad;
  bubble.addChild(bg, txt);
  bubble.y = -34 - bh;
  spr.root.addChild(bubble);
  spr.bubble = bubble;
}

// ---------------- reconcile & animate ----------------

function nearestZone(sc: Scene, col: number, row: number): WorldZone {
  let best = sc.zones[0];
  let bd = Infinity;
  for (const z of sc.zones) {
    const d = (z.col - col) ** 2 + (z.row - row) ** 2;
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

function addStructure(st: WorldStructureView, sc: Scene): void {
  const key = `${Math.round(st.col * 2)},${Math.round(st.row * 2)}`;
  if (sc.occupied.has(key)) {
    // Tile already has a building — count it into the zone's "+N" badge instead of stacking.
    const z = nearestZone(sc, st.col, st.row);
    let o = sc.overflow.get(z.name);
    if (!o) {
      const text = new Text({ text: "", style: new TextStyle({ fill: 0x8fa8d8, fontSize: 9, fontFamily: "monospace" }) });
      text.anchor.set(0.5, 0);
      text.x = isoX(z.col, z.row);
      text.y = isoY(z.col, z.row) + TILE_H * 2.4 + 12;
      sc.entities.addChild(text);
      o = { count: 0, text };
      sc.overflow.set(z.name, o);
    }
    o.count += 1;
    o.text.text = `+${o.count} more built`;
    return;
  }
  sc.occupied.add(key);
  const c = drawStructure(sc, st.type, isoX(st.col, st.row), isoY(st.col, st.row) + TILE_H / 2);
  // Mark buildings made by YOUR twin so you can spot them instantly.
  if (st.builtByTwinId && st.builtByTwinId === sc.myId.current) {
    const star = new Text({ text: "★ yours", style: new TextStyle({ fill: 0xffd166, fontSize: 9, fontFamily: "monospace" }) });
    star.anchor.set(0.5, 1);
    star.x = isoX(st.col, st.row);
    star.y = isoY(st.col, st.row) + TILE_H / 2 - 38;
    c.addChild(star);
  }
}

function reconcile(sc: Scene, s: WorldState): void {
  sc.tick += 1;
  for (const t of s.twins) {
    let spr = sc.twins.get(t.id);
    if (!spr) {
      spr = createTwin(t, sc);
      sc.twins.set(t.id, spr);
    }
    // Stagger each twin's departure by up to ~0.9s so the crowd never moves in lockstep.
    const nx = isoX(t.col, t.row);
    const ny = isoY(t.col, t.row);
    if (nx !== spr.ax || ny !== spr.ay) {
      spr.nextTx = nx;
      spr.nextTy = ny;
      spr.applyAt = performance.now() / 1000 + Math.random() * 0.9;
    }
    if (spr.say !== (t.say ?? null)) {
      spr.say = t.say ?? null;
      updateBubble(spr, t.say ?? "");
    }
  }
  for (const st of s.structures) {
    if (!sc.structures.has(st.id)) {
      addStructure(st, sc);
      sc.structures.add(st.id);
    }
  }
}

function animate(sc: Scene): void {
  const t = performance.now() / 1000;
  for (const spr of sc.twins.values()) {
    // apply a staggered frame target once its delay elapses
    if (spr.applyAt > 0 && t >= spr.applyAt) {
      spr.tx = spr.nextTx;
      spr.ty = spr.nextTy;
      spr.ax = spr.nextTx;
      spr.ay = spr.nextTy;
      spr.applyAt = 0;
      spr.nextWanderAt = t + 2.5 + Math.random() * 4;
    }

    const dx = spr.tx - spr.root.x;
    const dy = spr.ty - spr.root.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.6) {
      spr.root.x += dx * spr.speed;
      spr.root.y += dy * spr.speed;
      spr.walk += 0.33;
      spr.legL.y = Math.sin(spr.walk) * 2.1;
      spr.legR.y = Math.sin(spr.walk + Math.PI) * 2.1;
      spr.figure.y = TILE_H / 2 - Math.abs(Math.sin(spr.walk)) * 1.6;
    } else {
      spr.legL.y = 0;
      spr.legR.y = 0;
      spr.figure.y = TILE_H / 2 + Math.sin(t * 1.8 + spr.phase) * 1.4;
      // ambient life: idle twins take a short stroll near their anchor every few seconds
      if (t >= spr.nextWanderAt) {
        spr.tx = spr.ax + (Math.random() - 0.5) * TILE_W * 1.5;
        spr.ty = spr.ay + (Math.random() - 0.5) * TILE_H * 1.5;
        spr.nextWanderAt = t + 4 + Math.random() * 8;
      }
    }
    spr.root.zIndex = spr.root.y + 1000;
    const pulse = 1 + Math.sin(t * 2.2 + spr.phase) * 0.12;
    spr.ring.scale.set(pulse, pulse);
  }
  for (const sp of sc.sprays) {
    sp.alpha = 0.65 + Math.sin(t * 3 + sp.x) * 0.3;
    sp.y = Math.sin(t * 2.4 + sp.x) * 1.2;
  }
  for (const m of sc.motes) {
    m.y -= m.v;
    if (m.y < -80) m.y = 140;
    m.g.y = m.y;
    m.g.alpha = m.a * (0.6 + Math.sin(t + m.x) * 0.4);
  }
}
