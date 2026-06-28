import type { ProjectType, ProjectCost, Twin, Wallet } from "@aivillage/shared";
import { canAfford } from "./credits.js";

const CATALOG: Record<ProjectType, ProjectCost> = {
  fountain:     { energyCost: 3, creditCost: 0 },
  mural:        { energyCost: 2, creditCost: 0 },
  noodle_stand: { energyCost: 3, creditCost: 0 },
  arcade_game:  { energyCost: 4, creditCost: 0 },
  garden:       { energyCost: 2, creditCost: 0 },
  observatory:  { energyCost: 6, creditCost: 20 }, // big/joint
  stage:        { energyCost: 5, creditCost: 10 },
  workshop:     { energyCost: 4, creditCost: 0 }
};

export function projectCost(type: ProjectType): ProjectCost {
  const c = CATALOG[type];
  if (!c) throw new Error(`unknown project type: ${type}`);
  return c;
}

export interface StartCheck { ok: boolean; reason?: "energy" | "credits"; }

export function canStartProject(type: ProjectType, twin: Twin, wallet: Wallet): StartCheck {
  const cost = projectCost(type);
  if (twin.energy < cost.energyCost) return { ok: false, reason: "energy" };
  if (!canAfford(wallet, cost.creditCost)) return { ok: false, reason: "credits" };
  return { ok: true };
}
