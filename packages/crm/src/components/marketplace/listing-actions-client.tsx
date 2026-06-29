"use client";

// Listing detail interactive island — the sticky purchase sidebar (Install +
// Rent-via-MCP), the "see it work" replay, and the full-screen install
// ceremony. The ONLY "use client" surface on the listing page; everything else
// (header, what-it-does, surfaces/tools, reviews, more-from-builder, SEO block,
// JSON-LD) is server-rendered.
//
// Install calls installAgentListingAction({ slug }); on success it plays the
// "Your [Agent] is moving in…" ceremony (matching screens/01-ceremony.png) and
// then routes to the buyer's Studio at /studio/agents/[templateId]. Paid
// listings redirect to Stripe checkout instead. The Rent-via-MCP panel reveals
// the endpoint + a copyable client-config snippet (the endpoint itself is
// Phase 2 — the UI + copy button ship now).
//
// NO marketplace fee is shown anywhere on this buyer surface.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import { MarketplaceIcon } from "./marketplace-icons";
import { TypingDots } from "./marketplace-styles";
import { MKT, priceColor, type StorefrontAgent } from "./marketplace-data";
import { installAgentListingAction } from "@/lib/marketplace/actions";
import { generateAgentRentalKeyAction } from "@/lib/marketplace/rental";
import { shouldShowFinishCheckout } from "@/lib/marketplace/buy-box-auth";

type Phase = "idle" | "installing" | "done";

export function ListingActionsClient({
  agent,
  mcpEndpoint,
  snippet,
  isAuthenticated = false,
  signInUrl = "/login",
  justPurchased = false,
  installIntent = false,
}: {
  agent: StorefrontAgent;
  mcpEndpoint: string;
  snippet: string;
  // PUBLIC page: false for anonymous visitors and for anyone on www. (the
  // host-only session cookie lives only on the app origin). When false, Install
  // / Rent redirect to signInUrl (the app-origin sign-in) instead of calling the
  // server action — which would 500 with a masked error in production.
  isAuthenticated?: boolean;
  signInUrl?: string;
  // Stripe Checkout returned the buyer here with ?purchased=true. Show the clean
  // "You're subscribed / installed ✅" confirmation instead of re-showing the
  // "Install into my workspace" button (the "redirected nowhere" confusion).
  justPurchased?: boolean;
  // Post-signup buy-intent return (?install=1). When the buyer is back AND
  // authenticated, show a prominent "Finish checkout →" nudge so they complete
  // the purchase they started before signing up. NEVER auto-fires the charge —
  // there is intentionally no mount effect that calls the action; the buyer
  // clicks the button. Ignored once ?purchased=true takes over.
  installIntent?: boolean;
}): ReactElement {
  const router = useRouter();
  // Send a logged-out buyer to the app-origin sign-in (with a callbackUrl back to
  // this listing). Same path the action's `auth_required` response triggers.
  const goSignIn = useCallback(() => {
    window.location.href = signInUrl;
  }, [signInUrl]);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [installedTemplateId, setInstalledTemplateId] = useState<string | null>(null);
  // Phase 2 — the freshly-minted rental key + the real config snippet. Until the
  // renter clicks "Generate rental key" the panel shows the placeholder snippet
  // (with `Bearer sk_live_…`); after, the snippet carries the REAL key.
  const [rentalKey, setRentalKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const keyCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ceremonyTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (ceremonyTimer.current) clearInterval(ceremonyTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (keyCopyTimer.current) clearTimeout(keyCopyTimer.current);
    };
  }, []);

  // Build the config snippet with the REAL key spliced in (replacing the
  // `sk_live_…` placeholder) once a key has been generated. Before that, the
  // server-provided placeholder snippet is shown as-is.
  const liveSnippet =
    rentalKey != null
      ? snippet.replace(/Bearer [^"']*/i, `Bearer ${rentalKey}`)
      : snippet;

  const short = agent.category === "Receptionist" ? "Receptionist" : agent.name;

  const playCeremony = useCallback(() => {
    if (ceremonyTimer.current) clearInterval(ceremonyTimer.current);
    setPhase("installing");
    setStep(0);
    ceremonyTimer.current = setInterval(() => {
      setStep((s) => {
        if (s >= CEREMONY_STEPS.length) {
          if (ceremonyTimer.current) clearInterval(ceremonyTimer.current);
          setPhase("done");
          return s;
        }
        return s + 1;
      });
    }, 720);
  }, []);

  const onInstall = useCallback(async () => {
    setError(null);
    // Demo/seed listings have no DB row to install — play the ceremony as a
    // delightful preview, then land the buyer in their Studio agents list. (No
    // server action runs, so there's no auth/500 risk here.)
    if (agent.isSeed) {
      playCeremony();
      return;
    }
    // Logged out (or on www., where the session cookie isn't present) → send the
    // buyer to the app-origin sign-in instead of calling the action, which would
    // 500 with a masked "An error occurred… digest…" string in production.
    if (!isAuthenticated) {
      goSignIn();
      return;
    }
    try {
      const result = await installAgentListingAction({ slug: agent.slug });
      // Defense in depth: a stale/racey auth state can still come back
      // unauthorized from the server — degrade to the same clean sign-in
      // redirect rather than surfacing an error.
      if (!result.ok && "reason" in result && result.reason === "auth_required") {
        goSignIn();
        return;
      }
      if (result.ok && "checkoutUrl" in result && result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      if (result.ok && "templateId" in result && result.templateId) {
        setInstalledTemplateId(result.templateId);
      }
      playCeremony();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Install failed. Please try again.");
    }
  }, [agent.isSeed, agent.slug, isAuthenticated, goSignIn, playCeremony]);

  const finishInstall = useCallback(() => {
    if (installedTemplateId) {
      router.push(`/studio/agents/${installedTemplateId}`);
    } else {
      router.push("/studio/agents");
    }
  }, [installedTemplateId, router]);

  const copySnippet = useCallback(() => {
    try {
      void navigator.clipboard.writeText(liveSnippet);
    } catch {
      /* clipboard unavailable — no-op */
    }
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  }, [liveSnippet]);

  const onGenerateKey = useCallback(async () => {
    setError(null);
    // Seed/demo listings have no DB row to mint a real key against — show a
    // representative placeholder so the panel still demonstrates the flow. (No
    // server action runs, so there's no auth/500 risk here.)
    if (agent.isSeed) {
      setRentalKey("rk_demo_preview_key_generate_on_a_live_listing");
      return;
    }
    // Logged out (or on www.) → send the renter to the app-origin sign-in rather
    // than calling the action (which would surface a masked error in prod).
    if (!isAuthenticated) {
      goSignIn();
      return;
    }
    setGenerating(true);
    try {
      const result = await generateAgentRentalKeyAction({ slug: agent.slug });
      if (result.ok) {
        setRentalKey(result.key);
      } else if ("reason" in result && result.reason === "auth_required") {
        // Defense in depth: a stale/racey auth state degrades to the clean
        // sign-in redirect, never a surfaced error.
        goSignIn();
      } else {
        setError(result.error || "Could not generate a rental key.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate a rental key.");
    } finally {
      setGenerating(false);
    }
  }, [agent.isSeed, agent.slug, isAuthenticated, goSignIn]);

  const copyKey = useCallback(() => {
    if (!rentalKey) return;
    try {
      void navigator.clipboard.writeText(rentalKey);
    } catch {
      /* clipboard unavailable — no-op */
    }
    setKeyCopied(true);
    if (keyCopyTimer.current) clearTimeout(keyCopyTimer.current);
    keyCopyTimer.current = setTimeout(() => setKeyCopied(false), 1800);
  }, [rentalKey]);

  const isFree = agent.priceCents <= 0;
  // A non-one-time model carries its own label ("$29/mo", "$2 per call", "$10
  // per booking"). Split it into the big amount + the small unit suffix so the
  // sidebar shows the true model — not a hardcoded "per month" for every paid
  // agent. Falls back to the one-time "$N" + "per month" when there's no
  // override (onetime/free), preserving the original design.
  const override = agent.priceLabelOverride?.trim();
  const split = override ? splitPriceLabel(override) : null;
  const bigAmount = isFree ? "Free" : split ? split.amount : `$${Math.round(agent.priceCents / 100)}`;
  const unitSuffix = isFree ? "to install & run" : split ? split.suffix : "per month";
  // Recurring (monthly) keeps the "billed monthly" reassurance; one-time / per-
  // usage / per-outcome get a neutral line that doesn't over-promise a cadence.
  const isMonthlyOverride = override ? /\/mo\b/.test(override) : false;
  const paidBlurb = isMonthlyOverride
    ? "Billed monthly. Cancel anytime — the agent keeps everything it learned."
    : "Cancel anytime — the agent keeps everything it learned, running on your own workspace and keys.";

  // A paid recurring/metered listing → "subscribed"; free/one-time → "installed".
  const isRecurring = override ? /\/mo\b|\bper\b/i.test(override) : false;

  // POST-PURCHASE (?purchased=true): Stripe Checkout returned the buyer here.
  // Show a clean confirmation in the buy box instead of re-showing "Install"
  // (the "redirected nowhere" confusion). The Rent-via-MCP panel still works for
  // anyone who also wants to call the agent over MCP, so we keep it available.
  if (justPurchased) {
    return (
      <PurchasedConfirmation
        agent={agent}
        isRecurring={isRecurring}
        onOpenStudio={() => router.push("/studio/agents")}
      />
    );
  }

  // FINISH CHECKOUT (?install=1 + authenticated, still idle): the buyer started
  // a purchase, signed up, and was routed back here. Surface a prominent nudge +
  // amplify the primary CTA so they complete it. We DO NOT auto-fire the charge
  // (no mount effect calls onInstall) — the buyer clicks the button, which keeps
  // the single-click-to-pay contract and removes any double-charge risk. Seed
  // listings have no real purchase, so they never show this (it would mislead).
  // The gating is the pure `shouldShowFinishCheckout`; we AND in `phase==="idle"`
  // so the banner disappears the moment the ceremony starts.
  const showFinishCheckout =
    shouldShowFinishCheckout({ installIntent, isAuthenticated, isSeed: agent.isSeed, justPurchased }) &&
    phase === "idle";
  const ctaLabel = showFinishCheckout
    ? isFree
      ? "Finish installing →"
      : "Finish checkout →"
    : "Install into my workspace";

  return (
    <>
      <div
        style={{
          background: "#fff",
          border: showFinishCheckout ? "1px solid rgba(0,137,123,0.45)" : "1px solid rgba(34,29,23,0.10)",
          borderRadius: 20,
          padding: 22,
          boxShadow: showFinishCheckout
            ? "0 1px 2px rgba(34,29,23,0.05),0 20px 44px rgba(0,137,123,0.18)"
            : "0 1px 2px rgba(34,29,23,0.05),0 20px 44px rgba(34,29,23,0.10)",
        }}
      >
        {showFinishCheckout ? (
          <div
            className="sf-rise"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              background: "rgba(0,137,123,0.08)",
              border: "1px solid rgba(0,137,123,0.22)",
              borderRadius: 12,
              padding: "11px 13px",
              marginBottom: 16,
            }}
          >
            <span style={{ color: MKT.green, display: "flex", flex: "none", marginTop: 1 }}>
              <MarketplaceIcon name="package" size={17} />
            </span>
            <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "rgba(34,29,23,0.74)" }}>
              You're signed in — <strong style={{ color: MKT.ink, fontWeight: 650 }}>finish setting up {agent.name}</strong>{" "}
              to move it into your workspace.
            </span>
          </div>
        ) : null}

        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: priceColor(agent.priceCents), fontFamily: MKT.fontMono }}>
            {bigAmount}
          </span>
          <span style={{ fontSize: 14, color: "rgba(34,29,23,0.5)" }}>{unitSuffix}</span>
        </div>
        <p style={{ margin: "6px 0 18px", fontSize: 13.5, color: "rgba(34,29,23,0.58)", lineHeight: 1.45 }}>
          {isFree
            ? "No card required. Install it and it starts working in your Studio."
            : paidBlurb}
        </p>

        <button
          type="button"
          className="sf-btn"
          onClick={onInstall}
          style={{
            width: "100%",
            border: "none",
            background: MKT.green,
            color: "#fff",
            fontFamily: "inherit",
            fontWeight: 700,
            fontSize: 16,
            padding: 15,
            borderRadius: 13,
            cursor: "pointer",
            boxShadow: "0 8px 20px rgba(0,137,123,0.28)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
          }}
        >
          <MarketplaceIcon name="package" size={19} />
          {ctaLabel}
        </button>

        <button
          type="button"
          className="sf-btn"
          onClick={() => setMcpOpen((v) => !v)}
          style={{
            width: "100%",
            marginTop: 10,
            border: "1px solid rgba(34,29,23,0.16)",
            background: "#fff",
            color: MKT.ink,
            fontFamily: "inherit",
            fontWeight: 650,
            fontSize: 15,
            padding: 13,
            borderRadius: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
          }}
        >
          <span style={{ color: "rgba(34,29,23,0.6)", display: "flex" }}>
            <MarketplaceIcon name="terminal" size={17} />
          </span>
          Rent via MCP
        </button>

        {error ? (
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#B5651D", lineHeight: 1.45 }}>{error}</p>
        ) : null}

        {mcpOpen ? (
          <div className="sf-rise" style={{ marginTop: 14, borderTop: "1px solid rgba(34,29,23,0.10)", paddingTop: 16 }}>
            <div style={mcpLabel}>MCP endpoint</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: MKT.dark, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <code style={{ flex: 1, color: "#9FE8DD", fontFamily: MKT.fontMono, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {mcpEndpoint}
              </code>
            </div>

            {/* Rental key — mint a real, scoped Bearer key for this agent. */}
            <div style={mcpLabel}>Rental key</div>
            {rentalKey ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: MKT.dark, borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
                <code style={{ flex: 1, color: "#9FE8DD", fontFamily: MKT.fontMono, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {rentalKey}
                </code>
                <button
                  type="button"
                  className="sf-btn"
                  onClick={copyKey}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    border: "1px solid rgba(246,242,234,0.18)",
                    background: "rgba(246,242,234,0.06)",
                    color: MKT.paper,
                    fontFamily: "inherit",
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: "5px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    flex: "none",
                  }}
                >
                  <MarketplaceIcon name="copy" size={13} />
                  {keyCopied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="sf-btn"
                onClick={onGenerateKey}
                disabled={generating}
                style={{
                  width: "100%",
                  marginBottom: 12,
                  border: "1px solid rgba(0,137,123,0.35)",
                  background: "rgba(0,137,123,0.08)",
                  color: MKT.green,
                  fontFamily: "inherit",
                  fontWeight: 650,
                  fontSize: 13.5,
                  padding: "10px 12px",
                  borderRadius: 10,
                  cursor: generating ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  opacity: generating ? 0.7 : 1,
                }}
              >
                <MarketplaceIcon name="terminal" size={15} />
                {generating ? "Generating…" : "Generate rental key"}
              </button>
            )}

            <div style={mcpLabel}>Add to your client</div>
            <div style={{ position: "relative", background: MKT.dark, borderRadius: 11, padding: 14, overflow: "auto" }}>
              <button
                type="button"
                className="sf-btn"
                onClick={copySnippet}
                style={{
                  position: "absolute",
                  top: 9,
                  right: 9,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  border: "1px solid rgba(246,242,234,0.18)",
                  background: "rgba(246,242,234,0.06)",
                  color: MKT.paper,
                  fontFamily: "inherit",
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "5px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <MarketplaceIcon name="copy" size={13} />
                {copied ? "Copied" : "Copy"}
              </button>
              <pre style={{ margin: 0, color: "#E8E2D6", fontFamily: MKT.fontMono, fontSize: 11.5, lineHeight: 1.6, whiteSpace: "pre" }}>
                {liveSnippet}
              </pre>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.45 }}>
              {rentalKey
                ? "Your key is in the snippet above. Connect any MCP client and call the agent's “ask” tool."
                : "Generate a key, then paste this into your MCP client to call the agent's “ask” tool."}
            </p>
          </div>
        ) : null}

        <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(34,29,23,0.10)", display: "flex", flexDirection: "column", gap: 11 }}>
          <Assurance icon="check" text="Deploys in under a minute" />
          <Assurance icon="check" text="Cancel anytime, no lock-in" />
          <Assurance icon="shield" text="Runs on your own workspace and keys" />
        </div>
      </div>

      {phase !== "idle" ? (
        <InstallCeremony agentShort={short} agentIcon={agent.icon} step={step} done={phase === "done"} onFinish={finishInstall} />
      ) : null}
    </>
  );
}

const mcpLabel = {
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(34,29,23,0.42)",
  marginBottom: 8,
} as const;

/**
 * Split a model price label ("$29/mo", "$2 per call", "$10 per booking",
 * "$49 one-time") into the big dollar amount + the small unit suffix the sidebar
 * renders side by side. The amount is the leading "$NN"; everything after is the
 * suffix ("/mo", "per call", "per booking", "one-time"). Falls back to the whole
 * label as the amount with no suffix if it doesn't start with "$".
 */
function splitPriceLabel(label: string): { amount: string; suffix: string } {
  const m = label.match(/^(\$[\d,.]+)\s*(.*)$/);
  if (!m) return { amount: label, suffix: "" };
  return { amount: m[1], suffix: m[2].trim() };
}

function Assurance({ icon, text }: { icon: "check" | "shield"; text: string }): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "rgba(34,29,23,0.66)" }}>
      <span style={{ color: MKT.green, display: "flex", flex: "none" }}>
        <MarketplaceIcon name={icon} size={17} />
      </span>
      {text}
    </div>
  );
}

/**
 * The post-Checkout success state shown in the buy box when the buyer returns
 * with ?purchased=true. Replaces the price + "Install into my workspace" button
 * with a clear "You're subscribed ✅ / installed" confirmation + an Open-in-Studio
 * CTA — instead of re-showing the Install button (which looked like the redirect
 * went nowhere). Recurring/metered listings read "subscribed"; free/one-time read
 * "installed".
 */
function PurchasedConfirmation({
  agent,
  isRecurring,
  onOpenStudio,
}: {
  agent: StorefrontAgent;
  isRecurring: boolean;
  onOpenStudio: () => void;
}): ReactElement {
  const heading = isRecurring ? "You're subscribed" : "Installed";
  const blurb = isRecurring
    ? `${agent.name} is set up in your Studio and billing is active. Manage or cancel anytime from your workspace billing.`
    : `${agent.name} is set up in your Studio and ready to deploy.`;
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,137,123,0.30)",
        borderRadius: 20,
        padding: 24,
        boxShadow: "0 1px 2px rgba(34,29,23,0.05),0 20px 44px rgba(34,29,23,0.10)",
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          background: "rgba(0,137,123,0.10)",
          color: MKT.green,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 16,
        }}
      >
        <MarketplaceIcon name="check" size={28} stroke={2.6} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-0.015em" }}>{heading}</h2>
        <span style={{ fontSize: 20 }} aria-hidden>
          ✅
        </span>
      </div>
      <p style={{ margin: "0 0 20px", fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.66)" }}>{blurb}</p>
      <button
        type="button"
        className="sf-btn"
        onClick={onOpenStudio}
        style={{
          width: "100%",
          border: "none",
          background: MKT.green,
          color: "#fff",
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: 16,
          padding: 15,
          borderRadius: 13,
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(0,137,123,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 9,
        }}
      >
        Open in Studio
        <MarketplaceIcon name="arrowRight" size={17} />
      </button>
      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid rgba(34,29,23,0.10)", display: "flex", flexDirection: "column", gap: 11 }}>
        <Assurance icon="check" text="Running on your own workspace and keys" />
        {isRecurring ? <Assurance icon="check" text="Cancel anytime from workspace billing" /> : null}
      </div>
    </div>
  );
}

const CEREMONY_STEPS = [
  "Connecting your phone number",
  "Loading your services & pricing",
  "Syncing your calendar",
  "Briefing your agent",
];

/** Full-screen "moving in" moment — the one tasteful animated peak. */
function InstallCeremony({
  agentShort,
  agentIcon,
  step,
  done,
  onFinish,
}: {
  agentShort: string;
  agentIcon: StorefrontAgent["icon"];
  step: number;
  done: boolean;
  onFinish: () => void;
}): ReactElement {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: MKT.dark, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 42%,rgba(0,137,123,0.22),transparent 58%)" }} />
      <div style={{ position: "relative", textAlign: "center", maxWidth: 460, width: "100%" }}>
        <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 30px" }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: 30, background: "rgba(0,137,123,0.18)", animation: "sfRing 2s ease-out infinite" }} />
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 30,
              background: MKT.green,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              animation: "sfFloat 3s ease-in-out infinite,sfGlow 3s ease-in-out infinite",
            }}
          >
            <MarketplaceIcon name={agentIcon} size={46} />
          </span>
        </div>

        {!done ? (
          <>
            <h2 style={{ margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", color: MKT.paper }}>
              Your {agentShort} is moving in
              <TypingDots style={{ marginLeft: 4 }} />
            </h2>
            <p style={{ margin: "12px 0 30px", fontSize: 15.5, color: "rgba(246,242,234,0.62)" }}>
              Setting up its desk, plugging in the phones, learning your business.
            </p>
            <div style={{ background: "rgba(246,242,234,0.05)", border: "1px solid rgba(246,242,234,0.12)", borderRadius: 18, padding: "10px 18px", textAlign: "left" }}>
              {CEREMONY_STEPS.map((label, i) => {
                const stepDone = step > i;
                const current = step === i && !done;
                return (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 13,
                      padding: "12px 0",
                      borderBottom: i === CEREMONY_STEPS.length - 1 ? "1px solid transparent" : "1px solid rgba(246,242,234,0.08)",
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 999,
                        flex: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: stepDone ? MKT.green : "rgba(246,242,234,0.08)",
                        color: stepDone ? "#fff" : "rgba(246,242,234,0.4)",
                      }}
                    >
                      {stepDone ? (
                        <MarketplaceIcon name="check" size={15} stroke={3} />
                      ) : current ? (
                        <TypingDots style={{ transform: "scale(.7)" }} />
                      ) : (
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: "rgba(246,242,234,0.3)" }} />
                      )}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 550, color: stepDone ? MKT.paper : current ? "rgba(246,242,234,0.85)" : "rgba(246,242,234,0.4)" }}>
                      {label.replace("your agent", agentShort)}
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="sf-rise">
            <h2 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: MKT.paper }}>
              Moved in.{" "}
              <span style={{ fontFamily: MKT.fontSerif, fontStyle: "italic", fontWeight: 400, color: MKT.greenLight }}>Say hello.</span>
            </h2>
            <p style={{ margin: "12px 0 30px", fontSize: 15.5, color: "rgba(246,242,234,0.66)", lineHeight: 1.5 }}>
              {agentShort} is set up in your Studio and ready to take its first call. Deploy whenever you're ready.
            </p>
            <button
              type="button"
              className="sf-btn"
              onClick={onFinish}
              style={{
                border: "none",
                background: MKT.green,
                color: "#fff",
                fontFamily: "inherit",
                fontWeight: 700,
                fontSize: 16,
                padding: "15px 30px",
                borderRadius: 13,
                cursor: "pointer",
                boxShadow: "0 10px 30px rgba(0,137,123,0.4)",
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
              }}
            >
              Open in Studio
              <MarketplaceIcon name="arrowRight" size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
