/**
 * The TV caption bar's timing. Subtitle guides plan ~15–17 characters a second
 * for native readers; we use 12 so people reading in a second language can
 * keep up, plus a moment to notice that a new line appeared.
 */

/** One line on the caption bar. */
export interface Caption {
  twinId: string;
  name: string;
  color: string;
  text: string;
}

/** Milliseconds per character (≈ 12 characters a second). */
export const CAPTION_MS_PER_CHAR = 83;
/** Time to notice a new line before reading it. */
export const CAPTION_NOTICE_MS = 1500;
export const CAPTION_MIN_MS = 3000;
export const CAPTION_MAX_MS = 15000;
/** Lines waiting to be shown; beyond this the oldest are skipped (the Talks tab keeps them all). */
export const CAPTION_QUEUE_MAX = 8;

/** How long a caption stays on screen. */
export function captionMs(text: string): number {
  return Math.min(CAPTION_MAX_MS, Math.max(CAPTION_MIN_MS, CAPTION_NOTICE_MS + text.length * CAPTION_MS_PER_CHAR));
}

/** Add new lines to the waiting queue; a new conversation waits instead of cutting the current one. */
export function enqueueCaptions(queue: Caption[], lines: Caption[]): Caption[] {
  const next = [...queue, ...lines];
  return next.length > CAPTION_QUEUE_MAX ? next.slice(next.length - CAPTION_QUEUE_MAX) : next;
}
