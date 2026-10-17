import { MAX_TWINS, type Appearance, type TwinSummary } from "@aivillage/shared";

/** What the avatar builder hands back. */
export interface TwinFormValues {
  name: string;
  appearance: Appearance;
  personality: string;
  goal: string;
}

/** Body for PATCH /api/twins/:id (only changed fields). */
export interface TwinPatchBody {
  name?: string;
  appearance?: Appearance;
  traits?: string[];
  goals?: string[];
}

/** Main twins first (the active one on top), then villagers; hidden twins last in each group. */
export function sortTwins(twins: TwinSummary[]): TwinSummary[] {
  const rank = (t: TwinSummary) => (t.role === "main" ? 0 : 2) + (t.active ? 0 : 1);
  return [...twins].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function roleLabel(t: Pick<TwinSummary, "role" | "active">): string {
  if (t.role === "main") return t.active ? "Main · active" : "Main";
  return "Villager";
}

export const personalityOf = (t: Pick<TwinSummary, "traits">): string => t.traits.join(", ");
export const goalOf = (t: Pick<TwinSummary, "goals">): string => t.goals[0] ?? "";

const sameLook = (a: Appearance, b: Appearance) =>
  (Object.keys(a) as (keyof Appearance)[]).every((k) => a[k] === b[k]);

/**
 * Only what changed. Personality/goal are sent only when non-empty, because
 * the server ignores empty lists (it cannot clear them). Extra goals are kept.
 */
export function patchFor(t: TwinSummary, v: TwinFormValues): TwinPatchBody {
  const out: TwinPatchBody = {};
  const name = v.name.trim();
  if (name && name !== t.name) out.name = name;
  if (!sameLook(t.appearance, v.appearance)) out.appearance = v.appearance;
  const personality = v.personality.trim();
  if (personality && personality !== personalityOf(t)) out.traits = [personality];
  const goal = v.goal.trim();
  if (goal && goal !== goalOf(t)) out.goals = [goal, ...t.goals.slice(1)];
  return out;
}

export function initialOf(name: string): string {
  const c = name.trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

/** A short, friendly sentence for a failed API call. */
export function errorText(status: number, body: unknown): string {
  const b = body && typeof body === "object" ? (body as { error?: unknown; code?: unknown }) : {};
  if (b.code === "limit" || status === 409) {
    return `The village is full (${MAX_TWINS} twins). Hide or delete a twin first.`;
  }
  if (typeof b.error === "string" && b.error.trim()) {
    const s = b.error.trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return "Something went wrong. Please try again.";
}
