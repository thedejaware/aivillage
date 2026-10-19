import { describe, it, expect } from "vitest";
import { CAPTION_MAX_MS, CAPTION_MIN_MS, CAPTION_QUEUE_MAX, captionMs, enqueueCaptions } from "../../lib/hud/captions";

describe("captionMs: long enough to read in a second language", () => {
  it("reads at about 12 characters a second, plus 1.5 s to notice the new line", () => {
    expect(captionMs("x".repeat(60))).toBe(1500 + 60 * 83); // ≈ 6.5 s
  });

  it("never flashes by, never hangs forever", () => {
    expect([CAPTION_MIN_MS, CAPTION_MAX_MS]).toEqual([3000, 15000]);
    expect(captionMs("Hi!")).toBe(3000);
    expect(captionMs("x".repeat(400))).toBe(15000);
  });

  it("the long Kwame line from the screenshot gets ~12 s (it got 7 s before)", () => {
    const line = `"Only you would turn a runaway goat into a romance. Come by the square tonight, I'll tell it properly and you can be the judge."`;
    expect(captionMs(line)).toBeGreaterThan(11_500);
  });
});

describe("enqueueCaptions: a new conversation waits instead of cutting the current one", () => {
  const c = (text: string) => ({ twinId: "a", name: "A", color: "#000", text });

  it("adds new lines at the end", () => {
    expect(enqueueCaptions([c("1")], [c("2"), c("3")]).map((x) => x.text)).toEqual(["1", "2", "3"]);
  });

  it("keeps at most CAPTION_QUEUE_MAX waiting lines, skipping the oldest", () => {
    const q = enqueueCaptions([], Array.from({ length: CAPTION_QUEUE_MAX + 3 }, (_, i) => c(String(i))));
    expect(q).toHaveLength(CAPTION_QUEUE_MAX);
    expect(q[0].text).toBe("3");
  });
});
