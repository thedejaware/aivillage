import "./globals.css";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";

const ui = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });

export const metadata = {
  title: "AiVillage",
  description: "A social life-sim where your AI twin lives, builds, and socializes."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={ui.variable}>
      <body>{children}</body>
    </html>
  );
}
