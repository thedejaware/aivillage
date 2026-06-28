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
      ref.current!.appendChild(app.canvas);

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

      // isometric ground covering the coordinate range the world uses, with a margin
      const minC = -1;
      const maxC = 8;
      const minR = -1;
      const maxR = 8;
      const ground = new Graphics();
      for (let col = minC; col <= maxC; col++) {
        for (let row = minR; row <= maxR; row++) {
          const x = isoX(col, row, ox);
          const y = isoY(col, row, oy);
          ground
            .poly([x, y, x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x - TILE_W / 2, y + TILE_H / 2])
            .fill({ color: 0x0e1c3e, alpha: 0.92 })
            .stroke({ color: 0x2e63a0, alpha: 0.55, width: 1 });
        }
      }
      world.addChild(ground);

      // structures (completed projects -> buildings)
      for (const s of state.structures) {
        const x = isoX(s.col, s.row, ox);
        const y = isoY(s.col, s.row, oy);
        const color = STRUCTURE_COLOR[s.type] ?? 0x5b8cff;
        const g = new Graphics();
        g.poly([x, y + 4, x + 14, y + 11, x, y + 18, x - 14, y + 11]).fill({ color: 0x12305c });
        g.rect(x - 9, y - 18, 18, 24).fill({ color }).stroke({ color: 0xffffff, alpha: 0.12, width: 1 });
        world.addChild(g);
      }

      // zone labels
      for (const z of state.zones) {
        const label = new Text({
          text: prettyZone(z.name),
          style: new TextStyle({ fill: 0x7f93c4, fontSize: 11, fontFamily: "monospace", letterSpacing: 1 })
        });
        label.x = isoX(z.col, z.row, ox) - 34;
        label.y = isoY(z.col, z.row, oy) - 6;
        world.addChild(label);
      }

      // twins, depth-sorted back-to-front
      const sorted = [...state.twins].sort((a, b) => a.col + a.row - (b.col + b.row));
      for (const t of sorted) {
        const x = isoX(t.col, t.row, ox);
        const y = isoY(t.col, t.row, oy);

        const shadow = new Graphics();
        shadow.ellipse(x, y + TILE_H / 2 - 2, 10, 4).fill({ color: 0x000000, alpha: 0.45 });
        world.addChild(shadow);

        const body = new Graphics();
        body.roundRect(x - 6, y + TILE_H / 2 - 24, 12, 21, 3).fill({ color: t.colorHex });
        body.circle(x, y + TILE_H / 2 - 26, 4).fill({ color: t.colorHex });
        world.addChild(body);

        const name = new Text({
          text: (t.flag ? t.flag + " " : "") + t.name,
          style: new TextStyle({ fill: 0xcfe0ff, fontSize: 10, fontFamily: "monospace" })
        });
        name.anchor.set(0.5, 0);
        name.x = x;
        name.y = y + TILE_H / 2 + 2;
        world.addChild(name);

        if (t.say) {
          const pad = 6;
          const txt = new Text({
            text: t.say,
            style: new TextStyle({
              fill: 0xc3d2f0,
              fontSize: 10,
              fontFamily: "monospace",
              wordWrap: true,
              wordWrapWidth: 140
            })
          });
          const bw = txt.width + pad * 2;
          const bh = txt.height + pad * 2;
          const bx = x - bw / 2;
          const by = y + TILE_H / 2 - 34 - bh;

          const bubble = new Graphics();
          bubble.roundRect(bx, by, bw, bh, 5).fill({ color: 0x070b16 }).stroke({ color: 0x2f63a0, width: 1 });
          bubble.poly([x - 4, by + bh, x + 4, by + bh, x, by + bh + 6]).fill({ color: 0x070b16 });
          world.addChild(bubble);

          txt.x = bx + pad;
          txt.y = by + pad;
          world.addChild(txt);
        }
      }
    })();

    return () => {
      destroyed = true;
      if (app) app.destroy(true, { children: true });
    };
  }, [state]);

  return <div ref={ref} style={{ position: "fixed", inset: 0 }} />;
}
