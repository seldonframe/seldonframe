"use client";

// The GoHighLevel agency cost calculator — the wedge tool at
// /tools/gohighlevel-cost-calculator. Pure client math, no network calls:
// plan base + AI Employee add-on (plan-dependent, per sub-account) + rebilled
// usage (SMS/email/voice, hedged as "estimated") stacked per client, plus a
// mini curve at 1/5/10/25 clients. Styled on the MKT palette to match the
// other free-tool pages. Numbers trace to lib/seo/competitor-pricing.ts
// (gohighlevel entry, sourced from gohighlevel.com/pricing, verified July 2026).

import { useState, useEffect, useRef, type ReactElement } from "react";

import {
  encodeGhlCostState,
  decodeGhlCostState,
  renderResultCard,
  buildShareUrl,
  copyToClipboard,
  downloadCanvasAsImage,
  shareResultCard,
  type GhlPlan,
} from "./result-card";

const INK = "#221D17";
const GREEN = "#00897B";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const BLUE = "#2E5F8A";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ─── Pure math (exported for unit tests — no DOM, no network) ──────────

/** GHL's published base plan price. Source: gohighlevel.com/pricing, per
 *  lib/seo/competitor-pricing.ts (verified July 2026). */
export function ghlPlanBase(plan: GhlPlan): number {
  if (plan === "starter") return 97;
  if (plan === "unlimited") return 297;
  return 497; // agencyPro
}

export const GHL_PLAN_LABELS: Record<GhlPlan, string> = {
  starter: "Starter ($97/mo)",
  unlimited: "Unlimited ($297/mo)",
  agencyPro: "Agency Pro ($497/mo)",
};

/**
 * GHL's "AI Employee" add-on rate per sub-account, per the competitor-pricing
 * registry: "$50/mo per sub-account on Starter-level plans, or $97/mo per
 * sub-account on the Unlimited plan." We model Agency Pro at the same $97/mo
 * rate as Unlimited (both are "Unlimited-tier and above" in GHL's own copy) —
 * hedged, not independently re-verified per tier.
 */
export function ghlAiEmployeeRatePerClient(plan: GhlPlan): number {
  return plan === "starter" ? 50 : 97;
}

/**
 * Estimated monthly rebilled-usage cost for one sub-account, given monthly
 * SMS segments, email sends, and voice minutes. These are NOT GHL's own
 * published per-unit prices (GHL rebills SMS/voice "at cost" through its
 * underlying Twilio/Mailgun-style providers and that per-unit rate isn't
 * published) — they're hedged, typical-market per-unit rates so the tool can
 * show a usage estimate instead of nothing:
 *   SMS   ~$0.0079/segment (typical US A2P long-code segment rate)
 *   Email ~$0.001/send     (typical transactional-email rebilling rate)
 *   Voice ~$0.014/min      (typical US inbound/outbound voice minute rate)
 * These are presented in the UI as "estimated usage costs," never as GHL's
 * own quoted numbers.
 */
export const HEDGED_USAGE_RATES = {
  smsPerSegment: 0.0079,
  emailPerSend: 0.001,
  voicePerMinute: 0.014,
} as const;

export function ghlUsageCostPerClient(smsPerClient: number, emailPerClient: number, voiceMinPerClient: number): number {
  return (
    smsPerClient * HEDGED_USAGE_RATES.smsPerSegment +
    emailPerClient * HEDGED_USAGE_RATES.emailPerSend +
    voiceMinPerClient * HEDGED_USAGE_RATES.voicePerMinute
  );
}

export interface GhlCostBreakdown {
  base: number;
  aiStack: number;
  usage: number;
  total: number;
  perClient: number;
}

/**
 * Total monthly GHL cost at a given client (sub-account) count: the flat plan
 * base (does not scale with clients) + the AI Employee add-on stacked per
 * client (only when enabled) + estimated usage stacked per client.
 */
export function ghlTotalMonthlyCost(input: {
  plan: GhlPlan;
  clients: number;
  aiEmployeeOn: boolean;
  smsPerClient: number;
  emailPerClient: number;
  voiceMinPerClient: number;
}): GhlCostBreakdown {
  const clients = Math.max(0, Math.round(input.clients));
  const base = ghlPlanBase(input.plan);
  const aiStack = input.aiEmployeeOn ? ghlAiEmployeeRatePerClient(input.plan) * clients : 0;
  const usagePerClient = ghlUsageCostPerClient(input.smsPerClient, input.emailPerClient, input.voiceMinPerClient);
  const usage = usagePerClient * clients;
  const total = base + aiStack + usage;
  const perClient = clients > 0 ? total / clients : total;
  return { base, aiStack, usage, total, perClient };
}

/** The mini bar-row curve: total monthly cost at 1, 5, 10, 25 clients, all
 *  else held constant — shows how the bill stacks as an agency grows. */
export function ghlCostCurve(input: {
  plan: GhlPlan;
  aiEmployeeOn: boolean;
  smsPerClient: number;
  emailPerClient: number;
  voiceMinPerClient: number;
}): { clients: number; total: number }[] {
  return [1, 5, 10, 25].map((clients) => ({
    clients,
    total: ghlTotalMonthlyCost({ ...input, clients }).total,
  }));
}

export function GohighlevelCostCalculator(): ReactElement {
  const [clients, setClients] = useState(10);
  const [plan, setPlan] = useState<GhlPlan>("unlimited");
  const [aiEmployeeOn, setAiEmployeeOn] = useState(true);
  const [smsPerClient, setSmsPerClient] = useState(200);
  const [emailPerClient, setEmailPerClient] = useState(1000);
  const [voiceMinPerClient, setVoiceMinPerClient] = useState(100);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeGhlCostState(window.location.search);
    if (decoded.clients !== undefined) setClients(decoded.clients);
    if (decoded.plan !== undefined) setPlan(decoded.plan);
    if (decoded.aiEmployeeOn !== undefined) setAiEmployeeOn(decoded.aiEmployeeOn);
    if (decoded.smsPerClient !== undefined) setSmsPerClient(decoded.smsPerClient);
    if (decoded.emailPerClient !== undefined) setEmailPerClient(decoded.emailPerClient);
    if (decoded.voiceMinPerClient !== undefined) setVoiceMinPerClient(decoded.voiceMinPerClient);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeGhlCostState({ clients, plan, aiEmployeeOn, smsPerClient, emailPerClient, voiceMinPerClient });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [clients, plan, aiEmployeeOn, smsPerClient, emailPerClient, voiceMinPerClient]);

  const breakdown = ghlTotalMonthlyCost({ plan, clients, aiEmployeeOn, smsPerClient, emailPerClient, voiceMinPerClient });
  const curve = ghlCostCurve({ plan, aiEmployeeOn, smsPerClient, emailPerClient, voiceMinPerClient });
  const maxCurve = Math.max(...curve.map((c) => c.total), 1);

  const stackRows: { label: string; value: number; tone: string }[] = [
    { label: "Plan base", value: breakdown.base, tone: BLUE },
    { label: "AI Employee stack", value: breakdown.aiStack, tone: AMBER },
    { label: "Estimated usage", value: breakdown.usage, tone: AMBER },
  ];
  const maxStack = Math.max(...stackRows.map((r) => r.value), 1);

  // ─── Shareable result card ───
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canShare = typeof window !== "undefined" && typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      renderResultCard(canvas, {
        headline: "What GoHighLevel really costs an agency",
        bigNumber: `${money(breakdown.total)}/mo`,
        subline: `for ${clients} client${clients === 1 ? "" : "s"} on ${GHL_PLAN_LABELS[plan]}`,
        rows: [
          { label: "Plan base", value: `${money(breakdown.base)}/mo` },
          { label: "AI Employee stack", value: `${money(breakdown.aiStack)}/mo` },
          { label: "Estimated usage", value: `${money(breakdown.usage)}/mo` },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [breakdown.total, breakdown.base, breakdown.aiStack, breakdown.usage, clients, plan]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "gohighlevel-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "What GoHighLevel really costs an agency",
      text: `GoHighLevel would cost me ~${money(breakdown.total)}/mo for ${clients} clients.`,
      url,
      filename: "gohighlevel-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <NumberField
          label="Client sub-accounts"
          hint="How many client sub-accounts you run"
          value={clients}
          min={1}
          max={50}
          step={1}
          format={(v) => `${v} client${v === 1 ? "" : "s"}`}
          onChange={setClients}
        />

        <label style={{ display: "block" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Plan</span>
          <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", margin: "2px 0 10px" }}>
            GoHighLevel&apos;s published plan tiers
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(["starter", "unlimited", "agencyPro"] as GhlPlan[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlan(p)}
                aria-pressed={plan === p}
                style={{
                  border: plan === p ? `2px solid ${GREEN}` : `1.5px solid ${INK10}`,
                  color: INK,
                  padding: "9px 16px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13.5,
                  background: plan === p ? "rgba(0,137,123,0.08)" : "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                }}
              >
                {GHL_PLAN_LABELS[p]}
              </button>
            ))}
          </div>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={aiEmployeeOn}
            onChange={(e) => setAiEmployeeOn(e.target.checked)}
            aria-label="AI Employee per sub-account"
            style={{ width: 18, height: 18, accentColor: GREEN }}
          />
          <span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>AI Employee per sub-account</span>
            <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)" }}>
              +{money(ghlAiEmployeeRatePerClient(plan))}/mo per client on {GHL_PLAN_LABELS[plan]}
            </div>
          </span>
        </label>

        <NumberField
          label="SMS segments per client / mo"
          hint="Estimated usage cost — GHL rebills SMS at cost through its telephony provider; exact rate isn't published"
          value={smsPerClient}
          min={0}
          max={2000}
          step={25}
          format={(v) => `${v} segments`}
          onChange={setSmsPerClient}
        />
        <NumberField
          label="Email sends per client / mo"
          hint="Estimated usage cost — GHL rebills email at cost; exact rate isn't published"
          value={emailPerClient}
          min={0}
          max={20000}
          step={250}
          format={(v) => `${v.toLocaleString()} sends`}
          onChange={setEmailPerClient}
        />
        <NumberField
          label="Voice minutes per client / mo"
          hint="Estimated usage cost — GHL rebills voice minutes at cost; exact rate isn't published"
          value={voiceMinPerClient}
          min={0}
          max={2000}
          step={25}
          format={(v) => `${v} min`}
          onChange={setVoiceMinPerClient}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
            Total monthly cost
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "rgba(34,29,23,0.6)" }}>{money(breakdown.perClient)}/client</div>
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, color: INK, margin: "6px 0 18px" }}>{money(breakdown.total)}/mo</div>

        <div style={{ display: "grid", gap: 12 }} role="img" aria-label={stackRows.map((r) => `${r.label}: ${money(r.value)} per month`).join(", ")}>
          {stackRows.map((r) => {
            const widthPct = Math.max(4, (r.value / maxStack) * 100);
            return (
              <div key={r.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  <span>{r.label}</span>
                  <span>{money(r.value)}/mo</span>
                </div>
                <div style={{ position: "relative", height: 24, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${widthPct}%`, background: r.tone, borderRadius: 8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 12 }}>
          Costs stack per client
        </div>
        <div style={{ display: "grid", gap: 10 }} role="img" aria-label={curve.map((c) => `at ${c.clients} clients: ${money(c.total)} per month`).join(", ")}>
          {curve.map((c) => {
            const widthPct = Math.max(4, (c.total / maxCurve) * 100);
            const isCurrent = c.clients === clients;
            return (
              <div key={c.clients}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                  <span>
                    {c.clients} client{c.clients === 1 ? "" : "s"} {isCurrent && <span style={{ color: GREEN, fontSize: 11.5 }}>← current</span>}
                  </span>
                  <span>{money(c.total)}/mo</span>
                </div>
                <div style={{ position: "relative", height: 18, borderRadius: 6, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${widthPct}%`, background: isCurrent ? GREEN : BLUE, borderRadius: 6 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ margin: "18px 0 0", fontSize: 14.5, fontWeight: 700, color: GREEN }}>
        SeldonFrame: $29/mo flat on the builder tier (agency tiers up to $299), unlimited workspaces — AI + telephony on your own keys at raw
        provider cost.
      </p>

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> plan base is GHL&apos;s published sticker price and does not scale with client
          count. The AI Employee add-on is $50/mo per sub-account on Starter-level plans, $97/mo per sub-account on
          Unlimited and above, per GHL&apos;s own pricing page. SMS/email/voice usage is rebilled &quot;at cost&quot; by
          GHL but the exact per-unit rate isn&apos;t published — the figures here are hedged, typical-market per-unit
          estimates (~$0.0079/SMS segment, ~$0.001/email send, ~$0.014/voice minute), presented as estimated usage
          costs, not GHL&apos;s own numbers.
        </p>
        <p style={{ margin: 0 }}>
          Source: <a href="https://www.gohighlevel.com/pricing" target="_blank" rel="noopener noreferrer" style={{ color: GREEN }}>gohighlevel.com/pricing</a> (verified July 2026).
        </p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Build your AI front office free in ~3 minutes
        </a>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 12 }}>
          Share your result
        </div>
        <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${INK10}`, background: "#1F2B24", maxWidth: 640 }}>
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card comparing GoHighLevel costs" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center" }}>
          <button
            type="button"
            onClick={handleDownload}
            style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "rgba(255,255,255,0.6)", cursor: "pointer" }}
          >
            ⬇ Download image
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "rgba(255,255,255,0.6)", cursor: "pointer" }}
          >
            🔗 {copyFeedback ?? "Copy link"}
          </button>
          {canShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "10px 18px", borderRadius: 10, fontWeight: 700, fontSize: 14, background: "rgba(255,255,255,0.6)", cursor: "pointer" }}
            >
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}): ReactElement {
  return (
    <label style={{ display: "block" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
        <span style={{ fontWeight: 800, fontSize: 16, color: GREEN, whiteSpace: "nowrap" }}>{format(value)}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", margin: "2px 0 10px" }}>{hint}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: GREEN }}
        aria-label={label}
      />
    </label>
  );
}
