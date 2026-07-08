"use client";

// The missed-call cost calculator — the interactive island of
// /tools/missed-call-calculator. Pure client math, no network calls: sliders →
// lost-revenue estimate → CTA. Styled on the MKT palette to match the SEO pages.

import { useState, useEffect, useRef, type ReactElement, type CSSProperties } from "react";

import {
  encodeMissedCallState,
  decodeMissedCallState,
  renderResultCard,
  buildShareUrl,
  copyToClipboard,
  downloadCanvasAsImage,
  shareResultCard,
} from "./result-card";

const INK = "#221D17";
const GREEN = "#00897B";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function MissedCallCalculator(): ReactElement {
  const [missedPerWeek, setMissedPerWeek] = useState(10);
  const [closeRate, setCloseRate] = useState(30);
  const [jobValue, setJobValue] = useState(400);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from the URL on mount only — never during SSR (no `window`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeMissedCallState(window.location.search);
    if (decoded.missedPerWeek !== undefined) setMissedPerWeek(decoded.missedPerWeek);
    if (decoded.jobValue !== undefined) setJobValue(decoded.jobValue);
    if (decoded.closeRate !== undefined) setCloseRate(decoded.closeRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the address bar in sync with the current inputs (throttled) so the
  // URL is always a shareable permalink of whatever's on screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeMissedCallState({ missedPerWeek, jobValue, closeRate });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [missedPerWeek, jobValue, closeRate]);

  // 4.33 weeks/month; a missed call only costs you if it would have closed.
  const lostMonthly = Math.round(missedPerWeek * 4.33 * (closeRate / 100) * jobValue);
  const lostYearly = lostMonthly * 12;
  const recoveredMonthly = Math.round(lostMonthly * 0.8); // answered ≠ 100% saved; be conservative.

  // Money-leak funnel: calls you get (proxy = missed calls scaled up so the
  // "missed" bar always reads as a slice of it) → calls you miss → $ lost.
  // All three widths are relative to the largest bar so the shrink is honest
  // at any input combination, not hardcoded ratios.
  const callsPerMonth = Math.round(missedPerWeek * 4.33);
  const totalCallsProxy = Math.max(callsPerMonth * 2, callsPerMonth + 1); // assume at least half your calls go answered
  const funnelMax = totalCallsProxy;
  const barWidth = (v: number) => `${Math.max(6, Math.round((v / funnelMax) * 100))}%`;

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
        headline: "Missed calls are costing this business",
        bigNumber: `${money(lostMonthly)}/mo`,
        subline: `${callsPerMonth} missed calls/mo × ${money(jobValue)} avg job × ${closeRate}% close rate`,
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [lostMonthly, callsPerMonth, jobValue, closeRate]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "missed-call-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "Missed calls are costing this business",
      text: `We're losing ~${money(lostMonthly)}/mo to missed calls.`,
      url,
      filename: "missed-call-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <Slider
          label="Missed calls per week"
          hint="Rings that go to voicemail, after-hours calls, calls while you're on a job"
          value={missedPerWeek}
          min={1}
          max={60}
          step={1}
          format={(v) => `${v} calls`}
          onChange={setMissedPerWeek}
        />
        <Slider
          label="How many callers become customers"
          hint="Your normal close rate on inbound calls"
          value={closeRate}
          min={5}
          max={80}
          step={5}
          format={(v) => `${v}%`}
          onChange={setCloseRate}
        />
        <Slider
          label="Average job value"
          hint="What a typical booked job is worth"
          value={jobValue}
          min={50}
          max={5000}
          step={50}
          format={(v) => money(v)}
          onChange={setJobValue}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Stat label="Lost revenue / month" value={money(lostMonthly)} tone="red" />
        <Stat label="Lost revenue / year" value={money(lostYearly)} tone="red" />
        <Stat label="Recoverable with an AI receptionist*" value={`~${money(recoveredMonthly)}/mo`} tone="green" />
      </div>

      <div
        role="img"
        aria-label={`Money-leak funnel: about ${totalCallsProxy} calls a month, ${callsPerMonth} of them missed, worth about ${money(lostMonthly)} in lost revenue every month.`}
        style={{ marginTop: 26, display: "grid", gap: 10 }}
      >
        <FunnelBar emoji="📞" label="Calls you get" value={`~${totalCallsProxy}/mo`} width={barWidth(totalCallsProxy)} color={GREEN} />
        <FunnelBar emoji="📵" label="Calls you miss" value={`~${callsPerMonth}/mo`} width={barWidth(callsPerMonth)} color={AMBER} />
        <FunnelBar emoji="💸" label="Money walking away" value={`${money(lostMonthly)}/mo`} width={barWidth(Math.max(callsPerMonth * 0.35, funnelMax * 0.08))} color={RED} />
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 700, color: GREEN }}>
        An AI receptionist answers every one of these.
      </p>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
        *"Calls you get" is an estimate — we assume about half of your calls already get answered. Assumes ~80% of missed
        calls get answered, qualified and booked or texted back by an AI receptionist that picks up 24/7. SeldonFrame is $29/mo flat — at these numbers it pays for itself with{" "}
        <strong>
          {lostMonthly > 0 ? (jobValue * (closeRate / 100) >= 29 ? "the first saved call" : "a handful of saved calls") : "a single saved call"}
        </strong>
        .
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Stop missing calls — start free
        </a>
        <a
          href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
          style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
        >
          Book a demo call
        </a>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 12 }}>
          Share your result
        </div>
        <div style={{ borderRadius: 14, overflow: "hidden", border: `1px solid ${INK10}`, background: "#1F2B24", maxWidth: 640 }}>
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing the estimated monthly cost of missed calls" />
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

function Slider({
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

function FunnelBar({
  emoji,
  label,
  value,
  width,
  color,
}: {
  emoji: string;
  label: string;
  value: string;
  width: string;
  color: string;
}): ReactElement {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>
        <span>
          {emoji} {label}
        </span>
        <span style={{ color }}>{value}</span>
      </div>
      <div style={{ height: 18, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
        <div style={{ height: "100%", width, background: color, borderRadius: 8, transition: "width 0.2s ease" }} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "red" | "green" }): ReactElement {
  const color = tone === "red" ? "#C0392B" : GREEN;
  const box: CSSProperties = { border: `1px solid ${INK10}`, borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.6)" };
  return (
    <div style={box}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color }}>{value}</div>
    </div>
  );
}
