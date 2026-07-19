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
      // "growth" key retained for backward compat with existing callers;
      // copy now points at Agency Starter ($99/mo) — the live ladder's
      // actual client-portal + white-label tier (plans.ts).
      growth: {
        price: "$99/mo (Agency Starter)",
        unlocks: [
          `Client portal — your client logs into a private CRM at ${clientPortalUrl} (pipeline + bookings + messages)`,
          "10 client sub-accounts",
          "Full white-label — your agency's brand instead of SeldonFrame",
          "Custom domain (e.g. crm.youragency.com)",
          "Chatbot publish to live status (with eval gate)",
          "Email + SMS automations",
        ],
      },
      // "scale" key retained for backward compat; copy now points at
      // Agency Scale ($299/mo) — unlimited sub-accounts + API/MCP.
      scale: {
        price: "$299/mo (Agency Scale)",
        unlocks: [
          "Unlimited client sub-accounts",
          "API + MCP access",
          "Rent your agents via the marketplace rail",
          "Reseller pricing — charge your clients whatever you want",
          "Dedicated onboarding",
        ],
      },
    },
    upsell_hint:
      currentTier === "free"
        ? `Your free workspace includes CRM + booking + intake + chatbot. Upgrade to Agency Starter ($99/mo) to unlock the client portal — your HVAC/plumbing/dental business client logs into ${clientPortalUrl} for their pipeline, bookings, and messages, plus full white-label. Upgrade to Agency Scale ($299/mo) for unlimited client sub-accounts + API/MCP.`
        : currentTier === "growth"
          ? "You're on Agency Starter. Upgrade to Agency Scale ($299/mo) for unlimited client sub-accounts + API/MCP."
          : "You're on Agency Scale — all features unlocked.",
  };
}
