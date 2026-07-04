// Social layer: directed relationships between twins + conversation results.

export interface Relationship {
  fromTwinId: string;
  toTwinId: string;
  /** how `from` feels about `to`, clamped to [-100, 100] */
  score: number;
  updatedAt: string; // ISO
}

export type RelationshipLabel = "nemesis" | "rival" | "acquaintance" | "friend" | "close friend";

/** nemesis <= -60 < rival <= -25 < acquaintance < 25 <= friend < 60 <= close friend */
export function labelFor(score: number): RelationshipLabel {
  if (score <= -60) return "nemesis";
  if (score <= -25) return "rival";
  if (score < 25) return "acquaintance";
  if (score < 60) return "friend";
  return "close friend";
}

export interface ConversationLine {
  speaker: string; // twin name
  text: string;
}

export interface ConversationResult {
  lines: ConversationLine[]; // 2-4 lines
  /** feeling shifts, clamped to [-20, 20] */
  deltaAtoB: number;
  deltaBtoA: number;
  /** one-line drama summary when something notable happened, else null */
  moment: string | null;
}
