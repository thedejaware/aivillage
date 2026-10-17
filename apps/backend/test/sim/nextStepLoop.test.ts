/**
 * The next-step loop: every time a twin finishes an activity, its AI (or the
 * rules) picks the next one — capped per minute by chattiness, paused while
 * nobody watches.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { actHoldMs, findAction, type Chattiness, type LlmClient, type OwnerOrder } from "@aivillage/shared";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { startNextStepLoop } from "../../src/sim/nextStepLoop.js";
import { claimTwins, releaseTwins } from "../../src/sim/twinLocks.js";
import { queuedSteps, clearQueuedSteps, setQueuedSteps } from "../../src/sim/stepQueue.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";
import { DrizzleMemoryRepository } from "../../src/db/memoryRepository.js";

let tdb: TestDb;
// @ts-expect-error drizzle exposes raw client via session.client
const sql = () => tdb.db.session.client as { unsafe: (q: string) => Promise<Record<string, unknown>[]> };

beforeAll(async () => {
  tdb = await startTestDb();
});
afterAll(async () => {
  await tdb.stop();
});
beforeEach(async () => {
  clearQueuedSteps();
  await sql().unsafe(`delete from memories; delete from relationships; delete from chat_messages; delete from twins; delete from users;`);
});

const T0 = new Date("2026-10-17T12:00:00Z");

async function addTwin(name: string, opts: { stamina?: number; zone?: string; order?: OwnerOrder | null; main?: boolean; createdSec?: number } = {}): Promise<string> {
  let owner = "null";
  if (opts.main) {
    const [u] = await sql().unsafe(`insert into users (email) values ('${name}@x.com') returning id`);
    owner = `'${u.id}'`;
  }
  const [row] = await sql().unsafe(
    `insert into twins (name, owner_user_id, is_npc, role, location_zone, stamina, owner_order, created_at)
     values ('${name}', ${owner}, ${opts.main ? "false" : "true"}, '${opts.main ? "main" : "villager"}', '${opts.zone ?? "plaza"}',
             ${opts.stamina ?? 100}, ${opts.order ? `'${JSON.stringify(opts.order)}'::jsonb` : "null"},
             '${new Date(T0.getTime() - 3600_000 + (opts.createdSec ?? 0) * 1000).toISOString()}')
     returning id`
  );
  return String(row.id);
}

const order = (zone: string, auto: boolean, minutesLeft = 5): OwnerOrder => ({
  kind: auto ? "act" : "go", zone, targetName: null, label: "busy", auto,
  issuedAt: new Date(T0.getTime() - 60_000).toISOString(),
  holdUntil: new Date(T0.getTime() + minutesLeft * 60_000).toISOString()
});

const step = (zone: string, action: string, partner: string | null = null) =>
  JSON.stringify({ zone, action, partner, narrative: `off to ${zone}` });

/** A fake AI that answers by twin name ("You are <Name>"), else `fallback`. */
function fakeLlm(byName: Record<string, string>, fallback = step("network_hub", "read")): LlmClient & { generate: ReturnType<typeof vi.fn> } {
  return {
    generate: vi.fn(async (prompt: string) => {
      const who = /You are ([^,]+),/.exec(prompt)?.[1] ?? "";
      return byName[who] ?? fallback;
    })
  };
}

function loop(opts: { llm: LlmClient | null; watched?: () => boolean; chattiness?: Chattiness; clock?: { now: Date }; emitWorld?: () => void }) {
  const clock = opts.clock ?? { now: T0 };
  return startNextStepLoop({
    emitWorld: opts.emitWorld ?? (() => {}),
    isWatched: opts.watched ?? (() => true),
    getLlm: async () => opts.llm,
    getChattiness: async () => opts.chattiness ?? "normal",
    db: tdb.db,
    now: () => clock.now,
    random: () => 0.3
  });
}

const twin = async (id: string) => (await new DrizzleTwinRepository(tdb.db).getById(id))!;

describe("startNextStepLoop", () => {
  it("does nothing while nobody is watching (energy frozen)", async () => {
    const id = await addTwin("Memo", { stamina: 50 });
    const llm = fakeLlm({ Memo: step("pool", "swim") });
    const l = loop({ llm, watched: () => false });
    expect(await l.tick()).toBe(0);
    l.stop();
    expect(llm.generate).not.toHaveBeenCalled();
    expect(await twin(id)).toMatchObject({ stamina: 50, order: null });
  });

  it("a free twin gets its next activity: an auto act order, energy spent, a memory, one world emit", async () => {
    const id = await addTwin("Memo", { stamina: 80 });
    const emitWorld = vi.fn();
    const l = loop({ llm: fakeLlm({ Memo: step("pool", "swim") }), emitWorld });
    expect(await l.tick()).toBe(1);
    l.stop();
    const t = await twin(id);
    expect(t.stamina).toBe(55);
    expect(t.locationZone).toBe("pool");
    expect(t.order).toMatchObject({ kind: "act", auto: true, zone: "pool", targetName: null, action: { id: "swim", anim: "swim" } });
    expect(Date.parse(t.order!.holdUntil) - T0.getTime()).toBe(actHoldMs(findAction("swim")!));
    const mem = await new DrizzleMemoryRepository(tdb.db).recent(id, 3);
    expect(mem[0]).toMatchObject({ kind: "act", content: "off to pool" });
    expect(emitWorld).toHaveBeenCalledTimes(1);
  });

  it("sleeping at home refills energy to 100", async () => {
    const id = await addTwin("Memo", { stamina: 5 });
    const l = loop({ llm: fakeLlm({ Memo: step("home", "sleep") }) });
    await l.tick();
    l.stop();
    expect(await twin(id)).toMatchObject({ stamina: 100, locationZone: "home" });
  });

  it("skips twins busy with an order; the main twin is included when it has no owner order", async () => {
    const owned = await addTwin("Boss", { main: true, order: order("maker_space", false) });
    const auto = await addTwin("Busy", { order: order("gym", true) });
    const free = await addTwin("Free");
    const llm = fakeLlm({});
    const l = loop({ llm });
    expect(await l.tick()).toBe(1);
    l.stop();
    expect((await twin(owned)).order).toMatchObject({ zone: "maker_space", auto: false });
    expect((await twin(auto)).order).toMatchObject({ zone: "gym" });
    expect((await twin(free)).order).toMatchObject({ zone: "network_hub", auto: true });

    await sql().unsafe(`update twins set owner_order = null where id = '${owned}'`);
    const l2 = loop({ llm, clock: { now: new Date(T0.getTime() + 1000) } });
    expect(await l2.tick()).toBe(1);
    l2.stop();
    expect((await twin(owned)).order).toMatchObject({ auto: true });
  });

  it("skips twins another loop is working on right now", async () => {
    const id = await addTwin("Locked");
    claimTwins([id]);
    try {
      const l = loop({ llm: fakeLlm({}) });
      expect(await l.tick()).toBe(0);
      l.stop();
    } finally {
      releaseTwins([id]);
    }
  });

  it("honours the per-minute cap; the rest wait their turn", async () => {
    for (let i = 0; i < 5; i++) await addTwin(`T${i}`, { createdSec: i });
    const clock = { now: T0 };
    const llm = fakeLlm({}, step("cinema", "watch_movie"));
    const l = loop({ llm, chattiness: "calm", clock });
    expect(await l.tick()).toBe(3);
    expect(await l.tick()).toBe(0); // same minute: budget spent
    clock.now = new Date(T0.getTime() + 30_000);
    expect(await l.tick()).toBe(0);
    clock.now = new Date(T0.getTime() + 61_000);
    expect(await l.tick()).toBe(2);
    l.stop();
    expect(llm.generate).toHaveBeenCalledTimes(5);
  });

  it("a failed AI call still moves the twin (rule-based step)", async () => {
    const id = await addTwin("Memo", { stamina: 90 });
    const l = loop({ llm: { generate: async () => { throw new Error("boom"); } } });
    expect(await l.tick()).toBe(1);
    l.stop();
    expect((await twin(id)).order).toMatchObject({ kind: "act", auto: true });
  });

  it("without an AI every free twin follows the rules", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push(await addTwin(`R${i}`, { createdSec: i }));
    const l = loop({ llm: null, chattiness: "calm" });
    expect(await l.tick()).toBe(5);
    l.stop();
    for (const id of ids) expect((await twin(id)).order).toMatchObject({ auto: true });
  });

  it("a full place is never chosen (5th rider goes elsewhere)", async () => {
    for (let i = 0; i < 4; i++) await addTwin(`Rider${i}`, { order: order("funfair", true) });
    const id = await addTwin("Late");
    const l = loop({ llm: fakeLlm({ Late: step("funfair", "ride_coaster") }) });
    await l.tick();
    l.stop();
    expect((await twin(id)).order!.zone).not.toBe("funfair");
  });

  it("two twins in one tick can't overfill a place", async () => {
    for (let i = 0; i < 2; i++) await addTwin(`Lifter${i}`, { order: order("gym", true) });
    const a = await addTwin("A", { createdSec: 1 });
    const b = await addTwin("B", { createdSec: 2 });
    const l = loop({ llm: fakeLlm({}, step("gym", "work_out")) });
    expect(await l.tick()).toBe(2);
    l.stop();
    const zones = [(await twin(a)).order!.zone, (await twin(b)).order!.zone];
    expect(zones.filter((z) => z === "gym")).toHaveLength(1);
  });

  it("a tired twin's tiring choice becomes rest", async () => {
    const id = await addTwin("Memo", { stamina: 8 });
    const l = loop({ llm: fakeLlm({ Memo: step("gym", "work_out") }) });
    await l.tick();
    l.stop();
    expect(await twin(id)).toMatchObject({ locationZone: "home", stamina: 100 });
  });

  it("an invited partner who likes the twin comes along: both go, both spend energy", async () => {
    const memo = await addTwin("Memo", { stamina: 80, createdSec: 1 });
    const sena = await addTwin("Sena", { stamina: 60, createdSec: 2 });
    await sql().unsafe(`insert into relationships (from_twin_id, to_twin_id, score) values ('${sena}', '${memo}', 20)`);
    const l = loop({ llm: fakeLlm({ Memo: step("cinema", "watch_movie", "Sena") }) });
    await l.tick();
    l.stop();
    expect(await twin(memo)).toMatchObject({ stamina: 75, locationZone: "cinema", order: { auto: true, zone: "cinema", targetName: "Sena", action: { id: "watch_movie" } } });
    expect(await twin(sena)).toMatchObject({ stamina: 55, locationZone: "cinema", order: { auto: true, zone: "cinema", targetName: "Memo", action: { id: "watch_movie" } } });
    const mem = await new DrizzleMemoryRepository(tdb.db).recent(sena, 3);
    expect(mem.some((m) => m.kind === "act")).toBe(true);
  });

  it("a partner who refuses stays out of it: the twin goes alone and remembers the no", async () => {
    const memo = await addTwin("Memo", { createdSec: 1 });
    const sena = await addTwin("Sena", { createdSec: 2 });
    await sql().unsafe(`insert into relationships (from_twin_id, to_twin_id, score) values ('${sena}', '${memo}', -50)`);
    const l = loop({ llm: fakeLlm({ Memo: step("cinema", "watch_movie", "Sena") }) });
    await l.tick();
    l.stop();
    expect((await twin(memo)).order).toMatchObject({ zone: "cinema", targetName: null });
    expect((await twin(sena)).order?.zone).not.toBe("cinema");
    const mem = await new DrizzleMemoryRepository(tdb.db).recent(memo, 3);
    expect(mem.some((m) => m.kind === "act" && /Sena/.test(m.content) && /no/i.test(m.content))).toBe(true);
  });
});

describe("to-do list mode: one AI call plans several activities", () => {
  const plan = (...steps: [string, string][]) => `[${steps.map(([z, a]) => step(z, a)).join(",")}]`;
  const after = (clock: { now: Date }, ms: number) => { clock.now = new Date(clock.now.getTime() + ms + 1000); };

  it("one AI call → 3 activities in a row; the 4th triggers the second call", async () => {
    const id = await addTwin("Memo");
    const llm = fakeLlm({ Memo: plan(["pool", "swim"], ["maker_space", "eat"], ["cinema", "watch_movie"]) });
    const clock = { now: T0 };
    const l = loop({ llm, clock });
    expect(await l.tick()).toBe(1);
    expect((await twin(id)).order!.zone).toBe("pool");
    expect(queuedSteps(id).map((s) => s.zone)).toEqual(["maker_space", "cinema"]);
    expect(await l.tick()).toBe(0); // still swimming

    after(clock, actHoldMs(findAction("swim")!));
    expect(await l.tick()).toBe(1);
    expect((await twin(id)).order!.zone).toBe("maker_space");
    after(clock, actHoldMs(findAction("eat")!));
    await l.tick();
    expect((await twin(id)).order!.zone).toBe("cinema");
    expect(llm.generate).toHaveBeenCalledTimes(1);

    after(clock, actHoldMs(findAction("watch_movie")!));
    await l.tick();
    l.stop();
    expect(llm.generate).toHaveBeenCalledTimes(2);
    expect((await twin(id)).stamina).toBe(100 - 25 + 15 - 5 - 25);
  });

  it("queued steps don't count against the per-minute AI cap", async () => {
    const fresh = [];
    for (let i = 0; i < 4; i++) fresh.push(await addTwin(`New${i}`, { createdSec: i }));
    const planned = [];
    for (let i = 0; i < 2; i++) {
      const id = await addTwin(`Planned${i}`, { createdSec: 10 + i });
      setQueuedSteps(id, [{ zone: "cinema", action: "watch_movie", partner: null, narrative: "movie" }]);
      planned.push(id);
    }
    const llm = fakeLlm({}, plan(["event_space", "sit"], ["network_hub", "read"]));
    const l = loop({ llm, chattiness: "calm" });
    expect(await l.tick()).toBe(5); // 3 new plans (the cap) + 2 queued steps for free
    l.stop();
    expect(llm.generate).toHaveBeenCalledTimes(3);
    for (const id of planned) expect((await twin(id)).order!.zone).toBe("cinema");
    expect((await twin(fresh[3])).order).toBeNull(); // waits for next minute's planning slot
  });

  it("a tired twin drops its queue: rest now, and the next plan sees the new energy", async () => {
    const id = await addTwin("Memo");
    const llm = fakeLlm({ Memo: plan(["pool", "swim"], ["gym", "work_out"], ["cinema", "watch_movie"]) });
    const clock = { now: T0 };
    const l = loop({ llm, clock });
    await l.tick();
    await sql().unsafe(`update twins set stamina = 15 where id = '${id}'`);
    after(clock, actHoldMs(findAction("swim")!));
    await l.tick();
    const t = await twin(id);
    expect(["maker_space", "network_hub"]).toContain(t.order!.zone);
    expect(t.stamina).toBeGreaterThan(15);
    expect(queuedSteps(id)).toEqual([]);
    after(clock, 200_000);
    await l.tick();
    l.stop();
    expect(llm.generate).toHaveBeenCalledTimes(2);
  });

  it("a full place is skipped: the twin moves on to the next planned step", async () => {
    const id = await addTwin("Memo", { createdSec: 0 });
    const llm = fakeLlm({ Memo: plan(["pool", "swim"], ["gym", "work_out"], ["cinema", "watch_movie"]) });
    const clock = { now: T0 };
    const l = loop({ llm, clock });
    await l.tick();
    after(clock, actHoldMs(findAction("swim")!));
    const busy = { ...order("gym", true), holdUntil: new Date(clock.now.getTime() + 600_000).toISOString() };
    for (let i = 0; i < 3; i++) await addTwin(`Lifter${i}`, { order: busy, createdSec: 10 + i });
    await l.tick();
    l.stop();
    expect((await twin(id)).order!.zone).toBe("cinema");
    expect(llm.generate).toHaveBeenCalledTimes(1);
  });

  it("an owner order clears the queue", async () => {
    const id = await addTwin("Memo", { main: true });
    const llm = fakeLlm({ Memo: plan(["pool", "swim"], ["gym", "work_out"]) });
    const clock = { now: T0 };
    const l = loop({ llm, clock });
    await l.tick();
    expect(queuedSteps(id)).toHaveLength(1);
    await sql().unsafe(`update twins set owner_order = '${JSON.stringify({ ...order("plaza", false), holdUntil: new Date(T0.getTime() + 600_000).toISOString() })}'::jsonb where id = '${id}'`);
    await l.tick();
    l.stop();
    expect(queuedSteps(id)).toEqual([]);
  });
});
