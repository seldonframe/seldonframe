"use client";

// The speed-to-lead calculator — the interactive island of
// /tools/speed-to-lead-calculator. Pure client math, no network calls:
// leads + how fast you reply + deal value → revenue left on the table by slow
// follow-up, and what instant (AI) response recovers. Styled on the MKT palette
// to match the other /tools calculators; reuses the shared result-card canvas.

import { useState, useEffect, useRef, type ReactElement, type CSSProperties } from "react";

import {
  renderResultCard,
  buildShareUrl,
  copyToClipboard,
  downloadCanvasAsImage,
  shareResultCard,
} from "./result-card";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const RED = "#C0392B";
const AMBER = "#B8860B";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// Response-time buckets and a relative "reach & qualify" factor vs. replying in
// under 5 minutes (= 1.00). The steep drop after the first few minutes is a
// well-documented pattern in lead-response research (the "5-minute rule"); the
// exact factors here are a conservative, illustrative model — NOT a claim about
// any single study's numbers. Real results vary by business.
const BUCKETS: { label: string; short: string; factor: number }[] = [
  { label: "Under 5 minutes", short: "<5 min", factor: 1.0 },
  { label: "5–30 minutes", short: "5–30 min", factor: 0.75 },
  { label: "30–60 minutes", short: "30–60 min", factor: 0.55 },
  { label: "1–4 hours", short: "1–4 hr", factor: 0.4 },
  { label: "4–24 hours", short: "4–24 hr", factor: 0.25 },
  { label: "More than a day", short: "1+ day", factor: 0.12 },
];

const BOUNDS = {
  leadsPerMonth: { min: 5, max: 1000 },
  dealValue: { min: 100, max: 5000 },
  baseClose: { min: 5, max: 60 },
  bucket: { min: 0, max: BUCKETS.length - 1 },
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseNum(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function SpeedToLeadCalculator(): ReactElement {
  const [leadsPerMonth, setLeadsPerMonth] = useState(50);
  const [dealValue, setDealValue] = useState(500);
  const [baseClose, setBaseClose] = useState(30);
  const [bucketIdx, setBucketIdx] = useState(3); // default: 1–4 hours
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from URL on mount only (never during SSR).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const lm = parseNum(params, "lm");
    if (lm !== undefined) setLeadsPerMonth(clamp(lm, BOUNDS.leadsPerMonth.min, BOUNDS.leadsPerMonth.max));
    const dv = parseNum(params, "dv");
    if (dv !== undefined) setDealValue(clamp(dv, BOUNDS.dealValue.min, BOUNDS.dealValue.max));
    const bc = parseNum(params, "bc");
    if (bc !== undefined) setBaseClose(clamp(bc, BOUNDS.baseClose.min, BOUNDS.baseClose.max));
    const rt = parseNum(params, "rt");
    if (rt !== undefined) setBucketIdx(clamp(Math.round(rt), BOUNDS.bucket.min, BOUNDS.bucket.max));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the address bar in sync (throttled) so the URL is a shareable permalink.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("lm", String(Math.round(leadsPerMonth)));
      params.set("dv", String(Math.round(dealValue)));
      params.set("bc", String(Math.round(baseClose)));
      params.set("rt", String(bucketIdx));
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [leadsPerMonth, dealValue, baseClose, bucketIdx]);

  const factor = BUCKETS[bucketIdx].factor;
  const closedFast = leadsPerMonth * (baseClose / 100); // deals if you reply in <5 min
  const closedNow = closedFast * factor; // deals at the current response time
  const revenueFast = Math.round(closedFast * dealValue);
  const revenueNow = Math.round(closedNow * dealValue);
  const lostMonthly = Math.max(0, revenueFast - revenueNow);
  const lostYearly = lostMonthly * 12;

  const barMax = Math.max(revenueFast, 1);
  const barWidth = (v: number) => `${Math.max(6, Math.round((v / barMax) * 100))}%`;

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
        headline: "Slow lead follow-up is costing this business",
        bigNumber: `${money(lostMonthly)}/mo`,
        subline: `${leadsPerMonth} leads/mo · replying in ${BUCKETS[bucketIdx].short} vs. under 5 min`,
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [lostMonthly, leadsPerMonth, bucketIdx]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "speed-to-lead-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "Slow lead follow-up is costing this business",
      text: `We're leaving ~${money(lostMonthly)}/mo on the table by replying to leads too slowly.`,
      url,
      filename: "speed-to-lead-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <Slider
          label="New leads per month"
          hint="Calls, form fills, texts, DMs — anyone who reaches out"
          value={leadsPerMonth}
          min={BOUNDS.leadsPerMonth.min}
          max={BOUNDS.leadsPerMonth.max}
          step={5}
          format={(v) => `${v} leads`}
          onChange={setLeadsPerMonth}
        />
        <Slider
          label="How fast you reply on average"
          hint="From when a lead reaches out to your first real response"
          value={bucketIdx}
          min={BOUNDS.bucket.min}
          max={BOUNDS.bucket.max}
          step={1}
          format={(v) => BUCKETS[v].label}
          onChange={(v) => setBucketIdx(Math.round(v))}
        />
        <Slider
          label="Close rate when you reply fast"
          hint="Your best-case close rate on leads you reach quickly"
          value={baseClose}
          min={BOUNDS.baseClose.min}
          max={BOUNDS.baseClose.max}
          step={5}
          format={(v) => `${v}%`}
          onChange={setBaseClose}
        />
        <Slider
          label="Average deal / job value"
          hint="What a typical won customer is worth"
          value={dealValue}
          min={BOUNDS.dealValue.min}
          max={BOUNDS.dealValue.max}
          step={50}
          format={(v) => money(v)}
          onChange={setDealValue}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Stat label="Revenue you win now" value={`${money(revenueNow)}/mo`} tone="amber" />
        <Stat label="Revenue if you replied in <5 min" value={`${money(revenueFast)}/mo`} tone="green" />
        <Stat label="Left on the table / month" value={money(lostMonthly)} tone="red" />
      </div>

      <div
        role="img"
        aria-label={`At ${BUCKETS[bucketIdx].label} response time you win about ${money(revenueNow)} a month; replying in under 5 minutes could win about ${money(revenueFast)} — a gap of about ${money(lostMonthly)} a month.`}
        style={{ marginTop: 26, display: "grid", gap: 10 }}
      >
        <FunnelBar emoji="⚡" label="If you replied in <5 min" value={`${money(revenueFast)}/mo`} width={barWidth(revenueFast)} color={GREEN} />
        <FunnelBar emoji="🐌" label={`At ${BUCKETS[bucketIdx].short}`} value={`${money(revenueNow)}/mo`} width={barWidth(revenueNow)} color={AMBER} />
        <FunnelBar emoji="💸" label="Lost to slow follow-up" value={`${money(lostMonthly)}/mo`} width={barWidth(lostMonthly)} color={RED} />
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 700, color: GREEN }}>
        An AI that answers instantly, 24/7, closes this gap.
      </p>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
        *Illustrative model based on the widely-documented &ldquo;5-minute rule&rdquo; in lead-response research: the odds of
        reaching and qualifying a lead drop sharply the longer you wait. The factors here are a conservative estimate, not a
        specific study&rsquo;s numbers — your real results will vary. SeldonFrame is $29/mo flat and responds the instant a
        lead comes in.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Respond in seconds — start free
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing revenue lost to slow lead follow-up" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14, alignItems: "center" }}>
          <button type="button" onClick={handleDownload} style={btnStyle}>
            ⬇ Download image
          </button>
          <button type="button" onClick={handleCopyLink} style={btnStyle}>
            🔗 {copyFeedback ?? "Copy link"}
          </button>
          {canShare && (
            <button type="button" onClick={handleNativeShare} style={btnStyle}>
              Share
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const btnStyle: CSSProperties = {
  border: `1.5px solid ${INK10}`,
  color: INK,
  padding: "10px 18px",
  borderRadius: 10,
  fontWeight: 700,
  fontSize: 14,
  background: "rgba(255,255,255,0.6)",
  cursor: "pointer",
};

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

function FunnelBar({ emoji, label, value, width, color }: { emoji: string; label: string; value: string; width: string; color: string }): ReactElement {
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

function Stat({ label, value, tone }: { label: string; value: string; tone: "red" | "green" | "amber" }): ReactElement {
  const color = tone === "red" ? RED : tone === "amber" ? AMBER : GREEN;
  const box: CSSProperties = { border: `1px solid ${INK10}`, borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.6)" };
  return (
    <div style={box}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color }}>{value}</div>
    </div>
  );
}
