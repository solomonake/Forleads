import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
// MapLibre's stylesheet first so the .maplibregl-* overrides in globals.css win.
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forleads — The map that does the homework",
  description:
    "The living-map agentic CRM for real-estate agents. Every address is a lead; grounded AI scouts do the homework, the outreach, and the follow-up — never guessed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No maximumScale/userScalable: pinch zoom must stay available (WCAG 1.4.4).
  themeColor: "#0A0E14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
