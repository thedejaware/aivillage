import { describe, it, expect } from "vitest";
import { friendsText, friendsTip, popularityText, popularityTip } from "../../lib/hud/stats";

describe("popularity", () => {
  it("shows only the rank", () => {
    expect(popularityText(5, 10)).toBe("#5 of 10");
    expect(popularityText(1, 1)).toBe("#1 of 1");
  });

  it("shows a dash before the rank is known", () => {
    expect(popularityText(0, 10)).toBe("—");
    expect(popularityText(3, 0)).toBe("—");
  });

  it("the tip says what it means and how to climb, with the twin's name", () => {
    const tip = popularityTip("Mehmet");
    expect(tip).toContain("Mehmet");
    expect(tip).toMatch(/#1/);
    expect(tip).toMatch(/chat/i);
  });
});

describe("friends", () => {
  it("counts liked twins and rivals", () => {
    expect(friendsText(5, 1)).toBe("5 liked · 1 rival");
    expect(friendsText(0, 2)).toBe("0 liked · 2 rivals");
    expect(friendsText(3, 0)).toBe("3 liked · 0 rivals");
  });

  it("the tip explains both words, with the twin's name", () => {
    const tip = friendsTip("Mehmet");
    expect(tip).toMatch(/Liked: .*Mehmet likes/);
    expect(tip).toMatch(/Rivals: .*Mehmet dislikes/);
  });
});
