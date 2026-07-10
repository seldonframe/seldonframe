"use client";

// The AI Front Office Chart island — a levels.io/the-everything-chart-style
// multi-line SVG chart of Max's subjective trend beliefs. Pure React + inline
// SVG, no chart library: clickable legend chips toggle lines, hover shows a
// tooltip, rising/declining filters narrow the set, and future-year segments
// render dashed and labeled "projection (opinion)". Below the chart: one
// card per visible trend with Max's take + a status badge.

import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { MKT } from "@/components/marketplace/marketplace-data";
import { TRENDS, DEFAULT_VISIBLE_KEYS, isProjection, type Trend, type TrendStatus } from "@/lib/seo/trend-chart-data";

const CHART_W = 900;
const CHART_H = 420;
const PAD_L = 44;
const PAD_R = 20;
const PAD_T = 24;
const PAD_B = 40;

const YEAR_MIN = 1998;
const YEAR_MAX = 2031;

function xForYear(year: number): number {
  const t = (year - YEAR_MIN) / (YEAR_MAX - YEAR_MIN);
  return PAD_L + t * (CHART_W - PAD_L - PAD_R);
}

function yForValue(value: number): number {
  const t = value / 100;
  return CHART_H - PAD_B - t * (CHART_H - PAD_T - PAD_B);
}

const STATUS_LABEL: Record<TrendStatus, string> = {
  rising: "Rising",
  peaking: "Peaking",
  declining: "Declining",
  reborn: "Reborn",
};

const STATUS_COLOR: Record<TrendStatus, string> = {
  rising: "#00897B",
  peaking: "#B8860B",
  declining: "#C0392B",
  reborn: "#5B8DEF",
};

function pathFor(trend: Trend, dashed: boolean): string {
  const pts = trend.points.filter((p) => (dashed ? isProjection(p) : !isProjection(p)));
  // Include the boundary point shared with the other segment so the two
  // paths connect visually instead of leaving a gap at the present year.
  if (dashed) {
    const solidPts = trend.points.filter((p) => !isProjection(p));
    const last = solidPts[solidPts.length - 1];
    if (last) pts.unshift(last);
  }
  if (pts.length < 2) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xForYear(p.year).toFixed(1)} ${yForValue(p.value).toFixed(1)}`).join(" ");
}

export function TrendChart(): ReactElement {
  const [visible, setVisible] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_KEYS));
  const [statusFilter, setStatusFilter] = useState<TrendStatus | "all">("all");
  const [hover, setHover] = useState<{ key: string; year: number; value: number; x: number; y: number } | null>(null);

  const shownTrends = useMemo(
    () => TRENDS.filter((t) => visible.has(t.key) && (statusFilter === "all" || t.status === statusFilter)),
    [visible, statusFilter],
  );

  function toggle(key: string): void {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applyStatusFilter(status: TrendStatus | "all"): void {
    setStatusFilter(status);
    if (status === "all") return;
    // Filtering by status also swaps the visible set to every trend of that
    // status, so the chips + chart + cards all agree with the filter.
    setVisible(new Set(TRENDS.filter((t) => t.status === status).map((t) => t.key)));
  }

  const yearTicks = [2000, 2005, 2010, 2015, 2020, 2026, 2031];

  return (
    <div>
      {/* ── filters ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {(["all", "rising", "declining"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => applyStatusFilter(s)}
            style={{
              border: `1.5px solid ${statusFilter === s ? MKT.green : MKT.ink10}`,
              background: statusFilter === s ? "rgba(0,137,123,0.1)" : "rgba(255,255,255,0.6)",
              color: statusFilter === s ? MKT.green : MKT.ink,
              borderRadius: 999,
              padding: "7px 16px",
              fontWeight: 700,
              fontSize: 13.5,
              cursor: "pointer",
            }}
          >
            {s === "all" ? "All trends" : s === "rising" ? "Only rising ↑" : "Only declining ↓"}
          </button>
        ))}
      </div>

      {/* ── legend chips ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {TRENDS.map((t) => {
          const on = visible.has(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggle(t.key)}
              aria-pressed={on}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                border: `1.5px solid ${on ? t.color : MKT.ink10}`,
                background: on ? `${t.color}1a` : "rgba(255,255,255,0.5)",
                color: on ? MKT.ink : "rgba(34,29,23,0.45)",
                borderRadius: 999,
                padding: "5px 12px 5px 8px",
                fontWeight: 600,
                fontSize: 12.5,
                cursor: "pointer",
              }}
            >
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: on ? t.color : "rgba(34,29,23,0.25)", flex: "0 0 auto" }} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── chart (horizontal scroll on mobile) ── */}
      <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.6)", padding: "16px 8px" }}>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} width={CHART_W} height={CHART_H} style={{ minWidth: 640, display: "block" }} role="img" aria-label="Trend chart of AI front-office adoption curves">
          {/* gridlines */}
          {[0, 25, 50, 75, 100].map((v) => (
            <line key={v} x1={PAD_L} x2={CHART_W - PAD_R} y1={yForValue(v)} y2={yForValue(v)} stroke={MKT.ink10} strokeWidth={1} />
          ))}
          {/* "now" marker */}
          <line x1={xForYear(2026)} x2={xForYear(2026)} y1={PAD_T} y2={CHART_H - PAD_B} stroke={MKT.ink10} strokeWidth={1.5} strokeDasharray="3 3" />
          <text x={xForYear(2026)} y={PAD_T - 8} fontSize={10.5} fontWeight={700} fill="rgba(34,29,23,0.45)" textAnchor="middle">
            now
          </text>

          {/* year axis */}
          {yearTicks.map((y) => (
            <text key={y} x={xForYear(y)} y={CHART_H - PAD_B + 20} fontSize={11} fill="rgba(34,29,23,0.5)" textAnchor="middle">
              {y}
            </text>
          ))}
          {/* value axis */}
          {[0, 50, 100].map((v) => (
            <text key={v} x={PAD_L - 10} y={yForValue(v) + 4} fontSize={10} fill="rgba(34,29,23,0.45)" textAnchor="end">
              {v}
            </text>
          ))}

          {shownTrends.map((t) => {
            const solidD = pathFor(t, false);
            const dashedD = pathFor(t, true);
            return (
              <g key={t.key}>
                {solidD && <path d={solidD} fill="none" stroke={t.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />}
                {dashedD && <path d={dashedD} fill="none" stroke={t.color} strokeWidth={2.5} strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />}
                {t.points.map((p) => (
                  <circle
                    key={p.year}
                    cx={xForYear(p.year)}
                    cy={yForValue(p.value)}
                    r={hover?.key === t.key && hover.year === p.year ? 5.5 : 3.5}
                    fill={t.color}
                    stroke="#fff"
                    strokeWidth={1.2}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={() => setHover({ key: t.key, year: p.year, value: p.value, x: xForYear(p.year), y: yForValue(p.value) })}
                    onMouseLeave={() => setHover(null)}
                  />
                ))}
                {t.annotations.map((a) => (
                  <line key={a.year} x1={xForYear(a.year)} x2={xForYear(a.year)} y1={PAD_T} y2={CHART_H - PAD_B} stroke={t.color} strokeWidth={1} strokeDasharray="2 4" opacity={0.35} />
                ))}
              </g>
            );
          })}

          {hover && (
            <g>
              <rect
                x={Math.min(Math.max(hover.x - 90, PAD_L), CHART_W - PAD_R - 180)}
                y={Math.max(hover.y - 54, PAD_T)}
                width={180}
                height={44}
                rx={8}
                fill={MKT.dark}
                opacity={0.95}
              />
              <text
                x={Math.min(Math.max(hover.x - 90, PAD_L), CHART_W - PAD_R - 180) + 10}
                y={Math.max(hover.y - 54, PAD_T) + 18}
                fontSize={11.5}
                fontWeight={700}
                fill="#F6F2EA"
              >
                {TRENDS.find((t) => t.key === hover.key)?.label} · {hover.year}
              </text>
              <text
                x={Math.min(Math.max(hover.x - 90, PAD_L), CHART_W - PAD_R - 180) + 10}
                y={Math.max(hover.y - 54, PAD_T) + 34}
                fontSize={11}
                fill="rgba(246,242,234,0.75)"
              >
                {(() => {
                  const t = TRENDS.find((tr) => tr.key === hover.key);
                  const pt = t?.points.find((p) => p.year === hover.year);
                  const projTag = pt && isProjection(pt) ? " (projection — opinion)" : "";
                  const nearestAnno = t?.annotations.find((a) => a.year === hover.year);
                  return nearestAnno ? nearestAnno.text : `Attention/adoption: ${hover.value}${projTag}`;
                })()}
              </text>
            </g>
          )}
        </svg>
      </div>
      <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.5)" }}>
        Dashed lines are projection — opinion, not a forecast model. Hover a point for detail.
      </p>

      {/* ── cards for visible trends ── */}
      <div style={{ display: "grid", gap: 14, marginTop: 28 }}>
        {shownTrends.map((t) => (
          <TrendCard key={t.key} trend={t} />
        ))}
        {shownTrends.length === 0 && (
          <p style={{ fontSize: 14.5, color: "rgba(34,29,23,0.55)" }}>No trends selected — click a chip above to add one.</p>
        )}
      </div>
    </div>
  );
}

function TrendCard({ trend }: { trend: Trend }): ReactElement {
  const badgeStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11.5,
    fontWeight: 800,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: STATUS_COLOR[trend.status],
    background: `${STATUS_COLOR[trend.status]}1a`,
    border: `1px solid ${STATUS_COLOR[trend.status]}40`,
    borderRadius: 999,
    padding: "3px 10px",
  };
  return (
    <div style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 14, padding: "16px 18px", background: "rgba(255,255,255,0.6)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: trend.color, flex: "0 0 auto" }} />
        <strong style={{ fontSize: 15.5 }}>{trend.label}</strong>
        <span style={badgeStyle}>{STATUS_LABEL[trend.status]}</span>
      </div>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(34,29,23,0.75)" }}>{trend.take}</p>
    </div>
  );
}
