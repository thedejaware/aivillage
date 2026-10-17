/**
 * Twins some loop is deciding for right now (world clock drama beat, next-step
 * loop). Each loop skips twins another one holds, so their slow AI calls can't
 * overwrite each other's results. In-memory: one backend process.
 */
const claimed = new Set<string>();

export function claimTwins(ids: string[]): void {
  for (const id of ids) claimed.add(id);
}

export function releaseTwins(ids: string[]): void {
  for (const id of ids) claimed.delete(id);
}

export function isClaimed(id: string): boolean {
  return claimed.has(id);
}
