"use client";

// The no-show cost calculator — the interactive island of
// /tools/no-show-cost-calculator. Pure client math, no network calls: sliders →
// revenue-lost-to-no-shows estimate → CTA. Styled on the MKT palette to match
// the SEO pages. URL permalink state is kept LOCAL to this file (small
// parseNum/clamp helpers below) so the shared result-card module stays generic.

import { useState, useEffect, useRef, type ReactElement, type CSSProperties } from "react";

import {
  renderResultCard,
  buildShareUrl,
  copyToClipboard,
  downloadCanvasAsImage,
  shareResultCard,
} from "./result-card";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const RED = "#C0392B";
const AMBER = "#B8860B";

// ─── Local URL-state (kept out of the shared result-card module) ──────────
//
// Short, stable query keys so shared links stay compact:
//   na = appts/month, nr = no-show rate %, nv = avg appt value, nx = reduction %

interface NoShowState {
  apptsPerMonth: number;
  noShowRate: number;
  apptValue: number;
  reductionPct: number;
}

const BOUNDS = {
  apptsPerMonth: { min: 10, max: 600 },
  noShowRate: { min: 2, max: 40 },
  apptValue: { min: 20, max: 2000 },
  reductionPct: { min: 10, max: 70 },
} as const;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Parse a query param as a finite number, or return undefined if invalid/missing. */
function parseNum(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function encodeState(state: NoShowState): string {
  const params = new URLSearchParams();
  params.set("na", String(Math.round(state.apptsPerMonth)));
  params.set("nr", String(Math.round(state.noShowRate)));
  params.set("nv", String(Math.round(state.apptValue)));
  params.set("nx", String(Math.round(state.reductionPct)));
  return params.toString();
}

/**
 * Decode + clamp a query string into a partial state. Only present, numeric
 * keys are returned; out-of-range input is clamped to the slider bounds rather
 * than rejected, so a hand-edited URL never crashes the page.
 */
function decodeState(search: string): Partial<NoShowState> {
  const params = new URLSearchParams(search);
  const out: Partial<NoShowState> = {};

  const na = parseNum(params, "na");
  if (na !== undefined) out.apptsPerMonth = clamp(na, BOUNDS.apptsPerMonth.min, BOUNDS.apptsPerMonth.max);

  const nr = parseNum(params, "nr");
  if (nr !== undefined) out.noShowRate = clamp(nr, BOUNDS.noShowRate.min, BOUNDS.noShowRate.max);

  const nv = parseNum(params, "nv");
  if (nv !== undefined) out.apptValue = clamp(nv, BOUNDS.apptValue.min, BOUNDS.apptValue.max);

  const nx = parseNum(params, "nx");
  if (nx !== undefined) out.reductionPct = clamp(nx, BOUNDS.reductionPct.min, BOUNDS.reductionPct.max);

  return out;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function NoShowCostCalculator(): ReactElement {
  const [apptsPerMonth, setApptsPerMonth] = useState(200);
  const [noShowRate, setNoShowRate] = useState(15);
  const [apptValue, setApptValue] = useState(150);
  const [reductionPct, setReductionPct] = useState(40);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from the URL on mount only — never during SSR (no `window`).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeState(window.location.search);
    if (decoded.apptsPerMonth !== undefined) setApptsPerMonth(decoded.apptsPerMonth);
    if (decoded.noShowRate !== undefined) setNoShowRate(decoded.noShowRate);
    if (decoded.apptValue !== undefined) setApptValue(decoded.apptValue);
    if (decoded.reductionPct !== undefined) setReductionPct(decoded.reductionPct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the address bar in sync with the current inputs (throttled) so the
  // URL is always a shareable permalink of whatever's on screen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeState({ apptsPerMonth, noShowRate, apptValue, reductionPct });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [apptsPerMonth, noShowRate, apptValue, reductionPct]);

  // A no-show only costs you the value of the slot it burned.
  const noShowsPerMonth = Math.round(apptsPerMonth * (noShowRate / 100));
  const lostMonthly = Math.round(noShowsPerMonth * apptValue);
  const lostYearly = lostMonthly * 12;
  // Reminders + AI confirmations cut *some* no-shows, not all — the slider is
  // the recovery fraction the owner assumes.
  const recoveredMonthly = Math.round(lostMonthly * (reductionPct / 100));
  const recoveredYearly = recoveredMonthly * 12;

  // Money-leak funnel widths, all relative to the largest bar (appointments
  // booked) so the shrink is honest at any input combination.
  const funnelMax = Math.max(apptsPerMonth, 1);
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
        headline: "No-shows are costing this business",
        bigNumber: `${money(lostMonthly)}/mo`,
        subline: `${noShowsPerMonth} no-shows/mo × ${money(apptValue)} avg appointment (${noShowRate}% no-show rate)`,
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [lostMonthly, noShowsPerMonth, apptValue, noShowRate]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "no-show-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "No-shows are costing this business",
      text: `We're losing ~${money(lostMonthly)}/mo to no-shows.`,
      url,
      filename: "no-show-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <Slider
          label="Appointments booked per month"
          hint="Total bookings across your chairs, rooms or providers"
          value={apptsPerMonth}
          min={BOUNDS.apptsPerMonth.min}
          max={BOUNDS.apptsPerMonth.max}
          step={10}
          format={(v) => `${v} appts`}
          onChange={setApptsPerMonth}
        />
        <Slider
          label="No-show rate"
          hint="Booked appointments that never walk in. Industry reports commonly cite roughly 10–20% — dial in your own."
          value={noShowRate}
          min={BOUNDS.noShowRate.min}
          max={BOUNDS.noShowRate.max}
          step={1}
          format={(v) => `${v}%`}
          onChange={setNoShowRate}
        />
        <Slider
          label="Average appointment value"
          hint="What a typical booked appointment is worth to you"
          value={apptValue}
          min={BOUNDS.apptValue.min}
          max={BOUNDS.apptValue.max}
          step={10}
          format={(v) => money(v)}
          onChange={setApptValue}
        />
        <Slider
          label="With automated reminders + AI confirmations"
          hint="How much they cut no-shows. Results genuinely vary — set the recovery you'd expect."
          value={reductionPct}
          min={BOUNDS.reductionPct.min}
          max={BOUNDS.reductionPct.max}
          step={5}
          format={(v) => `−${v}% no-shows`}
          onChange={setReductionPct}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Stat label="Lost revenue / month" value={money(lostMonthly)} tone="red" />
        <Stat label="Lost revenue / year" value={money(lostYearly)} tone="red" />
        <Stat label="Recoverable with reminders + AI*" value={`~${money(recoveredMonthly)}/mo`} tone="green" />
      </div>

      <div
        role="img"
        aria-label={`Money-leak funnel: about ${apptsPerMonth} appointments booked a month, ${noShowsPerMonth} of them no-shows, worth about ${money(lostMonthly)} in lost revenue every month.`}
        style={{ marginTop: 26, display: "grid", gap: 10 }}
      >
        <FunnelBar emoji="📅" label="Appointments booked" value={`~${apptsPerMonth}/mo`} width={barWidth(apptsPerMonth)} color={GREEN} />
        <FunnelBar emoji="🚫" label="No-shows" value={`~${noShowsPerMonth}/mo`} width={barWidth(noShowsPerMonth)} color={AMBER} />
        <FunnelBar emoji="💸" label="Revenue walking away" value={`${money(lostMonthly)}/mo`} width={barWidth(Math.max(noShowsPerMonth * 0.35, funnelMax * 0.08))} color={RED} />
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 14.5, fontWeight: 700, color: GREEN }}>
        Automated reminders + AI confirmations win back an estimated {money(recoveredYearly)}/yr of this.
      </p>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
        *Recoverable assumes reminders + AI confirmations cut no-shows by the amount you set above — real results vary by
        business, so treat it as a planning estimate, not a guarantee. SeldonFrame is $29/mo flat — at these numbers it
        pays for itself with{" "}
        <strong>
          {recoveredMonthly > 0 ? (apptValue >= 29 ? "a single recovered appointment" : "a handful of recovered appointments") : "one recovered appointment"}
        </strong>
        .
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <a href="/signup" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Cut no-shows — start free
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing the estimated monthly cost of no-shows" />
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
  const color = tone === "red" ? RED : GREEN;
  const box: CSSProperties = { border: `1px solid ${INK10}`, borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.6)" };
  return (
    <div style={box}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color }}>{value}</div>
    </div>
  );
}
