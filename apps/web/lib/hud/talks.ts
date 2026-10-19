import { ZONE_DISPLAY, ZONE_EMOJI, type ConversationView } from "@aivillage/shared";
import { hex, relTime } from "../../components/hud/theme";

/** Pure helpers for the "Talks" tab: old twin conversations, newest first. */

/** How many talks one request loads. */
export const TALKS_PAGE = 50;

/** GET url for the newest page, or the page older than `before` (a createdAt ISO). */
export function talksUrl(api: string, before?: string): string {
  const base = `${api}/api/conversations?limit=${TALKS_PAGE}`;
  return before ? `${base}&before=${encodeURIComponent(before)}` : base;
}

/** A full page means older talks may still exist. */
export function hasOlder(pageCount: number): boolean {
  return pageCount >= TALKS_PAGE;
}

/** Merge two lists: one copy per id (the incoming one wins), newest first. */
export function mergeTalks(current: ConversationView[], incoming: ConversationView[]): ConversationView[] {
  const byId = new Map<string, ConversationView>();
  for (const t of current) byId.set(t.id, t);
  for (const t of incoming) byId.set(t.id, t);
  return [...byId.values()].sort((a, b) => {
    const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (d !== 0 && !Number.isNaN(d)) return d;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

export interface TalkName {
  id: string;
  name: string;
  color: string;
  /** text to put before this name ("" for the first) */
  sep: string;
}

/** Header names: "Kwame ↔ Sena" for two, "A, B, C" for more. */
export function talkNames(talk: ConversationView): TalkName[] {
  const between = talk.twins.length === 2 ? " ↔ " : ", ";
  return talk.twins.map((t, i) => ({ id: t.id, name: t.name, color: hex(t.colorHex), sep: i === 0 ? "" : between }));
}

/** "☕ The café" for a zone id; "" when unknown. */
export function talkPlace(zone: string | null): string {
  if (!zone) return "";
  return `${ZONE_EMOJI[zone] ?? "📍"} ${ZONE_DISPLAY[zone] ?? zone}`;
}

/** "☕ The café · 5m ago" — place (if any) and relative time. */
export function talkMeta(talk: ConversationView, now: number = Date.now()): string {
  return [talkPlace(talk.zone), relTime(talk.createdAt, now)].filter(Boolean).join(" · ");
}

/** The twin who spoke a line (matched by name), or null. */
export function speakerTwin(talk: ConversationView, speaker: string): ConversationView["twins"][number] | null {
  return talk.twins.find((t) => t.name === speaker) ?? null;
}
