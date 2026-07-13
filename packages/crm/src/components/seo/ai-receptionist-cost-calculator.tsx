"use client";

// The AI receptionist cost calculator — the interactive island of
// /tools/ai-receptionist-cost-calculator. Pure client math, no network calls:
// inputs → four cost lines → a simple bar comparison. Styled on the MKT
// palette to match the other free-tool pages.

import { useState, useEffect, useRef, type ReactElement } from "react";

import {
  encodeCostCalcState,
  decodeCostCalcState,
  renderResultCard,
  buildShareUrl,
  copyToClipboard,
  downloadCanvasAsImage,
  shareResultCard,
} from "./result-card";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function AiReceptionistCostCalculator(): ReactElement {
  const [callsPerMonth, setCallsPerMonth] = useState(300);
  const [avgMinutes, setAvgMinutes] = useState(4);
  const [wage, setWage] = useState(18);
  const [answeringRate, setAnsweringRate] = useState(1.75);
  const [aiRate, setAiRate] = useState(0.3);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from the URL on mount only — never during SSR (no `window`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeCostCalcState(window.location.search);
    if (decoded.callsPerMonth !== undefined) setCallsPerMonth(decoded.callsPerMonth);
    if (decoded.avgMinutes !== undefined) setAvgMinutes(decoded.avgMinutes);
    if (decoded.wage !== undefined) setWage(decoded.wage);
    if (decoded.answeringRate !== undefined) setAnsweringRate(decoded.answeringRate);
    if (decoded.aiRate !== undefined) setAiRate(decoded.aiRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the address bar in sync with the current inputs (throttled) so the
  // URL is always a shareable permalink of whatever's on screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeCostCalcState({ callsPerMonth, avgMinutes, wage, answeringRate, aiRate });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [callsPerMonth, avgMinutes, wage, answeringRate, aiRate]);

  // Estimate coverage hours a human receptionist needs from call volume:
  // calls x minutes gives total talk-time hours, tripled as a rough proxy for
  // idle/wait time between calls, floored at 40h (part-time minimum) and
  // capped at 160h (one full-time month).
  const talkHours = (callsPerMonth * avgMinutes) / 60;
  const coverageHours = Math.min(160, Math.max(40, talkHours * 3));

  const humanCost = Math.round(coverageHours * wage);
  const answeringServiceCost = Math.round(callsPerMonth * answeringRate);
  const aiPerMinuteCost = Math.round(callsPerMonth * avgMinutes * aiRate);
  const SELDONFRAME_FLAT = 29;

  const bars: { label: string; value: number; tone: string }[] = [
    { label: "Human receptionist", value: humanCost, tone: RED },
    { label: "Answering service", value: answeringServiceCost, tone: AMBER },
    { label: "Per-minute AI service", value: aiPerMinuteCost, tone: AMBER },
    { label: "SeldonFrame (flat)", value: SELDONFRAME_FLAT, tone: GREEN },
  ];
  const maxValue = Math.max(...bars.map((b) => b.value), 1);
  const cheapest = bars.reduce((a, b) => (b.value < a.value ? b : a), bars[0]);
  const monthlySavings = Math.max(0, humanCost - SELDONFRAME_FLAT);

  // ─── Shareable result card ───
  // bigNumber = the savings figure when positive — "$X,XXX/mo saved" is the
  // striking, share-worthy number (it's the story: "look what I'd save"),
  // vs. "SeldonFrame $29 flat" which reads as a price tag, not a result.
  // Falls back to the flat price only in the edge case where a human
  // receptionist would already be cheaper than $29/mo.
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
        headline: "What a receptionist really costs per month",
        bigNumber: monthlySavings > 0 ? `${money(monthlySavings)}/mo saved` : `${money(SELDONFRAME_FLAT)}/mo flat`,
        subline: `Human ${money(humanCost)} · Answering service ${money(answeringServiceCost)} · Per-minute AI ${money(aiPerMinuteCost)}`,
        rows: [
          { label: "Human receptionist", value: `${money(humanCost)}/mo` },
          { label: "Answering service", value: `${money(answeringServiceCost)}/mo` },
          { label: "SeldonFrame", value: `${money(SELDONFRAME_FLAT)}/mo flat` },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [humanCost, answeringServiceCost, aiPerMinuteCost, monthlySavings]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "receptionist-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "What a receptionist really costs per month",
      text: monthlySavings > 0 ? `I could save ~${money(monthlySavings)}/mo with an AI receptionist.` : "See what a receptionist really costs per month.",
      url,
      filename: "receptionist-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <NumberField
          label="Calls per month"
          hint="Total inbound calls your business receives"
          value={callsPerMonth}
          min={20}
          max={3000}
          step={10}
          format={(v) => `${v} calls`}
          onChange={setCallsPerMonth}
        />
        <NumberField
          label="Average call length"
          hint="Minutes per call, start to finish"
          value={avgMinutes}
          min={1}
          max={20}
          step={0.5}
          format={(v) => `${v} min`}
          onChange={setAvgMinutes}
        />
        <NumberField
          label="Receptionist hourly wage"
          hint="What you'd pay an in-house or part-time receptionist"
          value={wage}
          min={12}
          max={40}
          step={1}
          format={(v) => `${money(v)}/hr`}
          onChange={setWage}
        />
        <NumberField
          label="Answering service rate"
          hint="Typical per-call rate charged by a live answering service"
          value={answeringRate}
          min={0.5}
          max={5}
          step={0.05}
          format={(v) => `$${v.toFixed(2)}/call`}
          onChange={setAnsweringRate}
        />
        <NumberField
          label="Per-minute AI rate"
          hint="What usage-billed AI phone services typically charge"
          value={aiRate}
          min={0.05}
          max={1}
          step={0.01}
          format={(v) => `$${v.toFixed(2)}/min`}
          onChange={setAiRate}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 14 }}>
          Estimated monthly cost
        </div>
        <div style={{ display: "grid", gap: 14 }} role="img" aria-label={bars.map((b) => `${b.label}: ${money(b.value)} per month`).join(", ")}>
          {bars.map((b) => {
            const isCheapest = b.label === cheapest.label;
            const widthPct = Math.max(8, (b.value / maxValue) * 100);
            return (
              <div key={b.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  <span>
                    {b.label} {isCheapest && <span style={{ color: GREEN, fontSize: 12 }}>— cheapest</span>}
                  </span>
                </div>
                <div style={{ position: "relative", height: 30, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${widthPct}%`,
                      background: b.tone,
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      paddingRight: 10,
                      boxSizing: "border-box",
                      border: isCheapest ? `2px solid ${INK}` : "none",
                    }}
                  >
                    {widthPct > 22 && (
                      <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{money(b.value)}/mo</span>
                    )}
                  </div>
                  {widthPct <= 22 && (
                    <span
                      style={{
                        position: "absolute",
                        left: `calc(${widthPct}% + 8px)`,
                        top: "50%",
                        transform: "translateY(-50%)",
                        fontWeight: 800,
                        fontSize: 13,
                        color: b.tone,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {money(b.value)}/mo
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {monthlySavings > 0 && (
        <p style={{ margin: "16px 0 0", fontSize: 14.5, fontWeight: 700, color: GREEN }}>
          You&apos;d save ~{money(monthlySavings)}/mo vs a human receptionist.
        </p>
      )}

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> a human receptionist's needed coverage is estimated from your call volume — total
          talk-time (calls × minutes) × 3 to account for idle time between calls, floored at 40 hours/month and capped at
          160 hours (one full-time month).
        </p>
        <p style={{ margin: 0 }}>
          <strong>SeldonFrame</strong> is $29/mo flat for the platform — you connect your own Twilio and AI provider keys
          at raw provider cost, typically a few cents per minute, instead of paying a per-call or per-minute markup.
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card comparing receptionist costs" />
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
