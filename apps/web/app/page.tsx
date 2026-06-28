"use client";

import dynamic from "next/dynamic";

const WorldCanvas = dynamic(() => import("../components/WorldCanvas"), { ssr: false });

export default function Page() {
  return (
    <main>
      <div style={{ position: "fixed", top: 18, left: 22, zIndex: 10, color: "#eaf0ff", fontSize: 18, opacity: 0.9 }}>
        AiVillage <span style={{ color: "#5be0c8", fontSize: 11 }}>● LIVE</span>
      </div>
      <WorldCanvas />
    </main>
  );
}
