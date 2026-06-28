import { DAILY_ENERGY, type Twin } from "@aivillage/shared";

export function utcDay(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

/** Refill energy to the daily cap once per UTC day. Pure. */
export function grantDailyEnergy(twin: Twin, now: Date): Twin {
  const nowIso = now.toISOString();
  if (utcDay(twin.energyUpdatedAt) === utcDay(nowIso)) return twin;
  return { ...twin, energy: DAILY_ENERGY, energyUpdatedAt: nowIso };
}

export interface SpendResult { ok: boolean; twin: Twin; }

/** Spend one beat of energy. Pure. */
export function spendBeat(twin: Twin): SpendResult {
  if (twin.energy <= 0) return { ok: false, twin };
  return { ok: true, twin: { ...twin, energy: twin.energy - 1 } };
}
