"use client";

import dynamic from "next/dynamic";
import { toWorldState, type WorldZone } from "@aivillage/shared";
import type { Twin, Structure } from "@aivillage/shared";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });

// Sample data built from REAL domain types. Wave 2 swaps this for a backend fetch/subscription.
const ZONES: WorldZone[] = [
  { name: "plaza", col: 3, row: 3 },
  { name: "maker_space", col: 0, row: 5 },
  { name: "network_hub", col: 6, row: 0 },
  { name: "event_space", col: 6, row: 6 }
];

const mk = (id: string, name: string, zone: string): Twin => ({
  id,
  ownerUserId: null,
  name,
  traits: [],
  goals: [],
  avatarSpriteUrl: null,
  skills: { building: 0, coding: 0, art: 0, social: 0 },
  reputation: 0,
  locationZone: zone,
  energy: 5,
  energyUpdatedAt: "2026-06-28T00:00:00.000Z",
  isNpc: true
});

const TWINS: Twin[] = [
  mk("t-mehmet", "Mehmet", "plaza"),
  mk("t-lena", "Lena", "plaza"),
  mk("t-daniel", "Daniel", "event_space"),
  mk("t-aiko", "Aiko", "maker_space"),
  mk("t-ravi", "Ravi", "network_hub"),
  mk("t-sam", "Sam", "network_hub")
];

const STRUCTURES: Structure[] = [
  { id: "s1", projectId: "p1", type: "fountain", zone: "plaza" },
  { id: "s2", projectId: "p2", type: "workshop", zone: "maker_space" }
];

const state = toWorldState({
  zones: ZONES,
  twins: TWINS,
  structures: STRUCTURES,
  saysByTwinId: {
    "t-mehmet": "Let's build the fountain here.",
    "t-lena": "On my way — bringing blueprints.",
    "t-daniel": "Keynote starts soon!"
  },
  flagByTwinId: { "t-lena": "🇨🇭" }
});

export default function Page() {
  return (
    <main>
      <div style={{ position: "fixed", top: 18, left: 22, zIndex: 10, color: "#eaf0ff", fontSize: 18, opacity: 0.9 }}>
        AiVillage <span style={{ color: "#5be0c8", fontSize: 11 }}>● LIVE</span>
      </div>
      <WorldCanvas state={state} />
    </main>
  );
}
