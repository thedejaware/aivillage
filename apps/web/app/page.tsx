"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { WorldState } from "@aivillage/shared";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });

export default function Page() {
  const [state, setState] = useState<WorldState | null>(null);

  useEffect(() => {
    fetch("/world.json")
      .then((r) => r.json() as Promise<WorldState>)
      .then(setState)
      .catch(() => setState(null));
  }, []);

  return (
    <main>
      <div style={{ position: "fixed", top: 18, left: 22, zIndex: 10, color: "#eaf0ff", fontSize: 18, opacity: 0.9 }}>
        AiVillage <span style={{ color: "#5be0c8", fontSize: 11 }}>● LIVE</span>
        <span style={{ color: "#7f93c4", fontSize: 11, marginLeft: 8 }}>after a simulated day</span>
      </div>
      {state ? (
        <WorldCanvas state={state} />
      ) : (
        <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#7f93c4", fontFamily: "monospace" }}>
          Loading village…
        </div>
      )}
    </main>
  );
}
