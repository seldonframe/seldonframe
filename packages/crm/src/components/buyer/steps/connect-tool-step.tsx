"use client";

// Marketplace buyer surface — the connect_tool step (Composio managed OAuth).
//
// One screen per external tool the agent binds (the engine emits one
// connect_tool step per Composio toolkit). The reference receptionist binds
// `googlecalendar`, so the canonical screen is "Connect Google Calendar": one
// primary button + a why-line ("so your agent books real appointments straight
// into your calendar"), plus the connected success state once the deployment's
// calendarRef is bound.
//
// Mechanism (reused verbatim from the agency Clients card — agency-key +
// per-deployment-entity): the button calls `startCalendarConnect`, which returns
// a Composio OAuth URL the buyer follows (window.location). The callback
// (app/api/deployments/[id]/calendar/callback) verifies the connection + persists
// calendarRef, then bounces back to the wizard — where the page re-resolves the
// connected state on the next load.
//
// SKIPPABLE: booking fail-softs to native availability when no calendar is bound
// (resolveCalendarBackend), so the buyer can always "Skip for now" and go live.
// The connect itself only supports the two calendar toolkits; a non-calendar
// toolkit (a future binding) renders an honest "we'll wire this up" + skip rather
// than a broken button.
//
// Ported STRUCTURE from the Claude Design export's "Connect your calendar" /
// "Calendar connected" screens; re-skinned to the brand (teal #00897B, cream,
// accent-soft/positive-soft state chips — no violet).

import { useState, useTransition } from "react";

import { BUYER } from "@/components/buyer/theme";
import {
  startCalendarConnect,
  type CalendarToolkit,
} from "@/lib/deployments/connect-calendar";
import { buyerSetupPath } from "@/lib/marketplace/buyer/buyer-routes";
import { getComposioToolkit } from "@/lib/integrations/composio/catalog";

/** The two toolkits the calendar connect supports. */
const CALENDAR_TOOLKITS = new Set<string>(["googlecalendar", "outlook"]);

export type ConnectToolSeed = {
  /** The Composio toolkit slug this step connects (from step.toolkit). */
  toolkit: string;
  /** Whether the deployment's calendarRef is already bound to this toolkit. */
  connected: boolean;
};

export type ConnectToolStepProps = {
  deploymentId: string;
  seed: ConnectToolSeed;
  canGoBack: boolean;
  onBack: () => void;
  /** Record the step done + advance (the generic wizard path). Used by both
   *  "Skip for now" and the "Continue" shown once connected. */
  onContinue: () => void;
};

/** A human label for the toolkit (catalog → fallback to a titled slug). */
function toolkitLabel(slug: string): string {
  const info = getComposioToolkit(slug);
  if (info) return info.label;
  if (!slug) return "this tool";
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

export function ConnectToolStep({
  deploymentId,
  seed,
  canGoBack,
  onBack,
  onContinue,
}: ConnectToolStepProps) {
  const [error, setError] = useState<string | null>(null);
  const [connecting, startConnecting] = useTransition();

  const toolkit = seed.toolkit;
  const label = toolkitLabel(toolkit);
  const isCalendar = CALENDAR_TOOLKITS.has(toolkit);
  const logo = getComposioToolkit(toolkit)?.logo ?? null;

  function handleConnect() {
    if (!isCalendar) return;
    setError(null);
    startConnecting(async () => {
      const r = await startCalendarConnect({
        deploymentId,
        toolkit: toolkit as CalendarToolkit,
        // Land the buyer BACK on this wizard after OAuth (not the agency Clients
        // page). The wizard re-resolves the connected state from the persisted
        // calendarRef and resumes at this step's success view (BUG 1 fix).
        returnTo: buyerSetupPath(deploymentId),
      });
      if (r.ok) {
        // Hand off to Composio's consent screen; the callback persists
        // calendarRef + returns the buyer to the wizard.
        window.location.href = r.redirectUrl;
        return;
      }
      setError(
        r.error === "invalid_toolkit"
          ? "This tool can’t be connected here yet — you can skip it."
          : r.error === "unauthorized"
            ? "You don’t have access to this agent."
            : r.error === "not_found"
              ? "We couldn’t find your agent."
              : "Couldn’t start the connection — please try again.",
      );
    });
  }

  // ── CONNECTED: success state ────────────────────────────────────────────────
  if (seed.connected) {
    return (
      <div style={{ textAlign: "center" }}>
        <div aria-hidden style={{ ...iconWrap, background: BUYER.posSoft, color: BUYER.positive }}>
          ✓
        </div>
        <h2 style={hHeading}>{label} connected</h2>
        <p style={hSub}>Bookings will land in your calendar in real time.</p>

        <div style={{ ...footerRow, justifyContent: canGoBack ? "space-between" : "flex-end" }}>
          {canGoBack ? (
            <button type="button" onClick={onBack} style={navBtnGhost}>
              ← Back
            </button>
          ) : null}
          <button type="button" onClick={onContinue} style={navBtnPrimary}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── NOT CONNECTED ───────────────────────────────────────────────────────────
  return (
    <div style={{ textAlign: "center" }}>
      <div aria-hidden style={iconWrap}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={30} height={30} style={{ display: "block" }} />
        ) : (
          "📅"
        )}
      </div>
      <h2 style={hHeading}>Connect your {isCalendar ? "calendar" : label.toLowerCase()}</h2>
      <p style={hSub}>
        {isCalendar
          ? `So your agent books real appointments straight into your ${label}.`
          : `So your agent can use ${label} on your behalf.`}
      </p>

      {isCalendar ? (
        <div style={{ maxWidth: 340, margin: "22px auto 0" }}>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            style={{ ...navBtnPrimary, width: "100%", justifyContent: "center" }}
          >
            {connecting ? "Opening…" : `Connect ${label}`}
          </button>
          <p style={whyLine}>We only add appointments your agent books. Nothing else.</p>
        </div>
      ) : (
        <p style={{ ...whyLine, marginTop: 18 }}>
          We’ll help you connect {label} from your agent home after setup.
        </p>
      )}

      {error ? (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      ) : null}

      {/* Footer: Back + Skip-for-now (the step is skippable — booking fail-softs
          to native). The connect button above is the primary affordance. */}
      <div style={{ ...footerRow, justifyContent: canGoBack ? "space-between" : "flex-end" }}>
        {canGoBack ? (
          <button type="button" onClick={onBack} disabled={connecting} style={navBtnGhost}>
            ← Back
          </button>
        ) : null}
        <button type="button" onClick={onContinue} disabled={connecting} style={skipBtn}>
          Skip for now →
        </button>
      </div>
    </div>
  );
}

// ─── styles (BUYER tokens) ───────────────────────────────────────────────────

const iconWrap: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 62,
  height: 62,
  borderRadius: 18,
  background: BUYER.accentSoft,
  color: BUYER.accent,
  marginBottom: 18,
  fontSize: 28,
  fontWeight: 700,
};
const hHeading: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: "0 auto",
  maxWidth: 380,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const whyLine: React.CSSProperties = {
  margin: "16px 0 0",
  fontSize: 12.5,
  color: BUYER.ink3,
  lineHeight: 1.5,
};
const errStyle: React.CSSProperties = {
  margin: "16px auto 0",
  maxWidth: 380,
  fontSize: 13.5,
  color: "#B4302A",
  fontWeight: 550,
};
const footerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  marginTop: 26,
};
const navBtnPrimary: React.CSSProperties = {
  fontFamily: BUYER.fontSans,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 48,
  padding: "0 22px",
  borderRadius: 14,
  border: "none",
  background: BUYER.accent,
  color: BUYER.accentContrast,
  fontSize: 16,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: BUYER.shadowAccent,
};
const navBtnGhost: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 15,
  fontWeight: 550,
  color: BUYER.ink2,
  padding: "10px 4px",
};
const skipBtn: React.CSSProperties = {
  ...navBtnGhost,
  color: BUYER.ink3,
  fontWeight: 600,
};
