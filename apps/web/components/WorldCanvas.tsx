"use client";

import { useEffect, useRef } from "react";
import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";

// --- Spike world state (Wave 1 will source this from @aivillage/shared + the backend) ---
const TILE_W = 64;
const TILE_H = 32;

type Zone = { name: string; col: number; row: number };
type Agent = { name: string; color: number; col: number; row: number; say?: string; flag?: string };

const ZONES: Zone[] = [
  { name: "PLAZA", col: 3, row: 3 },
  { name: "MAKER SPACE", col: 0, row: 5 },
  { name: "NETWORK HUB", col: 6, row: 0 },
  { name: "EVENT SPACE", col: 6, row: 6 }
];

const AGENTS: Agent[] = [
  { name: "Mehmet", color: 0xff9a5b, col: 3, row: 3, say: "Let's build the fountain here." },
  { name: "Lena", color: 0x3ddc97, col: 4, row: 4, say: "On my way — bringing blueprints.", flag: "🇨🇭" },
  { name: "Daniel", color: 0xffd166, col: 6, row: 6, say: "Keynote starts soon!" },
  { name: "Aiko", color: 0x5b8cff, col: 1, row: 5 },
  { name: "Ravi", color: 0xc98cff, col: 6, row: 0 },
  { name: "Sam", color: 0xff6f9c, col: 2, row: 1 }
];

const isoX = (col: number, row: number, ox: number) => (col - row) * (TILE_W / 2) + ox;
const isoY = (col: number, row: number, oy: number) => (col + row) * (TILE_H / 2) + oy;

export default function WorldCanvas() {
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

      // isometric ground
      const ground = new Graphics();
      for (let col = 0; col <= 7; col++) {
        for (let row = 0; row <= 7; row++) {
          const x = isoX(col, row, ox);
          const y = isoY(col, row, oy);
          ground
            .poly([x, y, x + TILE_W / 2, y + TILE_H / 2, x, y + TILE_H, x - TILE_W / 2, y + TILE_H / 2])
            .fill({ color: 0x0e1c3e, alpha: 0.92 })
            .stroke({ color: 0x2e63a0, alpha: 0.55, width: 1 });
        }
      }
      world.addChild(ground);

      // a couple of finished "structures" (completed Projects) to hint at village growth
      const placeStructure = (col: number, row: number, color: number, h: number) => {
        const x = isoX(col, row, ox);
        const y = isoY(col, row, oy);
        const s = new Graphics();
        s.poly([x, y + 4, x + 14, y + 11, x, y + 18, x - 14, y + 11]).fill({ color: 0x12305c });
        s.rect(x - 9, y - h + 8, 18, h).fill({ color }).stroke({ color: 0xffffff, alpha: 0.12, width: 1 });
        world.addChild(s);
      };
      placeStructure(2, 4, 0xff9a5b, 26);
      placeStructure(5, 2, 0x5b8cff, 20);

      // zone labels
      for (const z of ZONES) {
        const label = new Text({
          text: z.name,
          style: new TextStyle({ fill: 0x7f93c4, fontSize: 11, fontFamily: "monospace", letterSpacing: 1 })
        });
        label.x = isoX(z.col, z.row, ox) - 34;
        label.y = isoY(z.col, z.row, oy) - 6;
        world.addChild(label);
      }

      // agents, depth-sorted
      const sorted = [...AGENTS].sort((a, b) => a.col + a.row - (b.col + b.row));
      for (const a of sorted) {
        const x = isoX(a.col, a.row, ox);
        const y = isoY(a.col, a.row, oy);

        const shadow = new Graphics();
        shadow.ellipse(x, y + TILE_H / 2 - 2, 10, 4).fill({ color: 0x000000, alpha: 0.45 });
        world.addChild(shadow);

        const body = new Graphics();
        body.roundRect(x - 6, y + TILE_H / 2 - 24, 12, 21, 3).fill({ color: a.color });
        body.circle(x, y + TILE_H / 2 - 26, 4).fill({ color: a.color });
        world.addChild(body);

        const name = new Text({
          text: (a.flag ? a.flag + " " : "") + a.name,
          style: new TextStyle({ fill: 0xcfe0ff, fontSize: 10, fontFamily: "monospace" })
        });
        name.anchor.set(0.5, 0);
        name.x = x;
        name.y = y + TILE_H / 2 + 2;
        world.addChild(name);

        if (a.say) {
          const pad = 6;
          const txt = new Text({
            text: a.say,
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
  }, []);

  return <div ref={ref} style={{ position: "fixed", inset: 0 }} />;
}
