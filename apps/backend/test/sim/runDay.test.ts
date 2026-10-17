/**
 * Integration tests for runDay: venue-routing behaviour.
 *
 * Twins physically move to the venue that matches their action:
 *   chat    → maker_space  (THE CAFE,  col -1, row 6)
 *   bond    → event_space  (THE LAWN,  col 7, row 8)
 *   bigmove → plaza        (THE STAGE, col 4, row 1)
 *   scheme  → network_hub  (QUIET CORNER, col -4, row -2)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { runDay } from "../../src/sim/runDay.js";
import { CannedLlmClient } from "../../src/sim/cannedLlm.js";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";
import { actHoldMs, findAction, DEFAULT_ZONES, type LlmClient } from "@aivillage/shared";

// ─── zone centres (from DEFAULT_ZONES in world.ts) ───────────────────────────
const zoneAt = (name: string) => {
  const z = DEFAULT_ZONES.find((zz) => zz.name === name)!;
  return { col: z.col, row: z.row };
};
const PLAZA       = zoneAt("plaza");
const MAKER_SPACE = zoneAt("maker_space");
const NETWORK_HUB = zoneAt("network_hub");
const EVENT_SPACE = zoneAt("event_space");

// ─── tolerance for fractional offsets ────────────────────────────────────────
const NEAR = 2.5; // allow ±2.5 tiles from zone centre
function near(actual: number, centre: number, tol = NEAR) {
  expect(Math.abs(actual - centre)).toBeLessThanOrEqual(tol);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Start a fresh testcontainer DB and insert exactly two NPC twins. */
async function makeDb(names: [string, string]) {
  const tdb = await startTestDb();
  // @ts-expect-error drizzle exposes raw client via session.client
  const client = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
  const [a] = await client.unsafe(
    `insert into twins (name, is_npc, energy, energy_updated_at, location_zone)
     values ('${names[0]}', true, 10, now(), 'plaza') returning id`
  );
  const [b] = await client.unsafe(
    `insert into twins (name, is_npc, energy, energy_updated_at, location_zone)
     values ('${names[1]}', true, 10, now(), 'plaza') returning id`
  );
  return { tdb, idA: a.id, idB: b.id };
}

// ─── canned LLM responses ────────────────────────────────────────────────────
const mkChat    = (actor: string, target: string) =>
  JSON.stringify({ verb: "chat",    target, kind: null, narrative: `${actor} waves.` });
const mkBond    = (actor: string, target: string) =>
  JSON.stringify({ verb: "bond",    target, kind: null, narrative: `${actor} brings a gift.` });
const mkBigmove = (actor: string, target: string) =>
  JSON.stringify({ verb: "bigmove", target, kind: "confront", narrative: `${actor} confronts ${target}.` });
const mkScheme  = (actor: string) =>
  JSON.stringify({ verb: "scheme",  target: null, kind: null, narrative: `${actor} thinks.` });
const mkConvo   = (a: string, b: string) =>
  JSON.stringify({
    lines: [{ speaker: a, text: "hi" }, { speaker: b, text: "hey" }],
    deltaAtoB: 1, deltaBtoA: 1, moment: null
  });

// ─── tests ───────────────────────────────────────────────────────────────────

describe("runDay venue routing", () => {
  it("chat beat: both participants end up at cafe (maker_space) coordinates", async () => {
    const { tdb, idA, idB } = await makeDb(["ChatA", "ChatB"]);
    try {
      // LLM call order (sequential): planBeat(ChatA), planBeat(ChatB), converse(ChatA,ChatB)
      const llm = new CannedLlmClient([
        mkChat("ChatA", "ChatB"),   // planBeat for ChatA
        mkScheme("ChatB"),          // planBeat for ChatB
        mkConvo("ChatA", "ChatB"),  // converse
      ]);

      const { frames } = await runDay(llm, { beats: 1, db: tdb.db });
      expect(frames.length).toBe(1);

      const frame = frames[0];
      const twinA = frame.twins.find((t) => t.name === "ChatA")!;
      const twinB = frame.twins.find((t) => t.name === "ChatB")!;

      expect(twinA).toBeDefined();
      expect(twinB).toBeDefined();

      // Both should be near maker_space
      near(twinA.col, MAKER_SPACE.col);
      near(twinA.row, MAKER_SPACE.row);
      near(twinB.col, MAKER_SPACE.col);
      near(twinB.row, MAKER_SPACE.row);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("NPC bigmove beat: both participants end up near plaza (THE STAGE)", async () => {
    const { tdb } = await makeDb(["BmoveA", "BmoveB"]);
    try {
      // LLM call order: planBeat(BmoveA)→bigmove, planBeat(BmoveB)→scheme
      const llm = new CannedLlmClient([
        mkBigmove("BmoveA", "BmoveB"),
        mkScheme("BmoveB"),
      ]);

      const { frames } = await runDay(llm, { beats: 1, db: tdb.db });
      expect(frames.length).toBe(1);

      const frame = frames[0];
      const twinA = frame.twins.find((t) => t.name === "BmoveA")!;
      const twinB = frame.twins.find((t) => t.name === "BmoveB")!;

      expect(twinA).toBeDefined();
      expect(twinB).toBeDefined();

      // Both should be near plaza (col 3, row 3)
      near(twinA.col, PLAZA.col);
      near(twinA.row, PLAZA.row);
      near(twinB.col, PLAZA.col);
      near(twinB.row, PLAZA.row);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("bond beat: both participants end up at lawn (event_space) coordinates", async () => {
    const { tdb } = await makeDb(["BondA", "BondB"]);
    try {
      // LLM call order: planBeat(BondA)→bond, planBeat(BondB)→scheme
      const llm = new CannedLlmClient([
        mkBond("BondA", "BondB"),
        mkScheme("BondB"),
      ]);

      const { frames } = await runDay(llm, { beats: 1, db: tdb.db });
      expect(frames.length).toBe(1);

      const frame = frames[0];
      const twinA = frame.twins.find((t) => t.name === "BondA")!;
      const twinB = frame.twins.find((t) => t.name === "BondB")!;

      expect(twinA).toBeDefined();
      expect(twinB).toBeDefined();

      // Both should be near event_space (col 6, row 6)
      near(twinA.col, EVENT_SPACE.col);
      near(twinA.row, EVENT_SPACE.row);
      near(twinB.col, EVENT_SPACE.col);
      near(twinB.row, EVENT_SPACE.row);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("scheme beat: actor ends up near network_hub (quiet corner)", async () => {
    const { tdb } = await makeDb(["SchemeA", "SchemeB"]);
    try {
      // Both scheme → both go to network_hub
      const llm = new CannedLlmClient([mkScheme("SchemeA"), mkScheme("SchemeB")]);

      const { frames } = await runDay(llm, { beats: 1, db: tdb.db });
      expect(frames.length).toBe(1);

      const frame = frames[0];
      const twinA = frame.twins.find((t) => t.name === "SchemeA")!;

      expect(twinA).toBeDefined();
      // Should be near network_hub (col 6, row 0)
      near(twinA.col, NETWORK_HUB.col);
      near(twinA.row, NETWORK_HUB.row);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("scene spread: two chat pairs in the same beat land at distinct positions", async () => {
    // 4 twins: Alpha chats Beta; Gamma chats Delta — both scenes go to maker_space
    // but with different spread offsets (scene 0 vs scene 1).
    const tdb = await startTestDb();
    try {
      // @ts-expect-error drizzle exposes raw client via session.client
      const client = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
      await client.unsafe(
        `insert into twins (name, is_npc, energy, energy_updated_at, location_zone)
         values ('Alpha', true, 10, now(), 'plaza'),
                ('Beta',  true, 10, now(), 'plaza'),
                ('Gamma', true, 10, now(), 'plaza'),
                ('Delta', true, 10, now(), 'plaza')`
      );

      // planBeat order (parallel but results applied sequentially): Alpha, Beta, Gamma, Delta
      // converse order: Alpha-Beta, Gamma-Delta
      const llm = new CannedLlmClient([
        mkChat("Alpha", "Beta"),
        mkScheme("Beta"),
        mkChat("Gamma", "Delta"),
        mkScheme("Delta"),
        mkConvo("Alpha", "Beta"),
        mkConvo("Gamma", "Delta"),
      ]);

      const { frames } = await runDay(llm, { beats: 1, db: tdb.db });
      const frame = frames[0];

      const alpha = frame.twins.find((t) => t.name === "Alpha")!;
      const gamma = frame.twins.find((t) => t.name === "Gamma")!;

      expect(alpha).toBeDefined();
      expect(gamma).toBeDefined();

      // Alpha-Beta = scene 0 (spread dc:0, dr:0), Gamma-Delta = scene 1 (spread dc:+1.4, dr:+1.2)
      // They should NOT be at exactly the same position.
      expect(alpha.col === gamma.col && alpha.row === gamma.row).toBe(false);
    } finally {
      await tdb.stop();
    }
  }, 120_000);

  it("chat beat: actor's locationZone is persisted as maker_space", async () => {
    const { tdb, idA } = await makeDb(["ZoneA", "ZoneB"]);
    try {
      const llm = new CannedLlmClient([
        mkChat("ZoneA", "ZoneB"),
        mkScheme("ZoneB"),
        mkConvo("ZoneA", "ZoneB"),
      ]);
      await runDay(llm, { beats: 1, db: tdb.db });

      const repo = new DrizzleTwinRepository(tdb.db);
      const saved = await repo.getById(idA);
      expect(saved?.locationZone).toBe("maker_space");
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("scheme beat: actor's locationZone is persisted as network_hub", async () => {
    const { tdb, idA } = await makeDb(["SchemeSave", "SchemeOther"]);
    try {
      const llm = new CannedLlmClient([mkScheme("SchemeSave"), mkScheme("SchemeOther")]);
      await runDay(llm, { beats: 1, db: tdb.db });

      const repo = new DrizzleTwinRepository(tdb.db);
      const saved = await repo.getById(idA);
      expect(saved?.locationZone).toBe("network_hub");
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  // ─── owner orders: a twin following its owner's order is never dragged away ───

  const holdAt = (zone: string) =>
    JSON.stringify({
      kind: "go", zone, targetName: null, label: "Heading there",
      issuedAt: new Date().toISOString(), holdUntil: new Date(Date.now() + 10 * 60_000).toISOString()
    });

  async function makeOrderedDb() {
    const tdb = await startTestDb();
    // @ts-expect-error drizzle exposes raw client via session.client
    const client = tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
    const [npc] = await client.unsafe(
      `insert into twins (name, is_npc, energy, energy_updated_at, location_zone)
       values ('Npc', true, 10, now(), 'plaza') returning id`
    );
    const [mine] = await client.unsafe(
      `insert into twins (name, is_npc, energy, energy_updated_at, location_zone, owner_order)
       values ('Mine', false, 10, now(), 'event_space', '${holdAt("event_space")}'::jsonb) returning id`
    );
    return { tdb, npcId: npc.id, mineId: mine.id };
  }

  it("order: a villager who chats with an ordered twin comes to it (scene at the twin's zone)", async () => {
    const { tdb, npcId } = await makeOrderedDb();
    try {
      const llm = new CannedLlmClient([mkChat("Npc", "Mine"), mkConvo("Npc", "Mine")]);
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [npcId], db: tdb.db });
      const frame = frames[0];
      const mine = frame.twins.find((t) => t.name === "Mine")!;
      const npc = frame.twins.find((t) => t.name === "Npc")!;
      near(mine.col, EVENT_SPACE.col);
      near(mine.row, EVENT_SPACE.row);
      near(npc.col, EVENT_SPACE.col);
      near(npc.row, EVENT_SPACE.row);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("order: the ordered twin's own beat does not move it away", async () => {
    const { tdb, mineId } = await makeOrderedDb();
    try {
      const llm = new CannedLlmClient([mkScheme("Mine")]);
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [mineId], db: tdb.db });
      const mine = frames[0].twins.find((t) => t.name === "Mine")!;
      near(mine.col, EVENT_SPACE.col);
      near(mine.row, EVENT_SPACE.row);
      const saved = await new DrizzleTwinRepository(tdb.db).getById(mineId);
      expect(saved?.locationZone).toBe("event_space");
      expect(saved?.order?.zone).toBe("event_space"); // the order survives the beat
    } finally {
      await tdb.stop();
    }
  }, 60_000);
});

// ─── v4: the AI picks real actions for villagers ─────────────────────────────
describe("runDay: autonomous actions", () => {
  const mkAct = (actor: string, action: string, target: string | null = null) =>
    JSON.stringify({ verb: "act", target, kind: null, action, narrative: `${actor} does ${action}.` });

  it("a solo action becomes a short automatic action at its venue", async () => {
    const { tdb, idA } = await makeDb(["ActA", "ActB"]);
    try {
      const llm = new CannedLlmClient([mkAct("ActA", "drink_coffee")]);
      const before = Date.now();
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [idA], db: tdb.db });
      const view = frames[0].twins.find((t) => t.name === "ActA")!;
      expect(view.order).toMatchObject({ kind: "act", auto: true, zone: "maker_space", action: { id: "drink_coffee", anim: "drink" } });
      const saved = await new DrizzleTwinRepository(tdb.db).getById(idA);
      expect(saved?.locationZone).toBe("maker_space");
      const hold = Date.parse(saved!.order!.holdUntil) - before;
      expect(hold).toBeGreaterThan(30_000);
      expect(hold).toBeLessThanOrEqual(actHoldMs(findAction("drink_coffee")!) + 5_000);
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("a social action goes to the partner; a friendly hug is accepted", async () => {
    const { tdb, idA } = await makeDb(["HugA", "HugB"]);
    try {
      const llm = new CannedLlmClient([mkAct("HugA", "hug", "HugB")]);
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [idA], db: tdb.db });
      const view = frames[0].twins.find((t) => t.name === "HugA")!;
      expect(view.order).toMatchObject({ kind: "act", targetName: "HugB", action: { id: "hug", refused: false } });
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("touch without enough friendship is refused (cheek kiss from a stranger)", async () => {
    const { tdb, idA } = await makeDb(["KissA", "KissB"]);
    try {
      const llm = new CannedLlmClient([mkAct("KissA", "kiss_cheek", "KissB")]);
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [idA], db: tdb.db });
      const view = frames[0].twins.find((t) => t.name === "KissA")!;
      expect(view.order?.action).toMatchObject({ id: "kiss_cheek", refused: true });
    } finally {
      await tdb.stop();
    }
  }, 60_000);

  it("an unsafe action is never performed", async () => {
    const { tdb, idA } = await makeDb(["BadA", "BadB"]);
    try {
      const llm = new CannedLlmClient([mkAct("BadA", "punch", "BadB")]);
      const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [idA], db: tdb.db });
      expect(frames[0].twins.find((t) => t.name === "BadA")!.order).toBeNull();
    } finally {
      await tdb.stop();
    }
  }, 60_000);
});

// ─── Main Street: energy, busy twins, conversations at calm places ───────────
describe("runDay: places and energy", () => {
  let tdb: TestDb;
  // @ts-expect-error drizzle exposes raw client via session.client
  const sql = () => tdb.db.session.client as { unsafe: (q: string) => Promise<{ id: string }[]> };
  beforeAll(async () => { tdb = await startTestDb(); });
  afterAll(async () => { await tdb.stop(); });
  beforeEach(async () => { await sql().unsafe(`delete from memories; delete from relationships; delete from twins;`); });

  const autoAt = (zone: string, action: string) => JSON.stringify({
    kind: "act", auto: true, zone, targetName: null, label: action,
    issuedAt: new Date().toISOString(), holdUntil: new Date(Date.now() + 5 * 60_000).toISOString(),
    action: { id: action, label: action, emoji: "x", anim: "sit", seconds: 60, place: zone, targetName: null }
  });
  const add = async (name: string, zone: string, order: string | null = null, stamina = 100) =>
    (await sql().unsafe(
      `insert into twins (name, is_npc, energy, location_zone, owner_order, stamina)
       values ('${name}', true, 10, '${zone}', ${order ? `'${order}'::jsonb` : "null"}, ${stamina}) returning id`
    ))[0].id;

  it("a conversation with a twin eating at the café happens there and does not move it", async () => {
    const a = await add("Walker", "plaza");
    const b = await add("Eater", "maker_space", autoAt("maker_space", "eat"));
    const llm = new CannedLlmClient([mkChat("Walker", "Eater"), mkConvo("Walker", "Eater")]);
    const { frames } = await runDay(llm, { beats: 1, onlyTwinIds: [a], db: tdb.db });
    const eater = frames[0].twins.find((t) => t.name === "Eater")!;
    const walker = frames[0].twins.find((t) => t.name === "Walker")!;
    expect({ col: eater.col, row: eater.row }).toEqual(MAKER_SPACE);
    near(walker.col, MAKER_SPACE.col);
    near(walker.row, MAKER_SPACE.row);
    const saved = await new DrizzleTwinRepository(tdb.db).getById(b);
    expect(saved).toMatchObject({ locationZone: "maker_space", order: { zone: "maker_space", action: { id: "eat" } } });
    expect((await new DrizzleTwinRepository(tdb.db).getById(a))!.locationZone).toBe("maker_space");
  });

  it("busy twins (swimming, riding…) are not offered as conversation partners", async () => {
    const a = await add("Talker", "plaza");
    await add("Swimmer", "pool", autoAt("pool", "swim"));
    await add("Idler", "event_space");
    const prompts: string[] = [];
    const llm: LlmClient = {
      generate: async (p: string) => {
        prompts.push(p);
        return mkScheme("Talker");
      }
    };
    await runDay(llm, { beats: 1, onlyTwinIds: [a], db: tdb.db });
    expect(prompts[0]).toContain("Idler");
    expect(prompts[0]).not.toContain("Swimmer");
  });

  it("…and a chat aimed at a busy twin does not drag it out of the pool", async () => {
    const a = await add("Pest", "plaza");
    const b = await add("Diver", "pool", autoAt("pool", "swim"));
    const llm = new CannedLlmClient([mkChat("Pest", "Diver"), mkConvo("Pest", "Diver")]);
    await runDay(llm, { beats: 1, onlyTwinIds: [a], db: tdb.db });
    expect((await new DrizzleTwinRepository(tdb.db).getById(b))!.locationZone).toBe("pool");
    expect((await new DrizzleTwinRepository(tdb.db).getById(a))!.locationZone).not.toBe("pool");
  });

  it("an act beat spends energy and holds for the activity's own length", async () => {
    const a = await add("Swim", "plaza", null, 70);
    const llm = new CannedLlmClient([JSON.stringify({ verb: "act", target: null, kind: null, action: "swim", narrative: "Swim dives in." })]);
    const before = Date.now();
    await runDay(llm, { beats: 1, onlyTwinIds: [a], db: tdb.db });
    const saved = (await new DrizzleTwinRepository(tdb.db).getById(a))!;
    expect(saved).toMatchObject({ stamina: 45, locationZone: "pool", order: { zone: "pool", action: { id: "swim" } } });
    expect(Date.parse(saved.order!.holdUntil) - before).toBeLessThanOrEqual(actHoldMs(findAction("swim")!) + 5_000);
    expect(Date.parse(saved.order!.holdUntil) - before).toBeGreaterThan(actHoldMs(findAction("swim")!) - 5_000);
  });

  it("a place activity with a partner happens at the place, not where the partner is", async () => {
    const a = await add("Fan", "plaza");
    const b = await add("Buddy", "network_hub");
    await sql().unsafe(`insert into relationships (from_twin_id, to_twin_id, score) values ('${b}', '${a}', 20)`);
    const llm = new CannedLlmClient([JSON.stringify({ verb: "act", target: "Buddy", kind: null, action: "watch_movie", narrative: "Fan takes Buddy to the cinema." })]);
    await runDay(llm, { beats: 1, onlyTwinIds: [a], db: tdb.db });
    expect((await new DrizzleTwinRepository(tdb.db).getById(a))!.order).toMatchObject({ zone: "cinema", targetName: "Buddy" });
  });
});
