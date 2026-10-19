import { LAYOUT_VERSION, type Twin, type Structure, type ProjectType, type TwinPose } from "./types.js";
import { MAX_STAMINA } from "./places.js";
import { liveStamina, type EnergyPlan } from "./energy.js";
import { validateAppearance, type Appearance } from "./appearance.js";
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
  order: (Pick<OwnerOrder, "kind" | "zone" | "targetName" | "label"> & { action?: OwnerOrder["action"]; issuedAt?: string; auto?: boolean }) | null;
  appearance: Appearance;
  /** the player's own twin */
  isMain: boolean;
  /** saved exact spot, if any (the renderer starts the twin there) */
  pose: TwinPose | null;
  /** energy 0–100 */
  stamina: number;
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

/**
 * Canonical zone layout shared by the backend (state building) and the renderer.
 * Main Street map (LAYOUT_VERSION 3: bigger places, moved out from the street): world = tile − 3.5; one winding street
 * from the house (west) to the rollercoaster (east). The first entry is the fallback zone.
 */
export const DEFAULT_ZONES: WorldZone[] = [
  { name: "plaza", col: 4, row: 1 },
  { name: "home", col: -6, row: 3 },
  { name: "network_hub", col: -4, row: -2 },
  { name: "bike_rack", col: -5, row: 8 },
  { name: "maker_space", col: -1, row: 9 },
  { name: "garden", col: 4, row: 11 },
  { name: "gym", col: 5, row: -4 },
  { name: "event_space", col: 7, row: 8 },
  { name: "pool", col: 11, row: -5 },
  { name: "cinema", col: 11, row: 12 },
  { name: "funfair", col: 13, row: 4 }
];

// Drama-village venue identity: zone ids stay stable (DB, planner), but every
// zone reads as a PLACE where a specific kind of drama happens.
export const ZONE_DISPLAY: Record<string, string> = {
  plaza: "THE STAGE",
  maker_space: "THE CAFÉ",
  network_hub: "QUIET CORNER",
  event_space: "THE LAWN",
  home: "THE HOUSE",
  garden: "THE GARDEN",
  gym: "THE GYM",
  pool: "THE POOL",
  cinema: "THE CINEMA",
  funfair: "THE ROLLERCOASTER",
  bike_rack: "THE BIKES"
};

export const ZONE_TAGLINE: Record<string, string> = {
  plaza: "big moves happen here",
  maker_space: "eat, drink & gossip",
  network_hub: "rest and think",
  event_space: "friendships grow",
  home: "sleep and get energy back",
  garden: "grow veg, make juice",
  gym: "get strong",
  pool: "swim and sunbathe",
  cinema: "movies under the sky",
  funfair: "scream on the drop",
  bike_rack: "ride along the street"
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

  const twins: WorldTwinView[] = input.twins.filter((t) => t.active !== false).map((t) => {
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
        ? { kind: t.order.kind, zone: t.order.zone, targetName: t.order.targetName, label: t.order.label, action: t.order.action ?? null, issuedAt: t.order.issuedAt, ...(t.order.auto ? { auto: true } : {}) }
        : null,
      appearance: validateAppearance(t.appearance),
      isMain: t.role === "main",
      // a pose saved on an older map would put the twin somewhere odd
      pose: t.pose && t.pose.layout === LAYOUT_VERSION ? t.pose : null,
      stamina: liveStamina(t.stamina ?? MAX_STAMINA, t.order, now)
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
  maker_space: "☕", event_space: "🌸", network_hub: "💭", plaza: "🎤",
  home: "🏠", garden: "🥕", gym: "🏋️", pool: "🏊", cinema: "🎬", funfair: "🎢", bike_rack: "🚲"
};

/** One-line status for a twin following an owner order (3D label + chat panel). */
export function orderStatus(order: NonNullable<WorldTwinView["order"]>, arrived: boolean): string {
  if (order.kind === "stay") return `📍 ${order.label}`;
  if (!arrived) return `🚶 ${order.label}`;
  if (order.kind === "talk_to") return `💬 Talking with ${order.targetName}`;
  if (order.kind === "act" && order.action) {
    const act = order.action;
    if (act.refused) return `🙅 ${act.targetName} said no to ${/^[aeiou]/i.test(act.label) ? "an" : "a"} ${act.label}`;
    return `${act.emoji} ${act.label}${act.targetName ? ` ${act.targetName}` : ""}`;
  }
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
  /** legacy beat budget (not shown) */
  energy: number;
  /** energy 0–100 right now, shown as "Energy" */
  stamina: number;
  /** set while the current activity is changing energy: the bar moves on its own */
  energyPlan: EnergyPlan | null;
  popularity: number;
  /** 1-based leaderboard position */
  rank: number;
  villagerCount: number;
  /** e.g. "🚶 Heading to THE CAFÉ"; null when living freely */
  orderStatus: string | null;
  relationships: { name: string; label: string; score: number }[];
  recent: { id: string; kind: string; content: string; createdAt: string }[];
}

/** How many past conversations the village keeps (older ones are deleted). */
export const CONVERSATIONS_KEPT = 500;

/** One saved conversation between twins, for the "Talks" tab (GET /api/conversations). */
export interface ConversationView {
  id: string;
  createdAt: string; // ISO
  /** where it happened (a zone id), null if unknown */
  zone: string | null;
  /** "chat": twins talking on their own; "talk": an owner's "talk to X" order; "bigmove": a confession, confrontation… */
  kind: "chat" | "talk" | "bigmove";
  /** the twins in it, in speaking order (names and colours as they were then) */
  twins: { id: string; name: string; colorHex: number }[];
  /** every line, in order (a big move has one line: the narration) */
  lines: { speaker: string; text: string }[];
  /** what changed between them ("Kwame and Sena became friends"), if anything */
  moment: string | null;
}
