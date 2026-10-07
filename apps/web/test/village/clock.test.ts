import { describe, it, expect } from "vitest";
import { DAY_CYCLE_SECONDS, daynessAt, villageClock } from "../../lib/village/clock";

const at = (fraction: number) => fraction * DAY_CYCLE_SECONDS * 1000;

describe("village clock", () => {
  it("formats the time of day as HH:MM", () => {
    expect(villageClock(at(0))).toBe("00:00");
    expect(villageClock(at(0.25))).toBe("06:00");
    expect(villageClock(at(0.5 + 1 / 1440))).toBe("12:01");
    expect(villageClock(at(1.75))).toBe("18:00"); // wraps every cycle
  });
  it("is full daylight at noon and dark at midnight", () => {
    expect(daynessAt(at(0.5))).toBe(1);
    expect(daynessAt(at(0))).toBe(0);
  });
  it("days are longer than nights", () => {
    let light = 0;
    for (let i = 0; i < 1000; i++) if (daynessAt(at(i / 1000)) > 0) light++;
    expect(light).toBeGreaterThan(550);
  });
});
