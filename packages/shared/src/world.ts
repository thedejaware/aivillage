import type { Twin, Structure, ProjectType } from "./types.js";

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
}

export interface WorldStructureView {
  id: string;
  type: ProjectType;
  col: number;
  row: number;
}

export interface WorldState {
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

export interface ToWorldStateInput {
  zones: WorldZone[];
  twins: Twin[];
  structures: Structure[];
  /** latest narration ("say") per twin id */
  saysByTwinId?: Record<string, string>;
  /** optional flag emoji per twin id */
  flagByTwinId?: Record<string, string>;
}

/** Pure mapper: domain entities -> render state. The renderer never sees domain types. */
export function toWorldState(input: ToWorldStateInput): WorldState {
  const zoneByName = new Map(input.zones.map((z) => [z.name, z]));
  const fallback = input.zones[0];
  const countByZone: Record<string, number> = {};

  const twins: WorldTwinView[] = input.twins.map((t) => {
    const z = zoneByName.get(t.locationZone) ?? fallback;
    const n = countByZone[t.locationZone] ?? 0;
    countByZone[t.locationZone] = n + 1;
    const off = OFFSETS[n % OFFSETS.length];
    return {
      id: t.id,
      name: t.name,
      colorHex: colorForId(t.id),
      col: z.col + off.dc,
      row: z.row + off.dr,
      say: input.saysByTwinId?.[t.id] ?? null,
      flag: input.flagByTwinId?.[t.id] ?? null
    };
  });

  const structures: WorldStructureView[] = input.structures.map((s) => {
    const z = zoneByName.get(s.zone) ?? fallback;
    return { id: s.id, type: s.type, col: z.col, row: z.row };
  });

  return { zones: input.zones, twins, structures };
}
