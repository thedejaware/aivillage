import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "AiVillage",
  description: "A social life-sim where your AI twin lives, builds, and socializes."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
