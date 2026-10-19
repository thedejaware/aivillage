import { describe, it, expect } from "vitest";
import { KITCHEN_DISHES, dishLookFor, isDrinkLook, kitchenEnergyPhases, kitchenSteps } from "../src/dishes";

describe("dishes", () => {
  it("the owner's list is on the menu", () => {
    const names = KITCHEN_DISHES.map((d) => d.name);
    for (const n of ["hamburger", "chicken", "steak", "pasta", "dessert", "juice"]) expect(names, n).toContain(n);
  });

  it("any dish name gets the closest look; unknown dishes use a plain plate", () => {
    expect(dishLookFor("Cheese burger")).toBe("burger");
    // "steak" has "tea" inside it: still a steak; every menu dish keeps its own look
    expect(dishLookFor("steak")).toBe("steak");
    expect(dishLookFor("iced tea")).toBe("drink");
    for (const d of KITCHEN_DISHES) expect(dishLookFor(d.name), d.name).toBe(d.look);
    expect(dishLookFor("roast chicken")).toBe("chicken");
    expect(dishLookFor("spaghetti")).toBe("pasta");
    expect(dishLookFor("chocolate cake")).toBe("dessert");
    expect(dishLookFor("orange juice")).toBe("drink");
    expect(dishLookFor("lemonade")).toBe("drink");
    expect(dishLookFor("sushi")).toBe("plate");
  });

  it("food: prep 25 s, cook 35 s, carry 5 s, eat 60 s; drinks skip the stove", () => {
    expect(kitchenSteps("pasta")).toEqual([
      { step: "prep", seconds: 25 }, { step: "cook", seconds: 35 }, { step: "carry", seconds: 5 }, { step: "eat", seconds: 60 }
    ]);
    expect(isDrinkLook("drink")).toBe(true);
    expect(kitchenSteps("drink").map((s) => s.step)).toEqual(["prep", "carry", "eat"]);
  });

  it("energy: −1 every 10 s while preparing and cooking, nothing while carrying, +1 every 5 s while eating", () => {
    expect(kitchenEnergyPhases("pasta")).toEqual([
      { ms: 60_000, everyMs: 10_000, dir: -1 }, { ms: 5_000, everyMs: 10_000, dir: 0 }, { ms: 60_000, everyMs: 5_000, dir: 1 }
    ]);
  });
});
