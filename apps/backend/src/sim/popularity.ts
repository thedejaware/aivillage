import type { Relationship } from "@aivillage/shared";

/**
 * Popularity = how the village feels about you: the mean of all INCOMING
 * relationship scores (rounded). Twins nobody has an opinion about score 0.
 */
export function popularityScores(rels: Relationship[]): Map<string, number> {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of rels) {
    const cur = sums.get(r.toTwinId) ?? { total: 0, n: 0 };
    cur.total += r.score;
    cur.n += 1;
    sums.set(r.toTwinId, cur);
  }
  const out = new Map<string, number>();
  for (const [id, { total, n }] of sums) out.set(id, Math.round(total / n));
  return out;
}
