"use client";

// The Klaviyo cost calculator — the interactive island of
// /tools/klaviyo-cost-calculator. Pure client math, no network calls.
//
// Constants trace to the "klaviyo" entry in lib/seo/competitor-pricing.ts
// (registry, verified July 2026):
//   - Free: 250 active profiles, 500 email sends/mo, 150 SMS credits/mo
//   - Email: "from $20/mo (251-500 profiles), reported ~$100/mo at 5k,
//     ~$400/mo at 25k" — these three paid price POINTS (plus the free tier
//     at 250 profiles) are the only published anchors; everything between them is a LINEAR INTERPOLATION,
//     always marked "~" in the UI (see interpolateKlaviyoPrice below).
//   - SMS: "$0.01-$0.015 per US message" beyond the plan's SMS credit
//     allotment — this calculator uses the registry's hedged midpoint,
//     $0.0125/send, marked "~" everywhere.
//   - "Count suppressed/inactive profiles" toggle: the registry's gotcha —
//     Klaviyo bills on ACTIVE profiles, but many stores don't realize their
//     supprsessed/unsubscribed profiles are excluded, so the sticker price
//     they expect from total list size is an overestimate unless they know
//     to subtract them. This toggle adds ~20% to the profile count when on,
//     to model "what if my whole list counted" (rough, hedged, explained
//     inline — not a Klaviyo-published ratio).
//
// Styled on the MKT palette to match the other free-tool pages.

import { useState, useEffect, useRef, type ReactElement } from "react";

import { renderResultCard, buildShareUrl, copyToClipboard, downloadCanvasAsImage, shareResultCard } from "./result-card";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function moneyPrecise(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── URL-state schema ──────────────────────────────────────────────────
// Short keys: kp = profiles, ks = smsSends, ku = countSuppressed (1/0)

export interface KlaviyoCalcState {
  profiles: number;
  smsSends: number;
  countSuppressed: boolean;
}

export interface KlaviyoCalcBounds {
  profiles: { min: number; max: number };
  smsSends: { min: number; max: number };
}

export const KLAVIYO_CALC_BOUNDS: KlaviyoCalcBounds = {
  profiles: { min: 250, max: 100_000 },
  smsSends: { min: 0, max: 50_000 },
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

export function encodeKlaviyoCalcState(state: KlaviyoCalcState): string {
  const params = new URLSearchParams();
  params.set("kp", String(Math.round(state.profiles)));
  params.set("ks", String(Math.round(state.smsSends)));
  params.set("ku", state.countSuppressed ? "1" : "0");
  return params.toString();
}

export function decodeKlaviyoCalcState(search: string): Partial<KlaviyoCalcState> {
  const params = new URLSearchParams(search);
  const out: Partial<KlaviyoCalcState> = {};

  const kp = parseNum(params, "kp");
  if (kp !== undefined) out.profiles = clamp(kp, KLAVIYO_CALC_BOUNDS.profiles.min, KLAVIYO_CALC_BOUNDS.profiles.max);

  const ks = parseNum(params, "ks");
  if (ks !== undefined) out.smsSends = clamp(ks, KLAVIYO_CALC_BOUNDS.smsSends.min, KLAVIYO_CALC_BOUNDS.smsSends.max);

  const ku = params.get("ku");
  if (ku === "1" || ku === "0") out.countSuppressed = ku === "1";

  return out;
}

// ─── pure cost math ─────────────────────────────────────────────────────

/** The registry's three published price anchors: [profiles, $/mo]. */
const KLAVIYO_PRICE_POINTS: [number, number][] = [
  [250, 0],
  [500, 20],
  [5000, 100],
  [25_000, 400],
];

/**
 * Piecewise-linear interpolation across the registry's published price
 * points. Below the first point, returns the first point's price (free
 * tier). Above the last published point (25k), extrapolates the slope of
 * the last segment — Klaviyo's real Enterprise pricing beyond that is
 * quote-gated, so this is explicitly a rough estimate past 25k profiles.
 * Monotonic non-decreasing by construction (each segment slope >= 0).
 */
export function interpolateKlaviyoPrice(profiles: number): number {
  const pts = KLAVIYO_PRICE_POINTS;
  if (profiles <= pts[0][0]) return pts[0][1];

  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (profiles <= x1) {
      const t = (profiles - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }

  // Extrapolate past the last published point using the final segment's slope.
  const [x0, y0] = pts[pts.length - 2];
  const [x1, y1] = pts[pts.length - 1];
  const slope = (y1 - y0) / (x1 - x0);
  return y1 + slope * (profiles - x1);
}

/** Registry-hedged SMS per-send rate: midpoint of the reported $0.01-$0.015 range. */
export const KLAVIYO_SMS_RATE_HEDGED = 0.0125;

/** Rough uplift applied when "count suppressed/inactive profiles" is on — not a Klaviyo-published ratio. */
export const KLAVIYO_SUPPRESSED_UPLIFT = 0.2;

export interface KlaviyoCostResult {
  billableProfiles: number;
  emailMonthly: number;
  smsMonthly: number;
  monthlyTotal: number;
  yearlyTotal: number;
  doubledListMonthly: number;
}

export function computeKlaviyoCost(profiles: number, smsSends: number, countSuppressed: boolean): KlaviyoCostResult {
  const clampedProfiles = clamp(profiles, KLAVIYO_CALC_BOUNDS.profiles.min, KLAVIYO_CALC_BOUNDS.profiles.max);
  const clampedSms = clamp(smsSends, KLAVIYO_CALC_BOUNDS.smsSends.min, KLAVIYO_CALC_BOUNDS.smsSends.max);

  const billableProfiles = countSuppressed ? Math.round(clampedProfiles * (1 + KLAVIYO_SUPPRESSED_UPLIFT)) : clampedProfiles;

  const emailMonthly = interpolateKlaviyoPrice(billableProfiles);
  const smsMonthly = clampedSms * KLAVIYO_SMS_RATE_HEDGED;
  const monthlyTotal = emailMonthly + smsMonthly;
  const yearlyTotal = monthlyTotal * 12;

  // 2x list size, same SMS volume — for the "your bill grows with your list" bar.
  const doubledEmail = interpolateKlaviyoPrice(billableProfiles * 2);
  const doubledListMonthly = doubledEmail + smsMonthly;

  return {
    billableProfiles,
    emailMonthly: Math.round(emailMonthly),
    smsMonthly: Math.round(smsMonthly * 100) / 100,
    monthlyTotal: Math.round(monthlyTotal * 100) / 100,
    yearlyTotal: Math.round(yearlyTotal),
    doubledListMonthly: Math.round(doubledListMonthly),
  };
}

export function KlaviyoCostCalculator(): ReactElement {
  const [profiles, setProfiles] = useState(5000);
  const [smsSends, setSmsSends] = useState(1000);
  const [countSuppressed, setCountSuppressed] = useState(false);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeKlaviyoCalcState(window.location.search);
    if (decoded.profiles !== undefined) setProfiles(decoded.profiles);
    if (decoded.smsSends !== undefined) setSmsSends(decoded.smsSends);
    if (decoded.countSuppressed !== undefined) setCountSuppressed(decoded.countSuppressed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeKlaviyoCalcState({ profiles, smsSends, countSuppressed });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [profiles, smsSends, countSuppressed]);

  const result = computeKlaviyoCost(profiles, smsSends, countSuppressed);
  const growthPct = result.monthlyTotal > 0 ? Math.round(((result.doubledListMonthly - result.monthlyTotal) / result.monthlyTotal) * 100) : 0;
  const maxBar = Math.max(result.monthlyTotal, result.doubledListMonthly, 1);

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
        headline: "What Klaviyo really costs per month",
        bigNumber: `~${money(result.monthlyTotal)}/mo`,
        subline: `~${result.billableProfiles.toLocaleString("en-US")} profiles · ${money(result.yearlyTotal)}/yr`,
        rows: [
          { label: "Email plan (interpolated)", value: `~${money(result.emailMonthly)}/mo` },
          { label: "SMS (hedged rate)", value: `~${moneyPrecise(result.smsMonthly)}/mo` },
          { label: "SeldonFrame", value: "$29/mo flat" },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [result.monthlyTotal, result.billableProfiles, result.yearlyTotal, result.emailMonthly, result.smsMonthly]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "klaviyo-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "What Klaviyo really costs per month",
      text: `My Klaviyo setup works out to ~${money(result.monthlyTotal)}/mo.`,
      url,
      filename: "klaviyo-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <NumberField
          label="Active profiles"
          hint="People currently subscribed and engaged — Klaviyo bills on this number, not your total list"
          value={profiles}
          min={KLAVIYO_CALC_BOUNDS.profiles.min}
          max={KLAVIYO_CALC_BOUNDS.profiles.max}
          step={250}
          format={(v) => `${v.toLocaleString("en-US")} profiles`}
          onChange={setProfiles}
        />
        <NumberField
          label="Monthly SMS sends"
          hint="Texts sent per month beyond your plan's included SMS credits"
          value={smsSends}
          min={KLAVIYO_CALC_BOUNDS.smsSends.min}
          max={KLAVIYO_CALC_BOUNDS.smsSends.max}
          step={100}
          format={(v) => `${v.toLocaleString("en-US")} sends`}
          onChange={setSmsSends}
        />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontWeight: 700, fontSize: 14.5 }}>
          <input
            type="checkbox"
            checked={countSuppressed}
            onChange={(e) => setCountSuppressed(e.target.checked)}
            aria-label="Count suppressed and inactive profiles toward my list size"
            style={{ width: 18, height: 18, accentColor: GREEN, marginTop: 2 }}
          />
          <span>
            Count suppressed/inactive profiles too
            <div style={{ fontWeight: 500, fontSize: 12.5, color: "rgba(34,29,23,0.55)", marginTop: 2 }}>
              Klaviyo only bills <strong>active</strong> profiles — but most stores' full contact list includes unsubscribed
              and inactive people too. Toggling this adds ~20% to model your whole list, not just what Klaviyo counts.
            </div>
          </span>
        </label>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 6 }}>
          Estimated monthly cost
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: GREEN }}>~{money(result.monthlyTotal)}/mo</div>
        <div style={{ fontSize: 13, color: "rgba(34,29,23,0.6)", marginTop: 4 }}>
          ~{money(result.yearlyTotal)}/yr · billed on ~{result.billableProfiles.toLocaleString("en-US")} active profiles
        </div>

        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 12px", background: "rgba(34,29,23,0.04)", borderRadius: 8 }}>
            <span>Email plan (~interpolated from Klaviyo's published price points)</span>
            <span style={{ fontWeight: 700 }}>~{money(result.emailMonthly)}/mo</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 12px", background: "rgba(34,29,23,0.04)", borderRadius: 8 }}>
            <span>SMS (~hedged at {moneyPrecise(KLAVIYO_SMS_RATE_HEDGED)}/send)</span>
            <span style={{ fontWeight: 700 }}>~{moneyPrecise(result.smsMonthly)}/mo</span>
          </div>
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 10 }}>
            Your bill grows with your list
          </div>
          <div style={{ display: "grid", gap: 10 }} role="img" aria-label={`Current list: ${money(result.monthlyTotal)} per month. Double the list: ${money(result.doubledListMonthly)} per month.`}>
            <BarRow label="At your current list size" value={result.monthlyTotal} maxValue={maxBar} tone={GREEN} />
            <BarRow label="If your list doubled" value={result.doubledListMonthly} maxValue={maxBar} tone={AMBER} />
          </div>
          {growthPct > 0 && (
            <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "rgba(34,29,23,0.65)" }}>
              Doubling your list grows your bill by ~{growthPct}% — flat-rate plans don&apos;t do this.
            </p>
          )}
        </div>
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> the email plan cost is <strong>~interpolated</strong> between Klaviyo's published
          price points ($0 at 250, $20/mo at 500, ~$100/mo at 5,000, ~$400/mo at 25,000 profiles) — Klaviyo doesn't
          publish a formula, so between and beyond these points is an estimate. SMS is billed per-send beyond your
          plan's included credits, hedged at ~{moneyPrecise(KLAVIYO_SMS_RATE_HEDGED)}/message (Klaviyo's reported range
          is $0.01-$0.015).
        </p>
        <p style={{ margin: 0 }}>
          <strong>SeldonFrame:</strong> $29/mo flat — {money(SELDONFRAME_YEARLY)}/yr, same price no matter how big your
          list gets. Different product scope (Seldon is a front office with CRM/booking/agent, not ecommerce email
          marketing) — so weigh this as "what flat pricing looks like," not a like-for-like swap.
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing Klaviyo monthly cost" />
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

const SELDONFRAME_YEARLY = 29 * 12;

function BarRow({ label, value, maxValue, tone }: { label: string; value: number; maxValue: number; tone: string }): ReactElement {
  const widthPct = Math.max(8, (value / maxValue) * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        <span>{label}</span>
      </div>
      <div style={{ position: "relative", height: 30, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${widthPct}%`,
            background: tone,
            borderRadius: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 10,
            boxSizing: "border-box",
          }}
        >
          {widthPct > 22 && <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>~{money(value)}/mo</span>}
        </div>
        {widthPct <= 22 && (
          <span style={{ position: "absolute", left: `calc(${widthPct}% + 8px)`, top: "50%", transform: "translateY(-50%)", fontWeight: 800, fontSize: 13, color: tone, whiteSpace: "nowrap" }}>
            ~{money(value)}/mo
          </span>
        )}
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
