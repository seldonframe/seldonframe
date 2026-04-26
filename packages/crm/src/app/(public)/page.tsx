// Marketing landing page (server wrapper).
// Workstream 2 — replaces the prior LandingHero/LandingNav composition
// with the Gemini-authored landing client (`./landing-client.tsx`).
// Preserves the existing auth redirect: signed-in users go straight to
// the dashboard, unauthenticated visitors see the marketing surface.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

import SeldonFrameLandingPage from "./landing-client";

export const metadata: Metadata = {
  title: "SeldonFrame — AI-native Business OS you build with natural language",
  description:
    "Composable primitives to create customized business operating systems — branded portals, smart agents, automated workflows — for yourself or your clients.",
  openGraph: {
    title: "SeldonFrame — AI-native Business OS",
    description:
      "Build a complete AI-native Business OS with natural language. Open source. MCP-native. $9/mo per workspace.",
    type: "website",
    url: "https://app.seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — AI-native Business OS",
    description:
      "Build a complete AI-native Business OS with natural language.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return <SeldonFrameLandingPage />;
}
