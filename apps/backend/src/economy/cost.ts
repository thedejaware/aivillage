/** Placeholder blended rate; tune from real `beats.token_cost` data later. */
export const USD_PER_1K_TOKENS = 0.01;

export function estimateUsd(tokens: number, ratePer1k = USD_PER_1K_TOKENS): number {
  if (tokens < 0) throw new Error("tokens must be >= 0");
  return (tokens / 1000) * ratePer1k;
}
