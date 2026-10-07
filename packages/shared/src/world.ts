import type { Twin, Structure, ProjectType } from "./types.js";
import { isOrderActive, type OwnerOrder } from "./orders.js";

// --- Render-oriented world state (what the PixiJS renderer consumes) ---
export interface WorldZone {
  name: string;
  col: number;
  row: number;
}

export interface WorldTwinView {
  id: string;
  name: string;
  colorHex: number;
  col: number;
  row: number;
  say: string | null;
  flag: string | null;
  /** active owner order, if any — the renderer walks the twin there and holds it */
  order: Pick<OwnerOrder, "kind" | "zone" | "targetName" | "label"> | null;
}

export interface WorldStructureView {
  id: string;
  type: ProjectType;
  col: number;
  row: number;
  builtByTwinId?: string | null;
}

export interface WorldState {
  /** when the snapshot's data was read (ISO) — lets clients drop stale snapshots */
  asOf?: string;
  zones: WorldZone[];
  twins: WorldTwinView[];
  structures: WorldStructureView[];
}

/** Canonical zone layout shared by the backend (state building) and the renderer. */
export const DEFAULT_ZONES: WorldZone[] = [
  { name: "plaza", col: 3, row: 3 },
  { name: "maker_space", col: 0, row: 5 },
  { name: "network_hub", col: 6, row: 0 },
  { name: "event_space", col: 6, row: 6 }
];

// Drama-village venue identity: zone ids stay stable (DB, planner), but every
// zone reads as a PLACE where a specific kind of drama happens.
export const ZONE_DISPLAY: Record<string, string> = {
  plaza: "THE STAGE",
  maker_space: "THE CAFÉ",
  network_hub: "QUIET CORNER",
  event_space: "THE LAWN"
};

export const ZONE_TAGLINE: Record<string, string> = {
  plaza: "big moves happen here",
  maker_space: "chats & gossip",
  network_hub: "schemes are hatched",
  event_space: "friendships grow"
};

const PALETTE = [0xff9a5b, 0x3ddc97, 0xffd166, 0x5b8cff, 0xc98cff, 0xff6f9c, 0x5be0c8];

/** Deterministic colour from an id so a twin always renders the same hue. */
export function colorForId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Deterministic per-zone offsets so multiple twins in one zone don't stack.
const OFFSETS = [
  { dc: 0, dr: 0 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 1, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: -1 }
];

// Structures claim the nearest FREE tile to their zone centre (deterministic
// spiral search), so every building is individually visible — nothing stacks.
const MIN_TILE = -1;
const MAX_TILE = 8;

function claimTile(
  occupied: Set<string>,
  center: { col: number; row: number }
): { col: number; row: number } {
  for (let ring = 0; ring <= 10; ring++) {
    for (let dc = -ring; dc <= ring; dc++) {
      for (let dr = -ring; dr <= ring; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
        const col = center.col + dc;
        const row = center.row + dr;
        if (col < MIN_TILE || col > MAX_TILE || row < MIN_TILE || row > MAX_TILE) continue;
        const key = `${col},${row}`;
        if (!occupied.has(key)) {
          occupied.add(key);
          return { col, row };
        }
      }
    }
  }
  return { col: center.col, row: center.row }; // world is full — overlap at centre
}

export interface ToWorldStateInput {
  zones: WorldZone[];
  twins: Twin[];
  structures: Structure[];
  /** latest narration ("say") per twin id */
  saysByTwinId?: Record<string, string>;
  /** optional flag emoji per twin id */
  flagByTwinId?: Record<string, string>;
  /** explicit tile position per twin id — overrides zone placement (used for movement/playback) */
  positionsByTwinId?: Record<string, { col: number; row: number }>;
  /** clock for order expiry (defaults to now) */
  now?: Date;
}

/** Pure mapper: domain entities -> render state. The renderer never sees domain types. */
export function toWorldState(input: ToWorldStateInput): WorldState {
  const zoneByName = new Map(input.zones.map((z) => [z.name, z]));
  const fallback = input.zones[0];
  const countByZone: Record<string, number> = {};
  const now = input.now ?? new Date();

  const twins: WorldTwinView[] = input.twins.map((t) => {
    const override = input.positionsByTwinId?.[t.id];
    let col: number;
    let row: number;
    if (override) {
      col = override.col;
      row = override.row;
    } else {
      const z = zoneByName.get(t.locationZone) ?? fallback;
      const n = countByZone[t.locationZone] ?? 0;
      countByZone[t.locationZone] = n + 1;
      const off = OFFSETS[n % OFFSETS.length];
      col = z.col + off.dc;
      row = z.row + off.dr;
    }
    return {
      id: t.id,
      name: t.name,
      colorHex: colorForId(t.id),
      col,
      row,
      say: input.saysByTwinId?.[t.id] ?? null,
      flag: input.flagByTwinId?.[t.id] ?? null,
      order: t.order && isOrderActive(t.order, now)
        ? { kind: t.order.kind, zone: t.order.zone, targetName: t.order.targetName, label: t.order.label }
        : null
    };
  });

  // Every structure claims its own free tile near its zone centre (input order
  // must be stable — the repository orders by created_at). PLAYER-built
  // structures claim first so an owner's buildings are always visible even
  // when the map fills up with NPC builds.
  const occupiedTiles = new Set<string>();
  const ordered = [...input.structures].sort(
    (a, b) => (a.builtByTwinId ? 0 : 1) - (b.builtByTwinId ? 0 : 1)
  );
  const structures: WorldStructureView[] = ordered.map((s) => {
    const z = zoneByName.get(s.zone) ?? fallback;
    const spot = claimTile(occupiedTiles, z);
    return { id: s.id, type: s.type, col: spot.col, row: spot.row, builtByTwinId: s.builtByTwinId ?? null };
  });

  return { asOf: now.toISOString(), zones: input.zones, twins, structures };
}

/** What each venue looks like when a twin hangs out there. */
export const ZONE_EMOJI: Record<string, string> = {
  maker_space: "☕", event_space: "🌸", network_hub: "💭", plaza: "🎤"
};

/** One-line status for a twin following an owner order (3D label + chat panel). */
export function orderStatus(order: NonNullable<WorldTwinView["order"]>, arrived: boolean): string {
  if (order.kind === "stay") return `📍 ${order.label}`;
  if (!arrived) return `🚶 ${order.label}`;
  if (order.kind === "talk_to") return `💬 Talking with ${order.targetName}`;
  return `${ZONE_EMOJI[order.zone] ?? "📍"} At ${ZONE_DISPLAY[order.zone] ?? order.zone}`;
}

/** Everything the Inspector shows about one villager (GET /api/twins/:id). */
export interface TwinDetail {
  id: string;
  name: string;
  colorHex: number;
  isNpc: boolean;
  /** true when the viewer owns this twin */
  isMine: boolean;
  traits: string[];
  goals: string[];
  zone: string;
  zoneLabel: string;
  reputation: number;
  /** 0..DAILY_ENERGY */
  energy: number;
  popularity: number;
  /** 1-based leaderboard position */
  rank: number;
  villagerCount: number;
  /** e.g. "🚶 Heading to THE CAFÉ"; null when living freely */
  orderStatus: string | null;
  relationships: { name: string; label: string; score: number }[];
  recent: { id: string; kind: string; content: string; createdAt: string }[];
}
