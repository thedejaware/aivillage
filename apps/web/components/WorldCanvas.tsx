"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { WorldState, ProjectType } from "@aivillage/shared";

const TILE_W = 64;
const TILE_H = 32;

const isoX = (col: number, row: number, ox: number) => (col - row) * (TILE_W / 2) + ox;
const isoY = (col: number, row: number, oy: number) => (col + row) * (TILE_H / 2) + oy;

const STRUCTURE_COLOR: Record<ProjectType, number> = {
  fountain: 0x5be0c8,
  mural: 0xff6f9c,
  noodle_stand: 0xffd166,
  arcade_game: 0x5b8cff,
  garden: 0x3ddc97,
  observatory: 0xc98cff,
  stage: 0xff9a5b,
  workshop: 0xffa24b
};

const prettyZone = (name: string) => name.replace(/_/g, " ").toUpperCase();
const short = (s: string) => (s.length > 60 ? s.slice(0, 58).trimEnd() + "…" : s);

export default function WorldCanvas({ state }: { state: WorldState }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let app: Application | null = null;
    let destroyed = false;

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

      // starfield
      const stars = new Graphics();
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * app.screen.width;
        const y = Math.random() * app.screen.height;
        stars.circle(x, y, Math.random() * 1.3).fill({ color: 0xffffff, alpha: Math.random() * 0.6 + 0.15 });
      }
      app.stage.addChild(stars);

      const world = new Container();
      app.stage.addChild(world);

      // isometric ground
      const ground = new Graphics();
      for (let col = -2; col <= 9; col++) {
        for (let row = -2; row <= 9; row++) {
          const x = isoX(col, row, ox);
          const y = isoY(col, row, oy);
          ground
            .poly([x, y, x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x - TILE_W / 2, y + TILE_H / 2])
            .fill({ color: 0x0e1c3e, alpha: 0.92 })
            .stroke({ color: 0x2e63a0, alpha: 0.5, width: 1 });
        }
      }
      world.addChild(ground);

      // structures (completed projects) — spread across tiles, drawn back-to-front
      const placeables = [
        ...state.structures.map((s) => ({ kind: "structure" as const, col: s.col, row: s.row, type: s.type })),
        ...state.twins.map((t) => ({ kind: "twin" as const, ...t }))
      ].sort((a, b) => a.col + a.row - (b.col + b.row));

      const bobbers: { node: Container; phase: number }[] = [];

      for (const p of placeables) {
        const x = isoX(p.col, p.row, ox);
        const y = isoY(p.col, p.row, oy);

        if (p.kind === "structure") {
          const color = STRUCTURE_COLOR[p.type] ?? 0x5b8cff;
          const g = new Graphics();
          g.poly([x, y + 6, x + 13, y + 12, x, y + 18, x - 13, y + 12]).fill({ color: 0x16315c });
          g.rect(x - 8, y - 14, 16, 24).fill({ color }).stroke({ color: 0xffffff, alpha: 0.14, width: 1 });
          g.rect(x - 8, y - 14, 16, 5).fill({ color: 0xffffff, alpha: 0.18 });
          world.addChild(g);
          continue;
        }

        // twin: shadow stays on the ground; the figure + label + bubble bob together
        const shadow = new Graphics();
        shadow.ellipse(x, y + TILE_H / 2 - 2, 10, 4).fill({ color: 0x000000, alpha: 0.45 });
        world.addChild(shadow);

        const node = new Container();

        const body = new Graphics();
        body.roundRect(x - 6, y + TILE_H / 2 - 24, 12, 21, 3).fill({ color: p.colorHex });
        body.circle(x, y + TILE_H / 2 - 26, 4).fill({ color: p.colorHex });
        node.addChild(body);

        const name = new Text({
          text: (p.flag ? p.flag + " " : "") + p.name,
          style: new TextStyle({ fill: 0xcfe0ff, fontSize: 10, fontFamily: "monospace" })
        });
        name.anchor.set(0.5, 0);
        name.x = x;
        name.y = y + TILE_H / 2 + 2;
        node.addChild(name);

        if (p.say) {
          const pad = 5;
          const txt = new Text({
            text: short(p.say),
            style: new TextStyle({
              fill: 0xc3d2f0,
              fontSize: 9,
              fontFamily: "monospace",
              wordWrap: true,
              wordWrapWidth: 116
            })
          });
          const bw = txt.width + pad * 2;
          const bh = txt.height + pad * 2;
          const bx = x - bw / 2;
          const by = y + TILE_H / 2 - 32 - bh;

          const bubble = new Graphics();
          bubble.roundRect(bx, by, bw, bh, 5).fill({ color: 0x070b16, alpha: 0.92 }).stroke({ color: 0x2f63a0, width: 1 });
          bubble.poly([x - 4, by + bh, x + 4, by + bh, x, by + bh + 6]).fill({ color: 0x070b16, alpha: 0.92 });
          node.addChild(bubble);

          txt.x = bx + pad;
          txt.y = by + pad;
          node.addChild(txt);
        }

        world.addChild(node);
        bobbers.push({ node, phase: Math.random() * Math.PI * 2 });
      }

      // gentle idle animation so the world feels alive
      app.ticker.add(() => {
        const t = performance.now() / 1000;
        for (const b of bobbers) b.node.y = Math.sin(t * 1.8 + b.phase) * 3;
      });
    })();

    return () => {
      destroyed = true;
      if (app) app.destroy(true, { children: true });
    };
  }, [state]);

  return <div ref={ref} style={{ position: "fixed", inset: 0 }} />;
}
