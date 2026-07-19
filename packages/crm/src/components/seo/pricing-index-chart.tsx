"use client";

// The interactive island of /charts/crm-pricing-index — the CRM Pricing
// Index. Pure React + inline SVG, no chart library. Reads
// lib/seo/pricing-index.ts (a pure data-transform module) to turn the
// verified competitor-pricing registry into a business-size-driven chart:
// stepped contact/seat presets on the X axis, estimated monthly cost on the
// Y axis, one point per vendor, a clickable legend, and a hover tooltip with
// the sourced number + "as listed <date>" + a link back to the vendor's own
// pricing page. The SF band renders as a shaded region (Max's fairness
// rule — SF is never charted at its cheapest tier against a vendor's most
// expensive).

import { useMemo, useState, type ReactElement } from "react";
import {
  buildVendorSeries,
  sfBandForVendor,
  CONTACT_PRESETS,
  SEAT_PRESETS,
  SF_TIER_PRICES,
  type BusinessSize,
  type VendorSeries,
} from "@/lib/seo/pricing-index";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const INK50 = "rgba(34,29,23,0.5)";

// Distinct, colorblind-tolerant palette for up to 25 vendor lines — cycles if
// the registry ever grows past this length.
const PALETTE = [
  "#C0392B", "#2980B9", "#D68910", "#8E44AD", "#16A085",
  "#E67E22", "#2C3E50", "#C2185B", "#059669", "#7B241C",
  "#1A5276", "#B7950B", "#6C3483", "#117864", "#A04000",
  "#34495E", "#AD1457", "#047857", "#4A235A", "#943126",
  "#154360", "#9A7D0A", "#512E5F", "#0E6655", "#7E5109",
];

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const CHART_W = 760;
const CHART_H = 420;
const PAD_L = 64;
const PAD_R = 24;
const PAD_T = 20;
const PAD_B = 44;

export function PricingIndexChart(): ReactElement {
  const [contactIdx, setContactIdx] = useState(1); // default 2,000 contacts
  const [seatIdx, setSeatIdx] = useState(0); // default 1 seat
  const [visible, setVisible] = useState<Set<string> | null>(null); // null = defaults
  const [hover, setHover] = useState<{ slug: string; x: number; y: number } | null>(null);

  const size: BusinessSize = {
    contacts: CONTACT_PRESETS[contactIdx],
    seats: SEAT_PRESETS[seatIdx],
  };

  const series = useMemo(() => buildVendorSeries(size), [size.contacts, size.seats]);
  const sfBands = useMemo(
    () => series.map((s) => ({ slug: s.slug, band: sfBandForVendor(s.slug, size) })),
    [series, size.contacts, size.seats],
  );

  const isVisible = (slug: string, defaultVisible: boolean) => (visible ? visible.has(slug) : defaultVisible);

  function toggle(slug: string, defaultVisible: boolean) {
    setVisible((prev) => {
      const base = prev ?? new Set(series.filter((s) => s.defaultVisible).map((s) => s.slug));
      const next = new Set(base);
      const currentlyOn = prev ? prev.has(slug) : defaultVisible;
      if (currentlyOn) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  const shownSeries = series.filter((s) => isVisible(s.slug, s.defaultVisible));
  const maxCost = Math.max(
    SF_TIER_PRICES.agency_scale,
    ...shownSeries.flatMap((s) => s.points.map((p) => p.costMonthly ?? 0)),
    50,
  );
  const yMax = Math.ceil((maxCost * 1.15) / 50) * 50;

  const plotW = CHART_W - PAD_L - PAD_R;
  const plotH = CHART_H - PAD_T - PAD_B;

  const yToPx = (dollars: number) => PAD_T + plotH - (dollars / yMax) * plotH;
  // X axis: one evenly-spaced column per vendor point, ordered by cost so the
  // chart reads left (cheap) to right (expensive) at the current size.
  const ordered = [...shownSeries].sort((a, b) => (a.points[0].costMonthly ?? Infinity) - (b.points[0].costMonthly ?? Infinity));
  const xFor = (i: number) => PAD_L + (ordered.length <= 1 ? plotW / 2 : (i / (ordered.length - 1)) * plotW);

  // SF band — shown once, spanning the current vendor mix's tier range.
  const activeBands = sfBands.filter((b) => shownSeries.some((s) => s.slug === b.slug));
  const sfLow = activeBands.length > 0 ? Math.min(...activeBands.map((b) => b.band.low)) : SF_TIER_PRICES.builder;
  const sfHigh = activeBands.length > 0 ? Math.max(...activeBands.map((b) => b.band.high)) : SF_TIER_PRICES.agency_scale;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((f * yMax) / 10) * 10);

  return (
    <div>
      {/* ─── controls ─── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, marginBottom: 20 }}>
        <label style={{ flex: "1 1 260px", minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>
            Contacts: <span style={{ color: GREEN }}>{CONTACT_PRESETS[contactIdx].toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={0}
            max={CONTACT_PRESETS.length - 1}
            step={1}
            value={contactIdx}
            onChange={(e) => setContactIdx(Number(e.target.value))}
            style={{ width: "100%", accentColor: GREEN }}
            aria-label="Business size in contacts"
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: INK50, marginTop: 2 }}>
            {CONTACT_PRESETS.map((c) => (
              <span key={c}>{c.toLocaleString()}</span>
            ))}
          </div>
        </label>
        <label style={{ flex: "1 1 200px", minWidth: 180 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginBottom: 6 }}>
            Seats/users: <span style={{ color: GREEN }}>{SEAT_PRESETS[seatIdx]}</span>
          </div>
          <input
            type="range"
            min={0}
            max={SEAT_PRESETS.length - 1}
            step={1}
            value={seatIdx}
            onChange={(e) => setSeatIdx(Number(e.target.value))}
            style={{ width: "100%", accentColor: GREEN }}
            aria-label="Business size in seats"
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: INK50, marginTop: 2 }}>
            {SEAT_PRESETS.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </div>
        </label>
      </div>

      <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.55, color: INK50, maxWidth: 620 }}>
        SeldonFrame's shaded band (<strong style={{ color: GREEN }}>${sfLow}–${sfHigh}/mo</strong>) always shows the
        tier closest to what each visible vendor implies — a solo tool compares against Builder ($29), an agency
        reseller compares against the Agency ladder ($99–$299). We never chart our cheapest tier against a vendor's
        most expensive.
      </p>

      {/* ─── chart ─── */}
      <div style={{ overflowX: "auto", border: `1px solid ${INK10}`, borderRadius: 14, padding: 16, background: "rgba(255,255,255,0.6)" }}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width="100%" style={{ minWidth: 560, display: "block" }} role="img" aria-label="CRM monthly cost by vendor">
          {/* Y gridlines + labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yToPx(t)} y2={yToPx(t)} stroke={INK10} strokeWidth={1} />
              <text x={PAD_L - 8} y={yToPx(t) + 4} textAnchor="end" fontSize={11} fill={INK50}>
                {money(t)}
              </text>
            </g>
          ))}

          {/* SF fairness band */}
          <rect
            x={PAD_L}
            y={yToPx(sfHigh)}
            width={plotW}
            height={Math.max(0, yToPx(sfLow) - yToPx(sfHigh))}
            fill={GREEN}
            opacity={0.08}
          />
          <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yToPx(sfLow)} y2={yToPx(sfLow)} stroke={GREEN} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.6} />
          <line x1={PAD_L} x2={CHART_W - PAD_R} y1={yToPx(sfHigh)} y2={yToPx(sfHigh)} stroke={GREEN} strokeDasharray="4 3" strokeWidth={1.5} opacity={0.6} />
          <text x={CHART_W - PAD_R} y={yToPx(sfHigh) - 6} textAnchor="end" fontSize={11} fontWeight={700} fill={GREEN}>
            SeldonFrame ${sfLow}–${sfHigh}/mo
          </text>

          {/* vendor points */}
          {ordered.map((s, i) => {
            const point = s.points[0];
            const colorIdx = series.findIndex((v) => v.slug === s.slug);
            const color = PALETTE[colorIdx % PALETTE.length];
            const x = xFor(i);
            const isQuoteGated = point.quoteGated || point.costMonthly === null;
            const y = isQuoteGated ? yToPx(yMax * 0.94) : yToPx(point.costMonthly!);
            const isHovered = hover?.slug === s.slug;
            return (
              <g
                key={s.slug}
                onMouseEnter={() => setHover({ slug: s.slug, x, y })}
                onMouseLeave={() => setHover((h) => (h?.slug === s.slug ? null : h))}
                style={{ cursor: "pointer" }}
              >
                {isQuoteGated ? (
                  <circle cx={x} cy={y} r={isHovered ? 7 : 5.5} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 2" />
                ) : (
                  <circle cx={x} cy={y} r={isHovered ? 7 : 5.5} fill={color} stroke="#fff" strokeWidth={1.5} />
                )}
                <text x={x} y={CHART_H - PAD_B + 16} textAnchor="middle" fontSize={9.5} fill={INK50} transform={ordered.length > 8 ? `rotate(45 ${x} ${CHART_H - PAD_B + 16})` : undefined}>
                  {s.name}
                </text>
              </g>
            );
          })}
        </svg>

        {/* tooltip */}
        {hover &&
          (() => {
            const s = series.find((v) => v.slug === hover.slug);
            if (!s) return null;
            const point = s.points[0];
            return (
              <div
                role="tooltip"
                style={{
                  marginTop: 10,
                  padding: "10px 14px",
                  border: `1px solid ${INK10}`,
                  borderRadius: 10,
                  background: "#fff",
                  maxWidth: 420,
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>{s.name}</div>
                <div style={{ color: INK }}>
                  {point.quoteGated || point.costMonthly === null ? "Quote-gated — no public number" : money(point.costMonthly)}
                  {" · "}
                  <span style={{ color: INK50 }}>{point.verified}</span>
                </div>
                <div style={{ color: INK50, marginTop: 2 }}>{point.assumption}</div>
                <a href={point.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: GREEN, fontWeight: 700, fontSize: 12.5 }}>
                  View source pricing page →
                </a>
              </div>
            );
          })()}
      </div>

      {/* ─── legend ─── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {series.map((s) => {
          const colorIdx = series.findIndex((v) => v.slug === s.slug);
          const color = PALETTE[colorIdx % PALETTE.length];
          const on = isVisible(s.slug, s.defaultVisible);
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => toggle(s.slug, s.defaultVisible)}
              aria-pressed={on}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12.5,
                fontWeight: 600,
                color: on ? INK : INK50,
                border: `1px solid ${on ? color : INK10}`,
                borderRadius: 999,
                padding: "5px 11px",
                background: on ? `${color}14` : "transparent",
                cursor: "pointer",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? color : INK10, display: "inline-block" }} />
              {s.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
