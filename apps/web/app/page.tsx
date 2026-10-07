"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { ZONE_DISPLAY, orderStatus } from "@aivillage/shared";
import type { WorldState, WorldTwinView, Twin, Memory, Approval, TwinDetail } from "@aivillage/shared";
import { zoneOfTile } from "../lib/village/layout";
import { TopBar } from "../components/hud/TopBar";
import { StatCards } from "../components/hud/StatCards";
import { Inspector } from "../components/hud/Inspector";
import { VillagerList, type VillagerRow } from "../components/hud/VillagerList";
import { OrderTracker } from "../components/hud/OrderTracker";
import { ApprovalCard } from "../components/hud/ApprovalCard";
import { CaptionBar } from "../components/hud/CaptionBar";
import { C, Z, card } from "../components/hud/theme";

const VillageCanvas = dynamic(() => import("../components/village/VillageCanvas"), { ssr: false });
const TwinChat = dynamic(() => import("../components/TwinChat"), { ssr: false });
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const QUIET_FRAME_MS = 1100;
const INSPECTOR_WIDTH = 340;

/** One line on the TV caption bar (reality-show subtitles). */
interface Caption {
  twinId: string;
  name: string;
  color: string;
  text: string;
}

const hexColor = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
/** Reading time scaled to line length: 2s floor, 7s ceiling. */
const captionDur = (text: string) => Math.min(7000, Math.max(2000, 1200 + text.length * 45));
const orderKeyOf = (o: WorldTwinView["order"]) => (o ? `${o.kind}:${o.zone}:${o.targetName ?? ""}` : "");

interface Panel {
  twin: Twin | null;
  memories: Memory[];
  approvals: Approval[];
  relationships?: { name: string; label: string; score: number }[];
  leaderboard?: { twinId: string; name: string; popularity: number }[];
}

function approvalText(a: Approval): React.ReactNode {
  if ("projectType" in a.payload) {
    return (
      <>
        Your twin wants to build a <b>{a.payload.projectType.replace(/_/g, " ")}</b> at {a.payload.zone.replace(/_/g, " ")}.
      </>
    );
  }
  const t = <b>{a.payload.targetName}</b>;
  switch (a.payload.move) {
    case "confront":
      return <>Your twin wants to publicly <b style={{ color: C.red }}>confront</b> {t}. Let it happen?</>;
    case "confess":
      return <>Your twin wants to tell {t} they are its <b style={{ color: C.green }}>best friend</b>. Allow it?</>;
    case "party":
      return <>Your twin wants to throw a <b style={{ color: C.amber }}>party</b> in {t}&apos;s honour. Fund the fun?</>;
    case "reconcile":
      return <>Your twin wants to <b style={{ color: C.green }}>make peace</b> with {t}. Bury the hatchet?</>;
    default:
      return <>Your twin is planning something involving {t}.</>;
  }
}

export default function Page() {
  const [state, setState] = useState<WorldState | null>(null);
  const [live, setLive] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [myTwinId, setMyTwinId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState({ name: "", personality: "", goal: "" });
  const [creating, setCreating] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [chatEvent, setChatEvent] = useState<{ id: string; text: string } | null>(null);
  // ---- selection + inspector ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TwinDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
  const autoSelected = useRef(false);
  // ---- my twin's order progress (for the tracker) ----
  const [arrivedKey, setArrivedKey] = useState("");
  const arrivedKeyRef = useRef("");
  const [talkingKey, setTalkingKey] = useState("");
  const [issued, setIssued] = useState<{ key: string; at: number }>({ key: "", at: 0 });

  const playGen = useRef(0);
  const stateRef = useRef<WorldState | null>(null);
  stateRef.current = state;
  /**
   * Owner orders are LIVE state: episode playback replays older snapshots, so
   * orders always come from the newest world we received, never from a replayed frame.
   */
  const liveOrders = useRef<Record<string, WorldTwinView["order"]>>({});
  const ordersAsOf = useRef("");
  const absorbOrders = (w: WorldState | undefined) => {
    if (!w) return;
    if (w.asOf) {
      if (w.asOf < ordersAsOf.current) return; // read before newer news — stale
      ordersAsOf.current = w.asOf;
    }
    for (const t of w.twins) liveOrders.current[t.id] = t.order;
  };
  const withLiveOrders = (w: WorldState): WorldState => ({
    ...w,
    twins: w.twins.map((t) => (t.id in liveOrders.current ? { ...t, order: liveOrders.current[t.id] } : t))
  });

  const refreshPanel = useCallback(async () => {
    const uid = localStorage.getItem("aiv.userId");
    if (!uid) return;
    try {
      const r = await fetch(`${API}/api/me?userId=${encodeURIComponent(uid)}`);
      setPanel((await r.json()) as Panel);
    } catch {
      /* panel refresh is best-effort */
    }
  }, []);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setDetailLoading(true);
    try {
      const viewer = localStorage.getItem("aiv.userId");
      const r = await fetch(`${API}/api/twins/${encodeURIComponent(id)}${viewer ? `?viewer=${encodeURIComponent(viewer)}` : ""}`);
      if (r.ok) setDetail((await r.json()) as TwinDetail);
    } catch {
      /* inspector refresh is best-effort */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    setUserId(localStorage.getItem("aiv.userId"));
    setMyTwinId(localStorage.getItem("aiv.twinId"));
  }, []);

  useEffect(() => {
    if (userId) refreshPanel();
  }, [userId, refreshPanel]);

  // The return moment: open on your own twin's card (its recent life).
  useEffect(() => {
    if (myTwinId && !autoSelected.current) {
      autoSelected.current = true;
      setSelectedId(myTwinId);
    }
  }, [myTwinId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetail((d) => (d?.id === selectedId ? d : null));
    void loadDetail(selectedId);
    const h = setInterval(() => void loadDetail(selectedId, true), 15_000);
    return () => clearInterval(h);
  }, [selectedId, loadDetail]);

  /**
   * Episode playback: frames advance the world; every NEW spoken line plays
   * one at a time on the TV caption bar while its speaker shows a 💬 marker.
   */
  const playEpisode = useCallback(
    async (frames: WorldState[]) => {
      const gen = ++playGen.current;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const prevSay: Record<string, string | null> = {};
      for (const t of stateRef.current?.twins ?? []) prevSay[t.id] = t.say;

      for (const f of frames) {
        if (playGen.current !== gen) return;
        setState(withLiveOrders(f));
        const fresh = f.twins.filter((t) => t.say && t.say !== prevSay[t.id]);
        for (const t of f.twins) prevSay[t.id] = t.say;
        if (fresh.length === 0) {
          await sleep(QUIET_FRAME_MS);
          continue;
        }
        for (const t of fresh) {
          if (playGen.current !== gen) return;
          setCaption({ twinId: t.id, name: t.name, color: hexColor(t.colorHex), text: t.say! });
          setSpeakingId(t.id);
          await sleep(captionDur(t.say!));
        }
      }
      if (playGen.current !== gen) return;
      setCaption(null);
      setSpeakingId(null);
      refreshPanel();
    },
    [refreshPanel]
  );

  useEffect(() => {
    const socket = io(API, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("world", (w: WorldState) => {
      absorbOrders(w);
      setState(withLiveOrders(w));
    });
    socket.on("day", ({ frames }: { frames: WorldState[] }) => {
      absorbOrders(frames[frames.length - 1]); // newest snapshot at the time it was sent
      void playEpisode(frames);
    });
    return () => {
      playGen.current += 1; // cancel any in-flight playback
      socket.disconnect();
    };
  }, [playEpisode]);

  // ---- my twin + its order ----
  const myView = state?.twins.find((t) => t.id === myTwinId) ?? null;
  const myOrder = myView?.order ?? null;
  const myOrderKey = orderKeyOf(myOrder);
  const myOrderRef = useRef(myOrder);
  myOrderRef.current = myOrder;

  useEffect(() => {
    if (myOrderKey && issued.key !== myOrderKey) setIssued({ key: myOrderKey, at: Date.now() });
    if (!myOrderKey) {
      // order over: the same order given again later is a new trip
      arrivedKeyRef.current = "";
      setArrivedKey("");
      setTalkingKey("");
      if (issued.key) setIssued({ key: "", at: 0 });
    }
  }, [myOrderKey, issued.key]);

  // a caption line from my twin after it found its target = they're talking
  useEffect(() => {
    if (myOrder?.kind === "talk_to" && arrivedKey === myOrderKey && speakingId === myTwinId) setTalkingKey(myOrderKey);
  }, [speakingId, myOrder, arrivedKey, myOrderKey, myTwinId]);

  const onOrderArrive = useCallback(
    (twinId: string, status: string) => {
      if (twinId !== myTwinId) return;
      const key = orderKeyOf(myOrderRef.current);
      if (key === arrivedKeyRef.current) return; // a remounted scene re-reports the same arrival
      arrivedKeyRef.current = key;
      setChatEvent({ id: `arrive-${Date.now()}`, text: `✅ ${status}` });
      setArrivedKey(key);
      // "talk to X": the conversation starts the moment the twin gets there
      if (myOrderRef.current?.kind === "talk_to" && userId) {
        void fetch(`${API}/api/order/arrived`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ userId })
        }).catch(() => { /* the server's fallback timer starts the talk */ });
      }
    },
    [myTwinId, userId]
  );

  const select = useCallback((id: string | null, focus = false) => {
    setSelectedId(id);
    if (id && focus) setFocusRequest((f) => ({ id, n: (f?.n ?? 0) + 1 }));
  }, []);

  const createTwin = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/api/twins`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = (await r.json()) as { userId?: string; twinId?: string; error?: string };
      if (data.userId) {
        localStorage.setItem("aiv.userId", data.userId);
        localStorage.setItem("aiv.twinId", data.twinId ?? "");
        setUserId(data.userId);
        setMyTwinId(data.twinId ?? null);
      }
    } finally {
      setCreating(false);
    }
  };

  const resolveApproval = async (id: string, approve: boolean) => {
    await fetch(`${API}/api/approvals/${id}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve })
    });
    await refreshPanel();
  };

  // ---- HUD data ----
  const popularity = useMemo(() => new Map((panel?.leaderboard ?? []).map((r) => [r.twinId, r.popularity])), [panel]);

  const villagers: VillagerRow[] = useMemo(
    () =>
      (state?.twins ?? [])
        .map((t) => {
          const isMine = t.id === myTwinId;
          const arrived = isMine && arrivedKey === orderKeyOf(t.order);
          const speaking = t.id === speakingId;
          return {
            id: t.id,
            name: t.name,
            colorHex: t.colorHex,
            zoneLabel: ZONE_DISPLAY[zoneOfTile(t.col, t.row)] ?? "",
            status: speaking ? "💬 Talking" : t.order ? orderStatus(t.order, arrived) : "Roaming",
            tone: speaking ? ("blue" as const) : t.order ? ("amber" as const) : ("grey" as const),
            isMine,
            popularity: popularity.get(t.id)
          };
        })
        .sort((a, b) => Number(b.isMine) - Number(a.isMine) || (b.popularity ?? 0) - (a.popularity ?? 0)),
    [state, myTwinId, arrivedKey, speakingId, popularity]
  );

  const myRank = panel?.leaderboard ? panel.leaderboard.findIndex((r) => r.twinId === myTwinId) + 1 : 0;
  const friends = (panel?.relationships ?? []).filter((r) => r.score > 0).length;
  const rivals = (panel?.relationships ?? []).filter((r) => r.score < 0).length;
  const pending = panel?.approvals.length ?? 0;
  const stats = [
    { key: "villagers", icon: "🏘️", label: "Villagers", value: String(state?.twins.length ?? "–"), sub: "living on the island" },
    ...(userId
      ? [
          {
            key: "rank", icon: "🏆", label: "Your rank", value: myRank > 0 ? `#${myRank}` : "–",
            sub: `popularity ${popularity.get(myTwinId ?? "") ?? 0}`
          },
          { key: "friends", icon: "💛", label: "Friends", value: String(friends), sub: `${rivals} rival${rivals === 1 ? "" : "s"}` },
          {
            key: "needs", icon: "🔔", label: "Needs you", value: String(pending), sub: "decisions waiting",
            ...(pending > 0 ? { delta: { text: "now", tone: "red" as const } } : {})
          }
        ]
      : [])
  ];

  const inspectorOpen = selectedId !== null;

  return (
    <main>
      {state ? (
        <VillageCanvas
          state={state}
          myTwinId={myTwinId}
          speakingTwinId={speakingId}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          onOrderArrive={onOrderArrive}
          focusRequest={focusRequest}
          controlsRight={inspectorOpen ? 16 + INSPECTOR_WIDTH + 12 : 16}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>
          Connecting to the village…
        </div>
      )}

      <TopBar
        live={live}
        items={(state?.twins ?? []).map((t) => ({ id: t.id, name: t.name, colorHex: t.colorHex, sub: ZONE_DISPLAY[zoneOfTile(t.col, t.row)] ?? "" }))}
        onPick={(id) => select(id, true)}
        me={myView ? { name: myView.name, colorHex: myView.colorHex } : null}
      />

      <StatCards stats={stats} style={{ top: 80 }} />

      {/* ---- needs your decision (owner-gated big moves) ---- */}
      {panel && panel.approvals.length > 0 && (
        <div
          style={{
            position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)", zIndex: Z.card + 2,
            width: "min(420px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 8
          }}
        >
          {panel.approvals.map((a) => (
            <ApprovalCard key={a.id} text={approvalText(a)} onApprove={() => resolveApproval(a.id, true)} onDecline={() => resolveApproval(a.id, false)} />
          ))}
        </div>
      )}

      {inspectorOpen && (
        <Inspector
          detail={
            // the server can't know when my twin arrived — the live world does
            detail && detail.id === myTwinId
              ? { ...detail, orderStatus: myOrder ? orderStatus(myOrder, arrivedKey !== "" && arrivedKey === myOrderKey) : null }
              : detail
          }
          loading={detailLoading && !detail}
          isMine={detail?.isMine ?? selectedId === myTwinId}
          onClose={() => select(null)}
          onFocus={() => selectedId && select(selectedId, true)}
          style={{ top: 80, width: INSPECTOR_WIDTH, maxHeight: "calc(100vh - 96px - 340px)", minHeight: 0 }}
        />
      )}

      {/* ---- TALK: chat with your twin (v3 core loop) ---- */}
      {userId && <TwinChat userId={userId} twinName={panel?.twin?.name ?? null} order={myOrder} event={chatEvent} />}

      {/* ---- bottom centre: reality-show captions + my twin's order progress ---- */}
      <div
        style={{
          position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: Z.card,
          width: "min(540px, calc(100vw - 32px))", display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none"
        }}
      >
        <CaptionBar caption={caption} />
        {myView && (
          <div style={{ pointerEvents: "auto" }}>
            <OrderTracker
              twinName={myView.name}
              order={myOrder}
              arrived={arrivedKey !== "" && arrivedKey === myOrderKey}
              talking={talkingKey !== "" && talkingKey === myOrderKey}
              issuedAt={issued.key === myOrderKey ? issued.at : null}
            />
          </div>
        )}
      </div>

      <VillagerList villagers={villagers} selectedId={selectedId} onSelect={(id) => select(id, true)} />

      {/* ---- onboarding ---- */}
      {!userId && (
        <div
          style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: Z.overlay,
            width: "min(380px, calc(100vw - 32px))", padding: 22, ...card
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Create your twin</div>
          <div style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5, marginBottom: 16 }}>
            It will live among the others — making friends, rivals and drama. Talk to it, send it places, and it asks you before its big moves.
          </div>
          <input placeholder="Name (e.g. Memo)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
          <input
            placeholder="Personality (e.g. charming gossip)"
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
            style={inputStyle}
          />
          <input
            placeholder="Goal (e.g. become the most loved in the village)"
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
            style={inputStyle}
          />
          <button
            onClick={createTwin}
            disabled={creating || !form.name.trim()}
            style={{
              width: "100%", height: 42, marginTop: 4, border: "none", borderRadius: 10, background: C.blue, color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: creating || !form.name.trim() ? "default" : "pointer",
              opacity: creating || !form.name.trim() ? 0.55 : 1
            }}
          >
            {creating ? "Creating…" : "✨ Enter the village"}
          </button>
        </div>
      )}
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", height: 40, marginBottom: 10, padding: "0 12px",
  background: "#f6f8fc", border: `1px solid ${C.line}`, borderRadius: 10,
  color: C.text, fontSize: 13.5, outline: "none"
};
