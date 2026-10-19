import { describe, it, expect } from "vitest";
import {
  PLACES, placeOf, applyStamina, isTired, restPlaceFor, staminaDelta, findAction, resolveAction, actHoldMs,
  DEFAULT_ZONES, ZONE_DISPLAY, ZONE_EMOJI, MAX_STAMINA, TIRED_BELOW, EXHAUSTED_BELOW
} from "../src/index.js";

const ZONES = ["home", "network_hub", "maker_space", "garden", "plaza", "gym", "pool", "event_space", "cinema", "funfair", "bike_rack"];

describe("places", () => {
  it("every zone is a place with a name, an emoji and a tile", () => {
    for (const z of ZONES) {
      expect(placeOf(z), z).toBeDefined();
      expect(ZONE_DISPLAY[z], z).toBeTruthy();
      expect(ZONE_EMOJI[z], z).toBeTruthy();
      expect(DEFAULT_ZONES.some((d) => d.name === z), z).toBe(true);
    }
    expect(PLACES).toHaveLength(ZONES.length);
  });

  it("energy effects follow the design", () => {
    const effect = (z: string) => placeOf(z)!.stamina;
    expect([effect("gym"), effect("pool"), effect("bike_rack"), effect("funfair"), effect("garden"), effect("plaza"), effect("cinema")]).toEqual([-12, -12, -8, -8, -5, -5, -3]);
    expect([effect("maker_space"), effect("network_hub"), effect("event_space")]).toEqual([15, 20, 10]);
  });

  it("capacities follow the design", () => {
    const cap = (z: string) => placeOf(z)!.capacity;
    expect([cap("maker_space"), cap("gym"), cap("pool"), cap("cinema"), cap("funfair"), cap("bike_rack"), cap("garden"), cap("network_hub")]).toEqual([8, 5, 12, 10, 4, 4, 3, 2]);
  });

  it("busy places block conversations; restful places don't", () => {
    for (const z of ["gym", "pool", "funfair", "bike_rack", "home"]) expect(placeOf(z)!.busy, z).toBe(true);
    for (const z of ["maker_space", "cinema", "event_space", "network_hub"]) expect(placeOf(z)!.busy, z).toBe(false);
  });
});

describe("stamina", () => {
  it("is 0–100 and the house refills it", () => {
    expect(MAX_STAMINA).toBe(100);
    expect(applyStamina(90, "maker_space")).toBe(100);
    expect(applyStamina(10, "gym")).toBe(0);
    expect(applyStamina(3, "home")).toBe(100);
    expect(applyStamina(50, "plaza", -5)).toBe(45);
  });
  it("tired below 20, exhausted below 10", () => {
    expect([TIRED_BELOW, EXHAUSTED_BELOW]).toEqual([20, 10]);
    expect(isTired(19)).toBe(true);
    expect(isTired(20)).toBe(false);
  });
  it("tired twins rest: the house when exhausted, else the café or the quiet corner", () => {
    expect(restPlaceFor(5)).toBe("home");
    expect(["maker_space", "network_hub"]).toContain(restPlaceFor(15, () => 0.2));
    expect(["maker_space", "network_hub"]).toContain(restPlaceFor(15, () => 0.8));
  });
});

describe("place actions", () => {
  it.each([
    ["go swimming", "swim"], ["swim", "swim"], ["work out", "work_out"], ["run", "run"], ["ride a bike", "ride_bike"],
    ["watch a movie", "watch_movie"], ["ride the rollercoaster", "ride_coaster"], ["pick vegetables", "garden"],
    ["make juice", "drink_juice"], ["go to sleep", "sleep"]
  ])("%s → %s", (name, id) => {
    expect(findAction(name)?.id).toBe(id);
  });

  it("each place action happens at its place with the right body animation", () => {
    expect(findAction("swim")).toMatchObject({ place: "pool", anim: "swim" });
    expect(findAction("ride_coaster")).toMatchObject({ place: "funfair", anim: "ride" });
    expect(findAction("ride_bike")).toMatchObject({ place: "bike_rack", anim: "bike" });
    expect(findAction("watch_movie")).toMatchObject({ place: "cinema", anim: "watch", item: "popcorn" });
    expect(findAction("sleep")).toMatchObject({ place: "home" });
    expect(findAction("drink_juice")).toMatchObject({ place: "maker_space", item: "juice" });
  });

  it("energy effect of an action", () => {
    expect(staminaDelta(findAction("swim")!)).toBe(-12);
    expect(staminaDelta(findAction("drink_juice")!)).toBe(10);
    expect(staminaDelta(findAction("sunbathe")!)).toBe(10);
    expect(staminaDelta(findAction("hug")!)).toBe(0);
    expect(staminaDelta(findAction("jump")!)).toBe(0);
  });

  it("'take Sena to the cinema': a place action keeps its partner", () => {
    const r = resolveAction({ action: "watch_movie", target: "Sena" });
    expect(r).toMatchObject({ ok: true, action: { id: "watch_movie", targetName: "Sena", place: "cinema" } });
  });

  it("an activity holds the twin for its length plus walking time", () => {
    const r = resolveAction({ action: "watch_movie" });
    if (!r.ok) throw new Error("expected ok");
    expect(actHoldMs(r.action)).toBe((r.action.seconds + 40) * 1000);
  });
});
