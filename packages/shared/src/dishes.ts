// --- The kitchen's menu: what twins cook, how each dish looks, and the steps of a meal ---

import { ENERGY_COOK_MS, ENERGY_EAT_MS, type EnergyPhase } from "./energy.js";

/** How a dish is drawn (on the board, in the pan, on the plate). */
export type DishLook = "burger" | "chicken" | "steak" | "pasta" | "dessert" | "salad" | "drink" | "plate";

/** A dish: what the owner (or the twin) called it, and the closest look. */
export interface Dish {
  name: string;
  look: DishLook;
}

/** What a twin picks when it cooks without being told what. */
export const KITCHEN_DISHES: Dish[] = [
  { name: "hamburger", look: "burger" },
  { name: "chicken", look: "chicken" },
  { name: "steak", look: "steak" },
  { name: "pasta", look: "pasta" },
  { name: "dessert", look: "dessert" },
  { name: "salad", look: "salad" },
  { name: "juice", look: "drink" },
  { name: "smoothie", look: "drink" },
  { name: "lemonade", look: "drink" }
];

const LOOK_WORDS: [DishLook, RegExp][] = [
  ["drink", /juice|smoothie|lemonade|shake|\btea\b|cocktail|drink/],
  ["dessert", /dessert|cake|pie|cookie|brownie|pudding|ice cream|pancake|waffle|tiramisu/],
  ["burger", /burger|sandwich|hot ?dog/],
  ["chicken", /chicken|wings|nugget|turkey/],
  ["steak", /steak|beef|meat|lamb|pork|kebab|ribs/],
  ["pasta", /pasta|spaghetti|noodle|lasagn|macaroni|ravioli|penne/],
  ["salad", /salad|vegetable|veggie/]
];

/** The closest look for any dish name; anything unknown ("sushi") gets a plain plate. */
export function dishLookFor(name: string): DishLook {
  const n = name.toLowerCase();
  return LOOK_WORDS.find(([, re]) => re.test(n))?.[0] ?? "plate";
}

export const isDrinkLook = (look: DishLook): boolean => look === "drink";

export type KitchenStep = "prep" | "cook" | "carry" | "eat";

/** The steps of one meal, in seconds: drinks are blended at the counter and skip the stove. */
export function kitchenSteps(look: DishLook): { step: KitchenStep; seconds: number }[] {
  if (isDrinkLook(look)) return [{ step: "prep", seconds: 20 }, { step: "carry", seconds: 5 }, { step: "eat", seconds: 40 }];
  return [{ step: "prep", seconds: 25 }, { step: "cook", seconds: 35 }, { step: "carry", seconds: 5 }, { step: "eat", seconds: 60 }];
}

/** Energy over a meal: −1 / 10 s while preparing and cooking, nothing while carrying, +1 / 5 s while eating. */
export function kitchenEnergyPhases(look: DishLook): EnergyPhase[] {
  const out: EnergyPhase[] = [];
  for (const { step, seconds } of kitchenSteps(look)) {
    const ms = seconds * 1000;
    if (step === "eat") out.push({ ms, everyMs: ENERGY_EAT_MS, dir: 1 });
    else if (step === "carry") out.push({ ms, everyMs: ENERGY_COOK_MS, dir: 0 });
    else {
      const last = out[out.length - 1];
      if (last && last.dir === -1) last.ms += ms; // prep + cook: one draining stretch
      else out.push({ ms, everyMs: ENERGY_COOK_MS, dir: -1 });
    }
  }
  return out;
}
