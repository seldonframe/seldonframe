// v1.51 — Tier upsell payload shared across workspace creation routes.
//
// Every workspace-create response surfaces:
//   - client_portal_url: the per-workspace customer portal URL (already
//     built; gated behind Growth/Scale tier at the auth layer)
//   - tier_features: explicit upsell narrative so Claude Code's
//     delivery output tells the operator what they have NOW (free) +
//     what unlocks on Growth + Scale.
//
// This solves the "operator doesn't know about the client portal"
// problem from the 2026-05-14 dallasheatingac.com test: the feature
// exists in /settings/client-portal + /customer/<slug>/login but
// nobody knew because Claude Code's response only showed the
// landing/booking/intake URLs.

const SELDONFRAME_APP_BASE =
  process.env.SELDONFRAME_APP_BASE?.trim() || "https://app.seldonframe.com";

export type TierUpsell = {
  client_portal_url: string;
  client_portal_status: "locked" | "available";
  tier_features: {
    current_tier: "free" | "growth" | "scale";
    free: string[];
    growth: {
      price: string;
      unlocks: string[];
    };
    scale: {
      price: string;
      unlocks: string[];
    };
  };
  upsell_hint: string;
};

export function buildTierUpsell(args: {
  slug: string;
  /** v1.51 — currently always "free" for newly-created workspaces. Once
   *  billing flows are wired into the create paths, this can reflect the
   *  workspace's actual tier so the upsell only shows the NEXT tier up. */
  currentTier?: "free" | "growth" | "scale";
}): TierUpsell {
  const clientPortalUrl = `${SELDONFRAME_APP_BASE}/customer/${args.slug}/login`;
  const currentTier = args.currentTier ?? "free";

  return {
    client_portal_url: clientPortalUrl,
    client_portal_status: currentTier === "free" ? "locked" : "available",
    tier_features: {
      current_tier: currentTier,
      free: [
        "CRM (HVAC/plumbing/dental/etc-tuned pipeline)",
        "Booking page with availability + Google Calendar sync",
        "Intake form with vertical-specific fields",
        "AI chatbot scaffold (draft) — paste embed snippet onto client's website",
        "1 client workspace",
      ],
      growth: {
        price: "$29/mo",
        unlocks: [
          `Client portal — your client logs into a private CRM at ${clientPortalUrl} (pipeline + bookings + messages)`,
          "Up to 3 client workspaces",
          "Custom domain (e.g. crm.youragency.com)",
          "Chatbot publish to live status (with eval gate)",
          "Email + SMS automations",
        ],
      },
      scale: {
        price: "$99/mo",
        unlocks: [
          "Unlimited client workspaces",
          "Full white-label chrome — your agency's brand instead of SeldonFrame",
          "Hide 'Powered by SeldonFrame' badge",
          "Reseller pricing — charge your clients whatever you want",
          "Partner-agency multi-client dashboard",
        ],
      },
    },
    upsell_hint:
      currentTier === "free"
        ? `Your free workspace includes CRM + booking + intake + chatbot. Upgrade to Growth ($29/mo) to unlock the client portal — your HVAC/plumbing/dental business client logs into ${clientPortalUrl} for their pipeline, bookings, and messages. Upgrade to Scale ($99/mo) for unlimited workspaces + full white-label.`
        : currentTier === "growth"
          ? "You're on Growth. Upgrade to Scale ($99/mo) for unlimited workspaces + full white-label."
          : "You're on Scale — all features unlocked.",
  };
}
