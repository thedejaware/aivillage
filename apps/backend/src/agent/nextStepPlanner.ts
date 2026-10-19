import {
  ACTIONS, PLACES, PLAN_STEPS, MAX_STAMINA, TIRED_BELOW, ZONE_DISPLAY,
  findAction, isOrderActive, isTired, labelFor, placeOf, restPlaceFor,
  type LlmClient, type PlaceId, type Relationship, type Twin
} from "@aivillage/shared";
import { activityDelta, staminaAfter, staminaOf, REST_ACTION } from "../sim/activity.js";

/**
 * What a twin does next after finishing an activity (O13). The AI writes a short
 * to-do list (PLAN_STEPS activities from ONE call); without an AI — or when the
 * AI fails or answers junk — simple rules pick one step, so no twin ever freezes.
 */

/** One planned activity: where, what, with whom. */
export interface NextStep {
  zone: PlaceId;
  /** catalogue action id done at that place */
  action: string;
  /** a villager invited along ("take Sena to the cinema"), or null */
  partner: string | null;
  narrative: string;
}

export interface PlaceActionOption {
  id: string;
  label: string;
  /** energy change when it starts (sleep: refills to MAX_STAMINA) */
  stamina: number;
  refill: boolean;
}

export interface PlaceOption {
  zone: PlaceId;
  /** display name, e.g. "THE POOL" */
  name: string;
  /** spots still free right now */
  free: number;
  actions: PlaceActionOption[];
}

export interface NextStepContext {
  /** energy 0–100 */
  stamina: number;
  /** what the twin just finished, in words */
  lastDid: string | null;
  /** where it just was (the rules don't send it straight back) */
  lastZone: string | null;
  /** places that still have room (full places are left out) */
  places: PlaceOption[];
  /** villagers free to join (not busy with something else) */
  nearbyTwinNames: string[];
  relationships: { name: string; label: string }[];
  ownerFacts: string[];
}

/** Activities shorter than this are gestures, not something to go and do. */
const MIN_ACTIVITY_SECONDS = 20;

function actionsAt(zone: PlaceId): PlaceActionOption[] {
  const place = placeOf(zone)!;
  const ids = [
    place.mainAction,
    ...ACTIONS.filter((a) => a.place === zone && !a.target && a.seconds >= MIN_ACTIVITY_SECONDS && a.id !== place.mainAction).map((a) => a.id)
  ];
  return ids.flatMap((id) => {
    const def = findAction(id);
    if (!def) return [];
    const refill = id === "sleep";
    return [{ id, label: def.label, stamina: refill ? MAX_STAMINA : activityDelta(def, zone), refill }];
  });
}

/**
 * Every place with its activities and how many spots are free: capacity minus
 * the other twins that have an active order there. The house fits everyone.
 * Places with no room are left out.
 */
export function placeOptions(twins: Twin[], selfId: string, now: Date): PlaceOption[] {
  return PLACES.flatMap((place) => {
    const taken = twins.filter((t) => t.id !== selfId && isOrderActive(t.order, now) && t.order!.zone === place.zone).length;
    const free = place.zone === "home" ? place.capacity : place.capacity - taken;
    if (free <= 0) return [];
    return [{ zone: place.zone, name: ZONE_DISPLAY[place.zone] ?? place.label, free, actions: actionsAt(place.zone) }];
  });
}

/** Everything the planner needs about one twin, from the village as it is now. */
export function nextStepContext(
  twin: Twin,
  all: Twin[],
  now: Date,
  relationships: Relationship[],
  ownerFacts: string[]
): NextStepContext {
  const last = twin.order;
  const lastDid = last?.action
    ? `${last.action.label} at ${ZONE_DISPLAY[last.zone] ?? last.zone}`
    : last
      ? last.label
      : null;
  const nameOf = new Map(all.map((t) => [t.id, t.name] as const));
  return {
    stamina: staminaOf(twin, now),
    lastDid,
    lastZone: last?.zone ?? null,
    places: placeOptions(all, twin.id, now),
    nearbyTwinNames: all.filter((t) => t.id !== twin.id && !isOrderActive(t.order, now)).map((t) => t.name).slice(0, 6),
    relationships: relationships
      .filter((r) => r.fromTwinId === twin.id && r.score !== 0 && nameOf.has(r.toTwinId))
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6)
      .map((r) => ({ name: nameOf.get(r.toTwinId)!, label: labelFor(r.score) })),
    ownerFacts: ownerFacts.slice(0, 4)
  };
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** The planning prompt. count > 1 = to-do-list mode (a JSON array of steps). */
export function buildNextStepPrompt(twin: Twin, ctx: NextStepContext, count: number = PLAN_STEPS): string {
  const tired = isTired(ctx.stamina);
  const places = ctx.places
    .map((p) => {
      const acts = p.actions.filter((a) => !tired || a.refill || a.stamina >= 0);
      if (acts.length === 0) return null;
      const list = acts.map((a) => `${a.id} (${a.refill ? "energy back to 100" : `${signed(a.stamina)} energy`})`).join(", ");
      return `- ${p.zone} "${p.name}" (${p.free} free): ${list}`;
    })
    .filter(Boolean)
    .join("\n");
  const rels = ctx.relationships.length > 0 ? ctx.relationships.map((r) => `- ${r.name}: ${r.label}`).join("\n") : "- you barely know anyone yet";
  const stepShape = `{"zone":"<place id>","action":"<activity id>","partner":<villager name or null>,"narrative":"<one vivid third-person sentence>"}`;
  return [
    `You are ${twin.name}, living in AiVillage — a small village along one main street, from the shared house to the rollercoaster.`,
    `Personality: ${twin.traits.join(", ") || "unremarkable"}. Your goal: ${twin.goals.join(", ") || "find your place"}.`,
    `You just finished: ${ctx.lastDid ?? "nothing yet — your day is starting"}.`,
    `Your energy: ${ctx.stamina}/100.${tired ? " You are TIRED: rest now." : ""}`,
    `How you feel about people:\n${rels}`,
    ...(ctx.ownerFacts.length > 0 ? [`Your owner (the real person you are the twin of) told you:\n${ctx.ownerFacts.map((f) => `- ${f}`).join("\n")}`] : []),
    `Villagers free to join you: ${ctx.nearbyTwinNames.join(", ") || "no one"}.`,
    `Places with room right now (energy change per activity):`,
    places,
    `Rules:`,
    `- Choose only places and activities from the list above.`,
    `- Tired twins (energy below ${TIRED_BELOW}) must rest: eat or drink at the café, read in the quiet corner, sit on the lawn, sunbathe by the pool, or sleep at home (energy back to 100). Don't let your energy drop below ${TIRED_BELOW}.`,
    `- Don't repeat what you just did. After gardening, fresh juice at the café is a treat.`,
    `- "partner": you may invite ONE villager from the list to join you at the place (e.g. take them to the cinema), else null. They may say no.`,
    ...(count > 1
      ? [
          `Plan your next ${count} activities, in order, as a short to-do list. Energy changes add up from one activity to the next — plan rest before you get tired.`,
          `Respond ONLY with a strict JSON array of ${count} objects: [${stepShape}, …]`
        ]
      : [`Respond ONLY with strict JSON: ${stepShape}`])
  ].join("\n");
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const bare = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/[_-]+/g, " ");

function findPlace(raw: string, ctx: NextStepContext): PlaceOption | undefined {
  const n = bare(raw);
  return ctx.places.find((p) => bare(p.zone) === n || bare(p.name) === n);
}

function toStep(item: unknown, ctx: NextStepContext): NextStep | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const zoneRaw = str(obj.zone);
  const actionId = findAction(str(obj.action) ?? "")?.id ?? null;
  const place =
    (zoneRaw ? findPlace(zoneRaw, ctx) : undefined) ??
    (actionId ? ctx.places.find((p) => p.actions.some((a) => a.id === actionId)) : undefined);
  if (!place) return null; // unknown or full place
  const action = place.actions.find((a) => a.id === actionId)?.id ?? place.actions[0]?.id;
  if (!action) return null;
  const wanted = (str(obj.partner) ?? "").toLowerCase();
  const partner = wanted && place.free >= 2 ? ctx.nearbyTwinNames.find((n) => n.toLowerCase() === wanted) ?? null : null;
  return { zone: place.zone, action, partner, narrative: (str(obj.narrative) ?? "").slice(0, 200) };
}

/** Every valid step in the AI's answer (a JSON array, {"steps": […]} or one object), in order. */
export function parseNextSteps(raw: string, ctx: NextStepContext): NextStep[] {
  const candidates = [raw.match(/\[[\s\S]*\]/)?.[0], raw.match(/\{[\s\S]*\}/)?.[0]].filter((x): x is string => Boolean(x));
  for (const text of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const items = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { steps?: unknown }).steps)
        ? ((parsed as { steps: unknown[] }).steps)
        : [parsed];
    return items.map((i) => toStep(i, ctx)).filter((s): s is NextStep => s !== null);
  }
  return [];
}

/** The first valid step in the AI's answer, or null. */
export function parseNextStep(raw: string, ctx: NextStepContext): NextStep | null {
  return parseNextSteps(raw, ctx)[0] ?? null;
}

const narrate = (twin: Twin, zone: PlaceId, action: string) =>
  `${twin.name} heads to ${(ZONE_DISPLAY[zone] ?? zone).toLowerCase()} to ${findAction(action)?.label ?? action}.`;

const pick = <T>(xs: T[], random: () => number): T => xs[Math.min(xs.length - 1, Math.floor(random() * xs.length))];

/** Go and get energy back: home when exhausted, else the café or quiet corner — wherever has room. */
export function restStep(twin: Twin, ctx: NextStepContext, stamina: number, random: () => number = Math.random): NextStep {
  const first = restPlaceFor(stamina, random);
  const order: PlaceId[] =
    first === "home" ? ["home"] : [first, first === "maker_space" ? "network_hub" : "maker_space", "event_space", "pool", "home"];
  for (const zone of order) {
    const place = ctx.places.find((p) => p.zone === zone);
    if (zone !== "home" && !place) continue;
    const restful = (place?.actions ?? []).filter((a) => a.refill || a.stamina > 0).map((a) => a.id);
    const action = zone === "maker_space" && restful.length > 0 ? pick(restful, random) : REST_ACTION[zone];
    return { zone, action, partner: null, narrative: narrate(twin, zone, action) };
  }
  return { zone: "home", action: "sleep", partner: null, narrative: narrate(twin, "home", "sleep") };
}

/** No AI: a free place that fits the twin's energy (tired → rest). */
export function ruleNextStep(twin: Twin, ctx: NextStepContext, random: () => number = Math.random): NextStep {
  const s = ctx.stamina;
  if (isTired(s)) return restStep(twin, ctx, s, random);
  // the juice chain: after gardening, fresh juice at the café
  if (ctx.lastZone === "garden" && ctx.places.some((p) => p.zone === "maker_space")) {
    return { zone: "maker_space", action: "drink_juice", partner: null, narrative: narrate(twin, "maker_space", "drink_juice") };
  }
  const options = ctx.places
    .filter((p) => p.zone !== ctx.lastZone && (p.zone !== "home" || s < 40))
    .map((p) => ({ p, acts: p.actions.filter((a) => a.refill || s + a.stamina >= TIRED_BELOW) }))
    .filter((o) => o.acts.length > 0);
  if (options.length === 0) return restStep(twin, ctx, s, random);
  const o = pick(options, random);
  const a = pick(o.acts, random);
  return { zone: o.p.zone, action: a.id, partner: null, narrative: narrate(twin, o.p.zone, a.id) };
}

/**
 * Walk the plan with projected energy: a tiring step while tired becomes a rest
 * step and ends the plan (the next plan should see the new energy).
 */
function guardPlan(twin: Twin, ctx: NextStepContext, steps: NextStep[], random: () => number): NextStep[] {
  let energy = ctx.stamina;
  const out: NextStep[] = [];
  for (const step of steps) {
    const def = findAction(step.action);
    if (isTired(energy) && activityDelta(def ?? null, step.zone) < 0) {
      out.push(restStep(twin, ctx, energy, random));
      break;
    }
    out.push(step.narrative ? step : { ...step, narrative: narrate(twin, step.zone, step.action) });
    energy = staminaAfter(energy, def ?? null, step.zone);
  }
  return out;
}

/**
 * THE seam (O13): one AI call → up to `count` steps (PLAN_STEPS by default; 1 =
 * one call per activity). A failed call or junk answer → one rule-based step.
 */
export async function planNextSteps(
  twin: Twin,
  ctx: NextStepContext,
  llm: LlmClient,
  opts: { count?: number; random?: () => number } = {}
): Promise<NextStep[]> {
  const count = Math.max(1, opts.count ?? PLAN_STEPS);
  const random = opts.random ?? Math.random;
  let steps: NextStep[] = [];
  try {
    steps = parseNextSteps(await llm.generate(buildNextStepPrompt(twin, ctx, count)), ctx).slice(0, count);
  } catch (e) {
    console.warn(`next-step plan for ${twin.name} failed, using rules:`, (e as Error).message);
  }
  if (steps.length === 0) return [ruleNextStep(twin, ctx, random)];
  return guardPlan(twin, ctx, steps, random);
}
