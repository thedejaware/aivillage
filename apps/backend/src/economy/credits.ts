import type { Wallet } from "@aivillage/shared";

export function canAfford(wallet: Wallet, amount: number): boolean {
  return wallet.credits >= amount;
}

export interface ChargeResult { ok: boolean; wallet: Wallet; }

export function charge(wallet: Wallet, amount: number): ChargeResult {
  if (amount < 0) throw new Error("amount must be >= 0");
  if (wallet.credits < amount) return { ok: false, wallet };
  return { ok: true, wallet: { ...wallet, credits: wallet.credits - amount } };
}

export function refund(wallet: Wallet, amount: number): Wallet {
  if (amount < 0) throw new Error("amount must be >= 0");
  return { ...wallet, credits: wallet.credits + amount };
}
