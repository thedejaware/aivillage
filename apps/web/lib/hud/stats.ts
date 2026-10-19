import { MAX_STAMINA, isCharging, liveStamina, type EnergyPlan } from "@aivillage/shared";

/** Texts for the inspector's Popularity and Friends rows, and their ⓘ tips. */

/** Rank among all villagers, e.g. "#5 of 10" (#1 = most liked). */
export function popularityText(rank: number, villagerCount: number): string {
  return rank > 0 && villagerCount > 0 ? `#${rank} of ${villagerCount}` : "—";
}

export function popularityTip(name: string): string {
  return (
    `How much the other twins like ${name}, compared with everyone else (#1 = most liked). ` +
    `To climb: chat, bond at the lawn or the café, and do activities together. ` +
    `You can ask: "go chat with Sena" or "take Grace to the cinema".`
  );
}

/** e.g. "5 liked · 1 rival" */
export function friendsText(liked: number, rivals: number): string {
  return `${liked} liked · ${rivals} rival${rivals === 1 ? "" : "s"}`;
}

export function friendsTip(name: string): string {
  return (
    `Liked: twins ${name} likes. Rivals: twins ${name} dislikes. ` +
    `Feelings change with every chat and activity.`
  );
}

/** The energy to draw right now: the server's plan moves the bar between updates. */
export function energyNow(d: { stamina?: number; energyPlan?: EnergyPlan | null }, now: number): { value: number; charging: boolean } {
  const plan = d.energyPlan;
  if (!plan) return { value: Math.round(d.stamina ?? MAX_STAMINA), charging: false };
  return { value: liveStamina(plan.base, plan, now), charging: isCharging(plan.base, plan, now) };
}
