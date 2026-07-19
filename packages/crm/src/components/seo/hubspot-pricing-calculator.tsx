"use client";

// The HubSpot pricing calculator — the interactive island of
// /tools/hubspot-pricing-calculator. Pure client math, no network calls.
//
// All constants below trace to the "hubspot" entry in
// lib/seo/competitor-pricing.ts (registry, verified July 2026):
//   - Starter: $15/mo per seat (annual; $20 monthly), 1,000 marketing contacts included
//   - Professional: starts at $800/mo for 3 core seats, 2,000 marketing contacts,
//     PLUS a required $3,000 one-time onboarding fee; extra seats $45/mo
//   - Enterprise: starts at $3,600/mo for 5 core seats, 10,000 marketing contacts,
//     PLUS a required $7,000 one-time onboarding fee; extra seats $75/mo
//   - Extra marketing contacts beyond the tier are "sold in blocks" per the
//     registry — HubSpot does not publish the exact block price/size, so the
//     per-1,000-contact overage rate used here is a HEDGED third-party estimate
//     (~$50-$100/mo per extra 1,000 contacts is commonly reported for
//     Professional/Enterprise tiers). Marked with "~" everywhere it appears.
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

// ─── URL-state schema ──────────────────────────────────────────────────
// Short keys: hc = contacts, hs = seats, ht = tier, ho = onboarding (1/0)

export type HubspotTier = "starter" | "professional" | "enterprise";

export interface HubspotCalcState {
  contacts: number;
  seats: number;
  tier: HubspotTier;
  onboarding: boolean;
}

export interface HubspotCalcBounds {
  contacts: { min: number; max: number };
  seats: { min: number; max: number };
}

export const HUBSPOT_CALC_BOUNDS: HubspotCalcBounds = {
  contacts: { min: 500, max: 100_000 },
  seats: { min: 1, max: 20 },
};

const HUBSPOT_TIERS: HubspotTier[] = ["starter", "professional", "enterprise"];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseNum(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function encodeHubspotCalcState(state: HubspotCalcState): string {
  const params = new URLSearchParams();
  params.set("hc", String(Math.round(state.contacts)));
  params.set("hs", String(Math.round(state.seats)));
  params.set("ht", state.tier);
  params.set("ho", state.onboarding ? "1" : "0");
  return params.toString();
}

export function decodeHubspotCalcState(search: string): Partial<HubspotCalcState> {
  const params = new URLSearchParams(search);
  const out: Partial<HubspotCalcState> = {};

  const hc = parseNum(params, "hc");
  if (hc !== undefined) out.contacts = clamp(hc, HUBSPOT_CALC_BOUNDS.contacts.min, HUBSPOT_CALC_BOUNDS.contacts.max);

  const hs = parseNum(params, "hs");
  if (hs !== undefined) out.seats = clamp(hs, HUBSPOT_CALC_BOUNDS.seats.min, HUBSPOT_CALC_BOUNDS.seats.max);

  const htRaw = params.get("ht");
  if (htRaw !== null && (HUBSPOT_TIERS as string[]).includes(htRaw)) out.tier = htRaw as HubspotTier;

  const hoRaw = params.get("ho");
  if (hoRaw === "1" || hoRaw === "0") out.onboarding = hoRaw === "1";

  return out;
}

// ─── pure cost math ─────────────────────────────────────────────────────

export interface HubspotBreakdownLine {
  label: string;
  amount: number;
}

export interface HubspotCostResult {
  monthlyCost: number;
  firstYearCost: number;
  onboardingFee: number;
  breakdown: HubspotBreakdownLine[];
  contactOverageHedged: boolean;
}

const TIER_INFO: Record<
  HubspotTier,
  {
    label: string;
    baseMonthly: number;
    baseSeats: number;
    baseContacts: number;
    extraSeatMonthly: number;
    onboardingFee: number;
    /** Hedged $/mo per extra 1,000 contacts beyond baseContacts — not published by HubSpot. */
    hedgedOveragePer1k: number;
  }
> = {
  starter: {
    label: "Starter",
    baseMonthly: 15, // per seat, annual billing
    baseSeats: 1,
    baseContacts: 1000,
    extraSeatMonthly: 15,
    onboardingFee: 0, // no mandatory onboarding fee on Starter per the registry
    hedgedOveragePer1k: 10,
  },
  professional: {
    label: "Professional",
    baseMonthly: 800,
    baseSeats: 3,
    baseContacts: 2000,
    extraSeatMonthly: 45,
    onboardingFee: 3000,
    hedgedOveragePer1k: 75,
  },
  enterprise: {
    label: "Enterprise",
    baseMonthly: 3600,
    baseSeats: 5,
    baseContacts: 10_000,
    extraSeatMonthly: 75,
    onboardingFee: 7000,
    hedgedOveragePer1k: 100,
  },
};

/**
 * Pure cost computation for a given tier/contacts/seats/onboarding combo.
 * Starter is priced per-seat (no separate base fee); Professional/Enterprise
 * bundle a fixed number of seats into the base price, then charge per extra
 * seat. Contact overage beyond the tier's included band is a HEDGED
 * per-1,000 rate (HubSpot sells overage in undisclosed blocks) — always
 * surfaced with contactOverageHedged: true when it's non-zero.
 */
export function computeHubspotCost(
  tier: HubspotTier,
  contacts: number,
  seats: number,
  includeOnboarding: boolean,
): HubspotCostResult {
  const info = TIER_INFO[tier];
  const clampedContacts = clamp(contacts, HUBSPOT_CALC_BOUNDS.contacts.min, HUBSPOT_CALC_BOUNDS.contacts.max);
  const clampedSeats = clamp(seats, HUBSPOT_CALC_BOUNDS.seats.min, HUBSPOT_CALC_BOUNDS.seats.max);

  const breakdown: HubspotBreakdownLine[] = [];
  let monthlyCost = 0;

  if (tier === "starter") {
    const seatCost = clampedSeats * info.baseMonthly;
    breakdown.push({ label: `${clampedSeats} seat${clampedSeats === 1 ? "" : "s"} @ ${money(info.baseMonthly)}/mo`, amount: seatCost });
    monthlyCost += seatCost;
  } else {
    breakdown.push({ label: `${info.label} base (${info.baseSeats} seats included)`, amount: info.baseMonthly });
    monthlyCost += info.baseMonthly;

    const extraSeats = Math.max(0, clampedSeats - info.baseSeats);
    if (extraSeats > 0) {
      const extraSeatCost = extraSeats * info.extraSeatMonthly;
      breakdown.push({ label: `${extraSeats} extra seat${extraSeats === 1 ? "" : "s"} @ ${money(info.extraSeatMonthly)}/mo`, amount: extraSeatCost });
      monthlyCost += extraSeatCost;
    }
  }

  const extraContacts = Math.max(0, clampedContacts - info.baseContacts);
  let contactOverageHedged = false;
  if (extraContacts > 0) {
    const blocks = Math.ceil(extraContacts / 1000);
    const overageCost = blocks * info.hedgedOveragePer1k;
    breakdown.push({ label: `~${blocks * 1000} extra contacts (hedged, ~${money(info.hedgedOveragePer1k)}/1k)`, amount: overageCost });
    monthlyCost += overageCost;
    contactOverageHedged = true;
  }

  const onboardingFee = includeOnboarding ? info.onboardingFee : 0;
  const firstYearCost = Math.round(monthlyCost * 12 + onboardingFee);

  return {
    monthlyCost: Math.round(monthlyCost),
    firstYearCost,
    onboardingFee,
    breakdown: breakdown.map((b) => ({ ...b, amount: Math.round(b.amount) })),
    contactOverageHedged,
  };
}

const SELDONFRAME_MONTHLY = 29;
const SELDONFRAME_YEARLY = SELDONFRAME_MONTHLY * 12;

export function HubspotPricingCalculator(): ReactElement {
  const [contacts, setContacts] = useState(2000);
  const [seats, setSeats] = useState(3);
  const [tier, setTier] = useState<HubspotTier>("professional");
  const [onboarding, setOnboarding] = useState(true);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeHubspotCalcState(window.location.search);
    if (decoded.contacts !== undefined) setContacts(decoded.contacts);
    if (decoded.seats !== undefined) setSeats(decoded.seats);
    if (decoded.tier !== undefined) setTier(decoded.tier);
    if (decoded.onboarding !== undefined) setOnboarding(decoded.onboarding);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeHubspotCalcState({ contacts, seats, tier, onboarding });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [contacts, seats, tier, onboarding]);

  const result = computeHubspotCost(tier, contacts, seats, onboarding);
  const yearlyVsSf = Math.max(0, result.firstYearCost - SELDONFRAME_YEARLY);

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
        headline: "What HubSpot really costs in year one",
        bigNumber: `${money(result.firstYearCost)}/yr`,
        subline: `${TIER_INFO[tier].label} · ${money(result.monthlyCost)}/mo${result.onboardingFee > 0 ? ` + ${money(result.onboardingFee)} onboarding` : ""}`,
        rows: [
          { label: "Monthly platform cost", value: `${money(result.monthlyCost)}/mo` },
          { label: "One-time onboarding", value: money(result.onboardingFee) },
          { label: "SeldonFrame", value: `${money(SELDONFRAME_MONTHLY)}/mo flat` },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [tier, result.firstYearCost, result.monthlyCost, result.onboardingFee]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "hubspot-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "What HubSpot really costs in year one",
      text: `HubSpot ${TIER_INFO[tier].label} works out to ~${money(result.firstYearCost)} in year one for my setup.`,
      url,
      filename: "hubspot-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <label style={{ display: "block" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Hub tier</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {HUBSPOT_TIERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                aria-pressed={tier === t}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: tier === t ? `2px solid ${GREEN}` : `1.5px solid ${INK10}`,
                  background: tier === t ? "rgba(31, 43, 36,0.08)" : "#fff",
                  color: INK,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {TIER_INFO[t].label}
              </button>
            ))}
          </div>
        </label>

        <NumberField
          label="Marketing contacts"
          hint="How many marketing contacts you'll have in HubSpot"
          value={contacts}
          min={HUBSPOT_CALC_BOUNDS.contacts.min}
          max={HUBSPOT_CALC_BOUNDS.contacts.max}
          step={500}
          format={(v) => `${v.toLocaleString("en-US")} contacts`}
          onChange={setContacts}
        />
        <NumberField
          label="Seats"
          hint="Number of users who need a HubSpot login"
          value={seats}
          min={HUBSPOT_CALC_BOUNDS.seats.min}
          max={HUBSPOT_CALC_BOUNDS.seats.max}
          step={1}
          format={(v) => `${v} seat${v === 1 ? "" : "s"}`}
          onChange={setSeats}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 14.5 }}>
          <input
            type="checkbox"
            checked={onboarding}
            onChange={(e) => setOnboarding(e.target.checked)}
            aria-label="Include mandatory Professional/Enterprise onboarding fee"
            style={{ width: 18, height: 18, accentColor: GREEN }}
          />
          Include mandatory onboarding fee ({tier === "enterprise" ? money(7000) : money(3000)} one-time, Professional/Enterprise only)
        </label>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 6 }}>
          Monthly cost
        </div>
        <div style={{ fontSize: 34, fontWeight: 800, color: GREEN }}>{money(result.monthlyCost)}/mo</div>
        <div style={{ fontSize: 13, color: "rgba(34,29,23,0.6)", marginTop: 4 }}>
          First-year total (onboarding amortized separately): <strong>{money(result.firstYearCost)}</strong>
          {result.onboardingFee > 0 && ` (includes ${money(result.onboardingFee)} one-time onboarding)`}
        </div>

        <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
          {result.breakdown.map((line) => (
            <div key={line.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "8px 12px", background: "rgba(34,29,23,0.04)", borderRadius: 8 }}>
              <span>{line.label}</span>
              <span style={{ fontWeight: 700 }}>{money(line.amount)}/mo</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> Starter is priced per seat with contacts pooled in bands; Professional and
          Enterprise bundle a fixed seat count into the base price, with extra seats billed separately. Contact-tier
          bands are <strong>~ hedged</strong> — HubSpot sells contact overage in undisclosed blocks, so the extra-contact
          line above is an estimate, not a published rate.
        </p>
        <p style={{ margin: "0 0 6px" }}>
          <strong>AI features</strong> (Breeze) are credits-metered on top of these tiers and not included in this
          calculator.
        </p>
        <p style={{ margin: 0 }}>
          <strong>SeldonFrame:</strong> $29/mo flat — {money(SELDONFRAME_YEARLY)}/yr. Different product scope (Seldon is a
          full front office — site, booking, CRM, AI agent — not a marketing-automation suite), so this isn't a
          feature-for-feature swap, but it's what a comparable flat-rate alternative costs.
        </p>
      </div>

      {yearlyVsSf > 0 && (
        <p style={{ margin: "16px 0 0", fontSize: 14.5, fontWeight: 700, color: AMBER }}>
          That's ~{money(yearlyVsSf)}/yr more than SeldonFrame's flat {money(SELDONFRAME_YEARLY)}/yr.
        </p>
      )}

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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing HubSpot first-year cost" />
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
