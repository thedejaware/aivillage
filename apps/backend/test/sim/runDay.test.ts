/**
 * Integration tests for runDay: venue-routing behaviour.
 *
 * Twins physically move to the venue that matches their action:
 *   chat    → maker_space  (THE CAFE,  col 0, row 5)
 *   bond    → event_space  (THE LAWN,  col 6, row 6)
 *   bigmove → plaza        (THE STAGE, col 3, row 3)
 *   scheme  → network_hub  (QUIET CORNER, col 6, row 0)
 */
import { describe, it, expect } from "vitest";
import { runDay } from "../../src/sim/runDay.js";
import { CannedLlmClient } from "../../src/sim/cannedLlm.js";
import { startTestDb, type TestDb } from "../db/helpers.js";
import { DrizzleTwinRepository } from "../../src/db/twinRepository.js";

// ─── zone centres (from DEFAULT_ZONES in world.ts) ───────────────────────────
const PLAZA       = { col: 3, row: 3 };
const MAKER_SPACE = { col: 0, row: 5 };
const NETWORK_HUB = { col: 6, row: 0 };
const EVENT_SPACE = { col: 6, row: 6 };

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

      // Both should be near maker_space (col 0, row 5)
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
});
