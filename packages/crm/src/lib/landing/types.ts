import type { LandingPageSection } from "@/components/landing/sections/types";

export type LandingSection = LandingPageSection;

export function defaultLandingSections(): LandingSection[] {
  return [
    {
      type: "hero",
      order: 1,
      content: {
        kicker: "Built with SeldonFrame",
        headline: "Launch your next landing page in minutes",
        subheadline: "Start from a high-converting structure, then customize everything visually.",
        ctaText: "Get Started",
        ctaLink: "#cta",
      },
    },
    {
      type: "benefits",
      order: 2,
      content: {
        headline: "Why this page works",
        benefits: [
          { icon: "⚡", title: "Fast Setup", description: "Start from prebuilt sections and publish quickly." },
          { icon: "🧩", title: "Modular", description: "Mix and match section blocks without writing code." },
          { icon: "📈", title: "Conversion-first", description: "Designed for clear offers and strong call-to-action flow." },
        ],
      },
    },
    {
      type: "cta",
      order: 3,
      content: {
        headline: "Ready to publish?",
        body: "Save your page, preview it, and go live when you are ready.",
        ctaText: "Publish Page",
        ctaLink: "#",
      },
    },
    {
      type: "footer",
      order: 4,
      content: {
        businessName: "Your Business",
        description: "Powered by SeldonFrame",
      },
    },
  ];
}
