// Marketing landing page (server wrapper).
// Workstream 2 — replaces the prior LandingHero/LandingNav composition
// with the Gemini-authored landing client (`./landing-client.tsx`).
// Preserves the existing auth redirect: signed-in users go straight to
// the dashboard, unauthenticated visitors see the marketing surface.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MarketingFaq } from "@/components/marketing/faq";

import SeldonFrameLandingPage from "./landing-client";

export const metadata: Metadata = {
  title: "SeldonFrame — Open-source alternative to GoHighLevel",
  description:
    "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, and AI chatbot — already connected, no Zapier required. Free tier, AGPL-3.0, MCP-native via Claude Code.",
  openGraph: {
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected. Open source. Free tier · Growth $29/mo · Scale $99/mo.",
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <>
      <SeldonFrameLandingPage />
      <MarketingFaq />
    </>
  );
}
