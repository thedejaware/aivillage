import type { OwnerOrder } from "./orders.js";
import type { Appearance } from "./appearance.js";

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
  /** the owner's current order (null/absent = living autonomously) */
  order?: OwnerOrder | null;
  /** how the twin looks (avatar builder); absent = default look */
  appearance?: Appearance;
  /** "main" = the player's own twin (only the active main one is chatted with); default "villager" */
  role?: TwinRole;
  /** false = deactivated: hidden from the village, data kept; default true */
  active?: boolean;
  /** exact spot saved by the browser so the village resumes where it was left */
  pose?: TwinPose | null;
  /** tiredness: 0–100 (MAX_STAMINA); absent = fully rested. Shown as "Energy". */
  stamina?: number;
}

export type TwinRole = "main" | "villager";

/** A twin's exact position in world units (renderer space). */
export interface TwinPose {
  x: number;
  z: number;
  yaw: number;
  zone: string;
  /** map version the pose was saved on; poses from another map are ignored */
  layout?: number;
}

/** The current map (Main Street). Bump when the map changes so old saved poses are ignored. */
export const LAYOUT_VERSION = 3;

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

/** Legacy beat budget for runDay (not shown to players — "Energy" in the UI is `stamina`). */
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
  /** twin that completed the project (null/absent for legacy rows) */
  builtByTwinId?: string | null;
}

export type Verb = "work" | "socialize" | "move" | "chat" | "bond" | "scheme" | "bigmove" | "act";

/** Big social moves that require the owner's approval. */
export type SocialMove = "confront" | "confess" | "party" | "reconcile";

export interface BeatResult {
  verb: Verb;
  target: string | null; // a zone name, a twin name, or null
  /** only for verb "bigmove" */
  kind?: SocialMove | null;
  /** only for verb "act": a catalogue action id or a short free action */
  action?: string | null;
  emoji?: string | null;
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

export type ApprovalPayload =
  | { projectType: ProjectType; zone: string } // legacy: start_project
  | { move: SocialMove; targetName: string }; // social_move (v2)

export interface Approval {
  id: string;
  userId: string;
  twinId: string;
  kind: string; // "start_project" | "social_move"
  payload: ApprovalPayload;
  status: ApprovalStatus;
  createdAt: string; // ISO
  resolvedAt: string | null;
  consumedAt: string | null;
}

// --- Village settings (local app: one row) ---
export type Chattiness = "calm" | "normal" | "busy";

export interface VillageSettings {
  /** "openrouter" | "anthropic" | "gemini" | "openai" | "ollama" */
  provider: string;
  model: string;
  /** stored locally on the player's own machine; never sent back to the browser in full */
  apiKey: string | null;
  baseUrl: string | null;
  chattiness: Chattiness;
}

/** Max twins living in one village at the same time (deactivated twins don't count). */
export const MAX_TWINS = 10;

/** A twin as the Settings page lists it. */
export interface TwinSummary {
  id: string;
  name: string;
  role: TwinRole;
  active: boolean;
  appearance: import("./appearance.js").Appearance;
  traits: string[];
  goals: string[];
}

/** Everything the app needs to know about the local village at startup. */
export interface VillageInfo {
  ownerId: string;
  /** the active main twin (the one you chat with) */
  mainTwinId: string | null;
  aiConfigured: boolean;
  twins: TwinSummary[];
  livingCount: number;
  maxTwins: number;
}
