"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { WorldState, WorldTwinView, WorldStructureView, ProjectType } from "@aivillage/shared";

const TILE_W = 64;
const TILE_H = 32;

const isoX = (col: number, row: number, ox: number) => (col - row) * (TILE_W / 2) + ox;
const isoY = (col: number, row: number, oy: number) => (col + row) * (TILE_H / 2) + oy;

const STRUCTURE_COLOR: Record<ProjectType, number> = {
  fountain: 0x5be0c8, mural: 0xff6f9c, noodle_stand: 0xffd166, arcade_game: 0x5b8cff,
  garden: 0x3ddc97, observatory: 0xc98cff, stage: 0xff9a5b, workshop: 0xffa24b
};

const prettyZone = (name: string) => name.replace(/_/g, " ").toUpperCase();
const short = (s: string) => (s.length > 56 ? s.slice(0, 54).trimEnd() + "…" : s);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

interface TwinSprite {
  root: Container; // lerps to target screen pos
  figure: Container; // walk/idle animation
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
  ox: number;
  oy: number;
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

  // ---- setup once ----
  useEffect(() => {
    let destroyed = false;
    let app: Application | null = null;

    (async () => {
      const instance = new Application();
      await instance.init({ background: 0x05070f, antialias: true, resizeTo: window });
      if (destroyed) {
        instance.destroy(true, { children: true });
        return;
      }
      app = instance;
      ref.current!.replaceChildren(app.canvas);
      const ox = app.screen.width / 2;
      const oy = 150;

      const stars = new Graphics();
      for (let i = 0; i < 160; i++) {
        stars.circle(Math.random() * app.screen.width, Math.random() * app.screen.height, Math.random() * 1.3)
          .fill({ color: 0xffffff, alpha: Math.random() * 0.6 + 0.15 });
      }
      app.stage.addChild(stars);

      const world = new Container();
      app.stage.addChild(world);

      const ground = new Graphics();
      for (let col = -2; col <= 9; col++) {
        for (let row = -2; row <= 9; row++) {
          const x = isoX(col, row, ox);
          const y = isoY(col, row, oy);
          ground.poly([x, y, x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x - TILE_W / 2, y + TILE_H / 2])
            .fill({ color: 0x0e1c3e, alpha: 0.92 })
            .stroke({ color: 0x2e63a0, alpha: 0.5, width: 1 });
        }
      }
      world.addChild(ground);

      for (const z of pending.current.zones) {
        const label = new Text({ text: prettyZone(z.name), style: new TextStyle({ fill: 0x7f93c4, fontSize: 11, fontFamily: "monospace", letterSpacing: 1 }) });
        label.x = isoX(z.col, z.row, ox) - 34;
        label.y = isoY(z.col, z.row, oy) - 6;
        world.addChild(label);
      }

      const structureLayer = new Container();
      const twinLayer = new Container();
      world.addChild(structureLayer);
      world.addChild(twinLayer);

      const scene: Scene = { app, ox, oy, structureLayer, twinLayer, twins: new Map(), structures: new Set(), tick: 0 };
      sceneRef.current = scene;

      app.ticker.add(() => animate(scene));
      reconcile(scene, pending.current);
    })();

    return () => {
      destroyed = true;
      sceneRef.current = null;
      if (app) app.destroy(true, { children: true });
    };
  }, []);

  // ---- on every world update ----
  useEffect(() => {
    pending.current = state;
    if (sceneRef.current) reconcile(sceneRef.current, state);
  }, [state]);

  return <div ref={ref} style={{ position: "fixed", inset: 0 }} />;
}

// ---- scene helpers ----

function createTwin(t: WorldTwinView, sc: Scene): TwinSprite {
  const root = new Container();
  const figure = new Container();

  const shadow = new Graphics();
  shadow.ellipse(0, TILE_H / 2 + 1, 9, 3.5).fill({ color: 0x000000, alpha: 0.45 });
  root.addChild(shadow);

  const legL = new Graphics();
  legL.rect(-3, 4, 2.4, 6).fill({ color: 0x2a3550 });
  const legR = new Graphics();
  legR.rect(0.6, 4, 2.4, 6).fill({ color: 0x2a3550 });
  const torso = new Graphics();
  torso.roundRect(-4.5, -7, 9, 12, 2).fill({ color: t.colorHex });
  const head = new Graphics();
  head.roundRect(-3.2, -13, 6.4, 6.4, 1.5).fill({ color: 0xf2cda6 });
  head.rect(-3.2, -13, 6.4, 2).fill({ color: t.colorHex }); // little cap in twin colour
  figure.addChild(legL, legR, torso, head);
  figure.y = TILE_H / 2;
  figure.scale.set(1.7); // bigger, readable pixel people
  root.addChild(figure);

  const name = new Text({ text: (t.flag ? t.flag + " " : "") + t.name, style: new TextStyle({ fill: 0xcfe0ff, fontSize: 10, fontFamily: "monospace" }) });
  name.anchor.set(0.5, 0);
  name.y = TILE_H / 2 + 12;
  root.addChild(name);

  root.x = isoX(t.col, t.row, sc.ox);
  root.y = isoY(t.col, t.row, sc.oy);
  sc.twinLayer.addChild(root);

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
  const txt = new Text({ text: short(sayText), style: new TextStyle({ fill: 0xc3d2f0, fontSize: 9, fontFamily: "monospace", wordWrap: true, wordWrapWidth: 112 }) });
  const bw = txt.width + pad * 2;
  const bh = txt.height + pad * 2;
  const bubble = new Container();
  const bg = new Graphics();
  bg.roundRect(-bw / 2, 0, bw, bh, 5).fill({ color: 0x070b16, alpha: 0.92 }).stroke({ color: 0x2f63a0, width: 1 });
  bg.poly([-4, bh, 4, bh, 0, bh + 6]).fill({ color: 0x070b16, alpha: 0.92 });
  txt.x = -bw / 2 + pad;
  txt.y = pad;
  bubble.addChild(bg, txt);
  bubble.y = -22 - bh;
  spr.root.addChild(bubble);
  spr.bubble = bubble;
}

function addStructure(st: WorldStructureView, sc: Scene): void {
  const x = isoX(st.col, st.row, sc.ox);
  const y = isoY(st.col, st.row, sc.oy);
  const color = STRUCTURE_COLOR[st.type] ?? 0x5b8cff;
  const g = new Graphics();
  g.poly([x, y + 6, x + 13, y + 12, x, y + 18, x - 13, y + 12]).fill({ color: 0x16315c });
  g.rect(x - 8, y - 14, 16, 24).fill({ color }).stroke({ color: 0xffffff, alpha: 0.14, width: 1 });
  g.rect(x - 8, y - 14, 16, 5).fill({ color: 0xffffff, alpha: 0.18 });
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
    // pick a fresh spot near the twin's zone each update so it strolls there
    const h = hash(t.id + ":" + sc.tick);
    const dc = ((h % 5) - 2) * 0.35;
    const dr = (((h >> 3) % 5) - 2) * 0.35;
    spr.tx = isoX(t.col + dc, t.row + dr, sc.ox);
    spr.ty = isoY(t.col + dc, t.row + dr, sc.oy);
    spr.root.zIndex = t.col + t.row;
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
    const moving = dist > 0.6;

    if (moving) {
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
