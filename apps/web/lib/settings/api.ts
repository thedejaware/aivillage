import type { Appearance, Chattiness, ModelPrice, Twin, VillageInfo } from "@aivillage/shared";
import { errorText, type TwinPatchBody } from "./twins";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** A failed API call; `message` is safe to show to the player. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined
    });
  } catch {
    throw new ApiError("Cannot reach the village server. Is it running?", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
    throw new ApiError(errorText(res.status, body), res.status, typeof code === "string" ? code : undefined);
  }
  return body as T;
}

export const messageOf = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";

// ---- village + twins ----

export interface NewTwinBody {
  name: string;
  appearance: Appearance;
  role: "main" | "villager";
  personality?: string;
  goal?: string;
}

export const getVillage = () => call<VillageInfo>("/api/village");
export const createTwin = (b: NewTwinBody) => call<Twin>("/api/twins", { method: "POST", body: b });
export const patchTwin = (id: string, b: TwinPatchBody) => call<Twin>(`/api/twins/${id}`, { method: "PATCH", body: b });
export const activateTwin = (id: string) => call<Twin>(`/api/twins/${id}/activate`, { method: "POST" });
export const deactivateTwin = (id: string) => call<Twin>(`/api/twins/${id}/deactivate`, { method: "POST" });
export const deleteTwin = (id: string) => call<{ deleted: true }>(`/api/twins/${id}`, { method: "DELETE" });
export const fillRandomVillagers = (count?: number) =>
  call<{ created: Twin[] }>("/api/villagers/random", { method: "POST", body: count ? { count } : {} });

// ---- AI settings ----

/** A suggested model (list price in $ per million tokens; null = free/unknown). */
export interface ProviderModel {
  id: string;
  label: string;
  note: string;
  price: ModelPrice | null;
  recommended?: boolean;
}

export interface ProviderInfo {
  id: string;
  label: string;
  needsKey: boolean;
  defaultBaseUrl: string;
  defaultModel: string;
  keyUrl: string | null;
  /** where to check current prices (null = local) */
  pricingUrl: string | null;
  hint: string;
  /** suggested models, the default first */
  models: ProviderModel[];
}

export interface SettingsView {
  provider: string;
  model: string;
  baseUrl: string | null;
  chattiness: Chattiness;
  keyHint: string | null;
}

export interface SettingsBody {
  provider: string;
  model: string;
  /** omit to keep the saved key; "" clears it */
  apiKey?: string;
  baseUrl?: string;
  chattiness: Chattiness;
}

export const getSettings = () => call<{ settings: SettingsView | null; providers: ProviderInfo[] }>("/api/settings");
export const saveSettings = (b: SettingsBody) => call<{ saved: true; keyHint: string | null }>("/api/settings", { method: "PUT", body: b });
export const testSettings = (b: SettingsBody) =>
  call<{ ok: true; sample: string } | { ok: false; error: string }>("/api/settings/test", { method: "POST", body: b });
export const listModels = (b: SettingsBody) => call<{ models: string[] }>("/api/settings/models", { method: "POST", body: b });
