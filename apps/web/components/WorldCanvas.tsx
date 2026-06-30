"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { WorldState, WorldTwinView, WorldStructureView, ProjectType } from "@aivillage/shared";

const TILE_W = 64;
const TILE_H = 32;
const C0 = -2, C1 = 9, R0 = -2, R1 = 9; // platform tile bounds

const isoX = (col: number, row: number) => (col - row) * (TILE_W / 2);
const isoY = (col: number, row: number) => (col + row) * (TILE_H / 2);

const STRUCTURE_COLOR: Record<ProjectType, number> = {
  fountain: 0x5be0c8, mural: 0xff6f9c, noodle_stand: 0xffd166, arcade_game: 0x5b8cff,
  garden: 0x3ddc97, observatory: 0xc98cff, stage: 0xff9a5b, workshop: 0xffa24b
};

const prettyZone = (n: string) => n.replace(/_/g, " ").toUpperCase();
const short = (s: string) => (s.length > 56 ? s.slice(0, 54).trimEnd() + "…" : s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface TwinSprite {
  root: Container;
  figure: Container;
  legL: Graphics;
  legR: Graphics;
  bubble: Container | null;
  say: string | null;
  tx: number;
  ty: number;
  walk: number;
  phase: number;
}

interface Scene {
  app: Application;
  world: Container;
  structureLayer: Container;
  twinLayer: Container;
  twins: Map<string, TwinSprite>;
  structures: Set<string>;
  tick: number;
}

export default function WorldCanvas({ state }: { state: WorldState }) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const pending = useRef<WorldState>(state);

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

      // starfield (fixed, behind the camera)
      const stars = new Graphics();
      for (let i = 0; i < 220; i++) {
        stars.circle(Math.random() * app.screen.width, Math.random() * app.screen.height, Math.random() * 1.3)
          .fill({ color: 0xffffff, alpha: Math.random() * 0.6 + 0.12 });
      }
      app.stage.addChild(stars);

      // camera world
      const world = new Container();
      world.x = app.screen.width / 2;
      world.y = app.screen.height / 2 - 110;
      app.stage.addChild(world);

      drawPlatform(world);

      for (const z of pending.current.zones) {
        const label = new Text({ text: prettyZone(z.name), style: new TextStyle({ fill: 0x8fb6ff, fontSize: 11, fontFamily: "monospace", letterSpacing: 1, fontWeight: "bold" }) });
        label.x = isoX(z.col, z.row) - 30;
        label.y = isoY(z.col, z.row) + 4;
        world.addChild(label);
      }

      const structureLayer = new Container();
      const twinLayer = new Container();
      world.addChild(structureLayer, twinLayer);

      const scene: Scene = { app, world, structureLayer, twinLayer, twins: new Map(), structures: new Set(), tick: 0 };
      sceneRef.current = scene;

      app.ticker.add(() => animate(scene));
      reconcile(scene, pending.current);

      // ---- camera controls: wheel zoom + drag pan ----
      const canvas = app.canvas as HTMLCanvasElement;
      let dragging = false, lx = 0, ly = 0, moved = 0;
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
      const onDown = (e: PointerEvent) => { dragging = true; lx = e.clientX; ly = e.clientY; moved = 0; canvas.style.cursor = "grabbing"; };
      const onMove = (e: PointerEvent) => {
        if (!dragging) return;
        world.x += e.clientX - lx;
        world.y += e.clientY - ly;
        moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
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

// ---------- scene drawing ----------

function drawPlatform(world: Container): void {
  const top = { x: isoX(C0, R0), y: isoY(C0, R0) };
  const right = { x: isoX(C1, R0) + TILE_W / 2, y: isoY(C1, R0) + TILE_H / 2 };
  const bottom = { x: isoX(C1, R1), y: isoY(C1, R1) + TILE_H };
  const left = { x: isoX(C0, R1) - TILE_W / 2, y: isoY(C0, R1) + TILE_H / 2 };
  const depth = 20;

  const g = new Graphics();
  // thickness (floating slab) faces
  g.poly([left.x, left.y, bottom.x, bottom.y, bottom.x, bottom.y + depth, left.x, left.y + depth]).fill({ color: 0x081025 });
  g.poly([bottom.x, bottom.y, right.x, right.y, right.x, right.y + depth, bottom.x, bottom.y + depth]).fill({ color: 0x05080f });
  // top surface
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).fill({ color: 0x0b1830 });
  // grid lines
  for (let c = C0; c <= C1 + 1; c++) {
    g.moveTo(isoX(c, R0), isoY(c, R0)).lineTo(isoX(c, R1 + 1), isoY(c, R1 + 1)).stroke({ color: 0x2f6dba, width: 1, alpha: 0.35 });
  }
  for (let r = R0; r <= R1 + 1; r++) {
    g.moveTo(isoX(C0, r), isoY(C0, r)).lineTo(isoX(C1 + 1, r), isoY(C1 + 1, r)).stroke({ color: 0x2f6dba, width: 1, alpha: 0.35 });
  }
  // glowing edge
  g.poly([top.x, top.y, right.x, right.y, bottom.x, bottom.y, left.x, left.y]).stroke({ color: 0x5be0c8, width: 2, alpha: 0.55 });
  world.addChild(g);
}

function createTwin(t: WorldTwinView, _sc: Scene): TwinSprite {
  const root = new Container();

  // glowing ring on the ground (does not bob)
  const ring = new Graphics();
  ring.ellipse(0, TILE_H / 2 + 2, 13, 5).fill({ color: 0x3aa0ff, alpha: 0.18 });
  ring.ellipse(0, TILE_H / 2 + 2, 13, 5).stroke({ color: 0x6fc3ff, width: 1.5, alpha: 0.75 });
  root.addChild(ring);

  const shadow = new Graphics();
  shadow.ellipse(0, TILE_H / 2 + 1, 7, 2.6).fill({ color: 0x000000, alpha: 0.4 });
  root.addChild(shadow);

  const figure = new Container();
  const legL = new Graphics();
  legL.rect(-2.6, 5, 2.2, 5).fill({ color: 0x222a3d });
  legL.rect(-3, 9.5, 2.8, 1.8).fill({ color: 0x12161f }); // shoe
  const legR = new Graphics();
  legR.rect(0.4, 5, 2.2, 5).fill({ color: 0x222a3d });
  legR.rect(0.2, 9.5, 2.8, 1.8).fill({ color: 0x12161f });
  const torso = new Graphics();
  torso.roundRect(-4, -4, 8, 10, 2).fill({ color: t.colorHex }); // shirt
  const armL = new Graphics();
  armL.rect(-5.4, -3, 1.8, 7).fill({ color: t.colorHex });
  const armR = new Graphics();
  armR.rect(3.6, -3, 1.8, 7).fill({ color: t.colorHex });
  const head = new Graphics();
  head.roundRect(-3, -12, 6, 7, 2).fill({ color: 0xf2cda6 }); // skin
  const hair = new Graphics();
  hair.roundRect(-3.2, -12.6, 6.4, 3, 1.5).fill({ color: 0x2a2330 }); // hair
  const eyes = new Graphics();
  eyes.rect(-1.6, -9, 1, 1).fill({ color: 0x1a1a22 });
  eyes.rect(0.6, -9, 1, 1).fill({ color: 0x1a1a22 });
  figure.addChild(legL, legR, armL, armR, torso, head, hair, eyes);
  figure.y = TILE_H / 2;
  figure.scale.set(1.9);
  root.addChild(figure);

  const name = new Text({ text: (t.flag ? t.flag + " " : "") + t.name, style: new TextStyle({ fill: 0xeaf0ff, fontSize: 10, fontFamily: "monospace" }) });
  name.anchor.set(0.5, 0);
  name.y = TILE_H / 2 + 16;
  const nameBg = new Graphics();
  nameBg.roundRect(-name.width / 2 - 4, name.y - 1, name.width + 8, name.height + 2, 3).fill({ color: 0x070b16, alpha: 0.6 });
  root.addChild(nameBg, name);

  root.x = isoX(t.col, t.row);
  root.y = isoY(t.col, t.row);
  _sc.twinLayer.addChild(root);

  return { root, figure, legL, legR, bubble: null, say: null, tx: root.x, ty: root.y, walk: 0, phase: (hash(t.id) % 628) / 100 };
}

function updateBubble(spr: TwinSprite, sayText: string): void {
  if (spr.bubble) {
    spr.root.removeChild(spr.bubble);
    spr.bubble.destroy({ children: true });
    spr.bubble = null;
  }
  if (!sayText) return;
  const pad = 5;
  const txt = new Text({ text: short(sayText), style: new TextStyle({ fill: 0xc3d2f0, fontSize: 9, fontFamily: "monospace", wordWrap: true, wordWrapWidth: 116 }) });
  const bw = txt.width + pad * 2;
  const bh = txt.height + pad * 2;
  const bubble = new Container();
  const bg = new Graphics();
  bg.roundRect(-bw / 2, 0, bw, bh, 5).fill({ color: 0x070b16, alpha: 0.94 }).stroke({ color: 0x2f63a0, width: 1 });
  bg.poly([-4, bh, 4, bh, 0, bh + 6]).fill({ color: 0x070b16, alpha: 0.94 });
  txt.x = -bw / 2 + pad;
  txt.y = pad;
  bubble.addChild(bg, txt);
  bubble.y = -30 - bh;
  spr.root.addChild(bubble);
  spr.bubble = bubble;
}

function addStructure(st: WorldStructureView, sc: Scene): void {
  const x = isoX(st.col, st.row);
  const y = isoY(st.col, st.row);
  const color = STRUCTURE_COLOR[st.type] ?? 0x5b8cff;
  const g = new Graphics();
  g.poly([x, y + 6, x + 13, y + 12, x, y + 18, x - 13, y + 12]).fill({ color: 0x14305a });
  g.rect(x - 8, y - 16, 16, 26).fill({ color }).stroke({ color: 0xffffff, alpha: 0.16, width: 1 });
  g.rect(x - 8, y - 16, 16, 5).fill({ color: 0xffffff, alpha: 0.22 });
  sc.structureLayer.addChild(g);
}

function reconcile(sc: Scene, s: WorldState): void {
  sc.tick += 1;
  for (const t of s.twins) {
    let spr = sc.twins.get(t.id);
    if (!spr) {
      spr = createTwin(t, sc);
      sc.twins.set(t.id, spr);
    }
    const h = hash(t.id + ":" + sc.tick);
    const dc = ((h % 5) - 2) * 0.35;
    const dr = (((h >> 3) % 5) - 2) * 0.35;
    spr.tx = isoX(t.col + dc, t.row + dr);
    spr.ty = isoY(t.col + dc, t.row + dr);
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
    const dx = spr.tx - spr.root.x;
    const dy = spr.ty - spr.root.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.6) {
      spr.root.x += dx * 0.06;
      spr.root.y += dy * 0.06;
      spr.walk += 0.35;
      spr.legL.y = Math.sin(spr.walk) * 2;
      spr.legR.y = Math.sin(spr.walk + Math.PI) * 2;
      spr.figure.y = TILE_H / 2 - Math.abs(Math.sin(spr.walk)) * 1.5;
    } else {
      spr.legL.y = 0;
      spr.legR.y = 0;
      spr.figure.y = TILE_H / 2 + Math.sin(t * 1.8 + spr.phase) * 1.5;
    }
  }
}
