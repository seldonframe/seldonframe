"use client";

// Marketplace buyer surface — the go_live step (the finale).
//
// Two faces, ported STRUCTURE from the Claude Design export's "Go live" screen,
// re-skinned to the real brand (teal `#00897B`, cream paper, confetti in the
// brand palette — NOT the export's violet):
//
//   • NOT live yet → "Ready to go live": a summary of what the buyer set up + the
//     primary "Go live" button. If a REQUIRED step is still outstanding (computed
//     client-side via `goLiveBlockers` for instant feedback, and re-checked
//     server-side by `goLiveAction`), the button is disabled and the blocker is
//     named with a "Fix it" affordance that jumps back to that step.
//   • live → "You're live ✨": a celebratory confirmation + "Go to My Agent home",
//     which routes to `/agent/[deploymentId]`.
//
// Go-live is gated ONLY on true blockers (required steps), never on skippable
// ones — exactly the plan's contract. The action flips the deployment to
// `active`; this component owns its footer (no generic wizard Continue).

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { BUYER } from "@/components/buyer/theme";
import { goLiveAction } from "@/app/(buyer)/agent/actions";
import {
  goLiveBlockers,
  type GoLiveBlocker,
} from "@/lib/marketplace/buyer/buyer-onboarding";
import type { OnboardingStep, OnboardingStepKind } from "@/lib/marketplace/onboarding/steps";

/** A read-only summary row shown in the "ready to go live" recap. */
export type GoLiveSummaryRow = { label: string; value: string };

export type GoLiveStepProps = {
  deploymentId: string;
  agentName: string;
  /** Where "Go to My Agent home" routes after going live. */
  homeHref: string;
  /** The full step list + the kinds already done — drives the blocker check. */
  steps: OnboardingStep[];
  doneKinds: OnboardingStepKind[];
  /** The recap rows (business name, phone, calendar) the page assembled. */
  summary: GoLiveSummaryRow[];
  /** Whether a Back affordance is shown. */
  canGoBack: boolean;
  onBack: () => void;
  /** Jump the wizard to a specific step kind (used by "Fix it" on a blocker). */
  onJumpToStep: (kind: OnboardingStepKind) => void;
};

export function GoLiveStep({
  deploymentId,
  agentName,
  homeHref,
  steps,
  doneKinds,
  summary,
  canGoBack,
  onBack,
  onJumpToStep,
}: GoLiveStepProps) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [going, startGoing] = useTransition();

  // Client-side blocker check for instant feedback (the action re-checks).
  const blockers: GoLiveBlocker[] = useMemo(
    () => goLiveBlockers(steps, { doneKinds }),
    [steps, doneKinds],
  );
  const blocked = blockers.length > 0;

  function handleGoLive() {
    setError(null);
    startGoing(async () => {
      const result = await goLiveAction(deploymentId);
      if (result.ok) {
        setLive(true);
        return;
      }
      if (result.error === "blocked") {
        // The server found an outstanding required step — name the first.
        const first = result.blockers[0];
        setError(
          first
            ? `Finish “${first.label}” before going live.`
            : "Finish the remaining setup steps before going live.",
        );
        return;
      }
      setError(
        result.error === "unauthorized"
          ? "You don’t have access to this agent."
          : result.error === "not_found"
            ? "We couldn’t find your agent."
            : "Couldn’t go live — please try again.",
      );
    });
  }

  // ── LIVE: the celebration ──────────────────────────────────────────────────
  if (live) {
    return (
      <div style={{ textAlign: "center", position: "relative", overflow: "hidden", padding: "8px 0" }}>
        <Confetti />
        <div aria-hidden style={liveCheck}>
          ✓
        </div>
        <h2 style={liveHeadline}>
          You’re live <span style={{ color: BUYER.accent }}>✨</span>
        </h2>
        <p style={liveLine}>
          {agentName} is answering now. Put your number on your site and Google
          listing whenever you’re ready.
        </p>
        <div style={liveBadge}>
          <span style={liveDot} />
          Live now
        </div>
        <div style={{ maxWidth: 320, margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => router.push(homeHref)}
            style={{ ...navBtnPrimary, width: "100%", justifyContent: "center" }}
          >
            Go to My Agent home →
          </button>
        </div>
      </div>
    );
  }

  // ── NOT LIVE: the recap + go-live ──────────────────────────────────────────
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        <h2 style={hHeading}>Ready to go live</h2>
        <p style={hSub}>
          Here’s everything you set up. Flip the switch whenever you’re ready.
        </p>
      </div>

      {summary.length > 0 ? (
        <div style={summaryCard}>
          {summary.map((row, i) => (
            <div
              key={row.label}
              style={{
                ...summaryRow,
                borderBottom: i < summary.length - 1 ? `1px solid ${BUYER.line}` : "none",
              }}
            >
              <div style={summaryLabel}>{row.label}</div>
              <div style={summaryValue}>{row.value}</div>
            </div>
          ))}
        </div>
      ) : null}

      {blocked ? (
        <div role="status" style={blockerBox}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 13.5, color: BUYER.amber }}>
            A couple of things left before you can go live:
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {blockers.map((b) => (
              <li
                key={b.kind}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
              >
                <span style={{ fontSize: 14, color: BUYER.ink }}>{b.label}</span>
                <button type="button" onClick={() => onJumpToStep(b.kind)} style={fixItBtn}>
                  Fix it →
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={errStyle}>
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={handleGoLive}
        disabled={going || blocked}
        style={{
          ...navBtnPrimary,
          width: "100%",
          justifyContent: "center",
          marginTop: 20,
          opacity: blocked ? 0.5 : 1,
          cursor: blocked ? "not-allowed" : "pointer",
        }}
      >
        {going ? "Going live…" : "Go live ✨"}
      </button>

      {canGoBack ? (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button type="button" onClick={onBack} disabled={going} style={navBtnGhost}>
            ← Back
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ─── confetti (brand palette) ────────────────────────────────────────────────

function Confetti() {
  const pieces = [
    { left: "12%", w: 8, h: 14, color: BUYER.accent, radius: 2, dur: "1.5s", delay: "0s" },
    { left: "28%", w: 8, h: 8, color: BUYER.amber, radius: 999, dur: "1.7s", delay: ".15s" },
    { left: "46%", w: 7, h: 13, color: BUYER.info, radius: 2, dur: "1.4s", delay: ".05s" },
    { left: "62%", w: 9, h: 9, color: BUYER.accent, radius: 999, dur: "1.8s", delay: ".22s" },
    { left: "78%", w: 7, h: 14, color: BUYER.positive, radius: 2, dur: "1.6s", delay: ".1s" },
    { left: "88%", w: 8, h: 8, color: BUYER.amber, radius: 999, dur: "1.5s", delay: ".3s" },
  ];
  return (
    <div aria-hidden style={{ position: "absolute", inset: "0 0 auto", height: 0, pointerEvents: "none" }}>
      <style>{"@keyframes sf-buyer-fall{to{transform:translateY(220px) rotate(120deg);opacity:0}}"}</style>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: p.left,
            top: 0,
            width: p.w,
            height: p.h,
            background: p.color,
            borderRadius: p.radius,
            animation: `sf-buyer-fall ${p.dur} ${BUYER.fontSans ? "ease-out" : "ease-out"} ${p.delay} forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ─── styles (BUYER tokens) ───────────────────────────────────────────────────

const hHeading: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 21,
  fontWeight: 650,
  letterSpacing: "-0.018em",
};
const hSub: React.CSSProperties = {
  margin: "0 auto",
  maxWidth: 400,
  fontSize: 15,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const summaryCard: React.CSSProperties = {
  textAlign: "left",
  borderRadius: 18,
  background: BUYER.paper2,
  border: `1px solid ${BUYER.line}`,
  overflow: "hidden",
  marginBottom: 8,
};
const summaryRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 14,
  padding: "15px 18px",
};
const summaryLabel: React.CSSProperties = {
  flex: 1,
  fontSize: 12,
  color: BUYER.ink3,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.03em",
};
const summaryValue: React.CSSProperties = {
  fontSize: 14.5,
  fontWeight: 600,
  color: BUYER.ink,
  textAlign: "right",
};
const blockerBox: React.CSSProperties = {
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 14,
  background: BUYER.amberSoft,
  border: `1px solid ${BUYER.amber}33`,
};
const fixItBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontFamily: BUYER.fontSans,
  fontSize: 13.5,
  fontWeight: 600,
  color: BUYER.accent,
  padding: 0,
  whiteSpace: "nowrap",
};
const liveCheck: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 72,
  height: 72,
  borderRadius: 22,
  background: BUYER.accent,
  color: BUYER.accentContrast,
  marginBottom: 20,
  boxShadow: BUYER.shadowAccent,
  fontSize: 38,
  fontWeight: 700,
};
const liveHeadline: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: "clamp(24px,6vw,30px)",
  fontWeight: 700,
  letterSpacing: "-0.022em",
};
const liveLine: React.CSSProperties = {
  margin: "0 auto 22px",
  maxWidth: 400,
  fontSize: 16,
  color: BUYER.ink2,
  lineHeight: 1.5,
};
const liveBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 14px",
  borderRadius: 999,
  background: BUYER.posSoft,
  color: BUYER.positive,
  fontSize: 13.5,
  fontWeight: 600,
  marginBottom: 26,
};
const liveDot: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: BUYER.positive,
};
const errStyle: React.CSSProperties = {
  margin: "16px 0 0",
  fontSize: 13.5,
  color: "#B4302A",
  fontWeight: 550,
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
