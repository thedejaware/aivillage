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

// --- Wave 1a additions ---
export type ProjectStatus = "active" | "complete";

export interface Project {
  id: string;
  type: ProjectType;
  zone: string;
  participantTwinIds: string[];
  stepsTotal: number;
  stepsDone: number;
  status: ProjectStatus;
}

export interface Reward {
  skill: SkillName;
  xp: number;
  reputation: number;
}

export interface Structure {
  id: string;
  projectId: string;
  type: ProjectType;
  zone: string;
}

export type Verb = "work" | "socialize" | "move";

export interface BeatResult {
  verb: Verb;
  target: string | null; // a zone name, a twin name, or null
  narrative: string;
}

export interface Memory {
  id: string;
  twinId: string;
  kind: string;
  content: string;
  importance: number;
  createdAt: string; // ISO timestamp
}

// --- Approvals (owner-in-the-loop) ---
export type ApprovalStatus = "pending" | "approved" | "declined";

export interface Approval {
  id: string;
  userId: string;
  twinId: string;
  kind: string; // e.g. "start_project"
  payload: { projectType: ProjectType; zone: string };
  status: ApprovalStatus;
  createdAt: string; // ISO
  resolvedAt: string | null;
  consumedAt: string | null;
}
