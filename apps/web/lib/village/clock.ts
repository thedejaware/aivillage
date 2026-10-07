/**
 * The shared village clock: derived from wall time so every viewer sees the
 * same sky and the same "village time".
 */

/** Full day/night cycle length (seconds). */
export const DAY_CYCLE_SECONDS = 1200;

const phaseAt = (ms: number) => ((ms / 1000) % DAY_CYCLE_SECONDS) / DAY_CYCLE_SECONDS; // 0 = midnight

/** 0 = deep night, 1 = noon. Days are longer than nights. */
export function daynessAt(ms: number): number {
  const raw = Math.sin((phaseAt(ms) - 0.25) * Math.PI * 2);
  return Math.min(1, Math.max(0, raw + 0.35));
}

/** Village time of day, "HH:MM". */
export function villageClock(ms: number): string {
  const minutes = Math.floor(phaseAt(ms) * 1440 + 1e-6);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
