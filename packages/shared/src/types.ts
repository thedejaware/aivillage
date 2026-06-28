export type SkillName = "building" | "coding" | "art" | "social";
export type Skills = Record<SkillName, number>; // level per skill

export interface Twin {
  id: string;
  ownerUserId: string | null; // null => NPC twin
  name: string;
  traits: string[];
  goals: string[];
  avatarSpriteUrl: string | null;
  skills: Skills;
  reputation: number;
  locationZone: string;
  energy: number;
  energyUpdatedAt: string; // ISO timestamp
  isNpc: boolean;
}

export interface Wallet {
  userId: string;
  credits: number;
}

export type ProjectType =
  | "fountain" | "mural" | "noodle_stand" | "arcade_game"
  | "garden" | "observatory" | "stage" | "workshop";

export interface ProjectCost {
  energyCost: number;
  creditCost: number;
}

/** Daily energy granted to every twin. This cap is the per-user inference ceiling. */
export const DAILY_ENERGY = 5;
