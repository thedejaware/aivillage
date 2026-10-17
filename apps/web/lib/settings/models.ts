import { callsPerHour, formatHourlyCost, hourlyCost, type Chattiness } from "@aivillage/shared";
import type { ProviderInfo } from "./api";

/** What the model select box shows for one provider. */
export interface ModelChoices {
  /** our suggestions (shown even before a key is added) */
  suggested: { id: string; text: string }[];
  /** the rest of the account's chat models (after a key is added), sorted */
  more: string[];
  /** the current model is in neither list (typed by hand) */
  isCustom: boolean;
}

export function modelChoices(info: ProviderInfo, live: string[], current: string): ModelChoices {
  const suggested = info.models.map((m) => ({
    id: m.id,
    text: `${m.label} — ${m.note}${m.recommended ? " (recommended)" : ""}`
  }));
  const known = new Set(suggested.map((s) => s.id));
  const more = [...new Set(live)].filter((id) => !known.has(id)).sort();
  const isCustom = current.trim() !== "" && !known.has(current) && !more.includes(current);
  return { suggested, more, isCustom };
}

/** One line under the chattiness choice: what this pace costs with this model. */
export function costLine(info: ProviderInfo, modelId: string, chattiness: Chattiness): string {
  if (!info.needsKey) return "Free — it runs on your computer (and uses its memory).";
  const price = info.models.find((m) => m.id === modelId)?.price;
  if (price) return formatHourlyCost(hourlyCost(chattiness, price));
  return `about ${callsPerHour(chattiness)} AI calls / hour`;
}
