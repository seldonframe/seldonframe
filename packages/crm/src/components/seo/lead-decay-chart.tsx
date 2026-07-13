"use client";

// The Lead Decay Curve — interactive island of /charts/missed-revenue-decay.
// Plots the sourced, discrete lead-response-odds data points from
// lib/seo/lead-decay-data.ts, with an industry marker and a revenue-at-risk
// calculator using the same hedged-math conventions as the other /tools
// calculators (speed-to-lead-calculator.tsx, missed-call-calculator.tsx).

import { useMemo, useState, type CSSProperties, type ReactElement } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot, ResponsiveContainer } from "recharts";

import {
  DECAY_POINTS,
  INDUSTRY_MARKERS,
  SOURCES,
  computeRevenueAtRisk,
  indexAtMinutes,
  isGapSegment,
  type SourceKey,
} from "@/lib/seo/lead-decay-data";

const INK = "#221D17";
const GREEN = "#059669";
const INK10 = "rgba(34,29,23,0.10)";
const RED = "#C0392B";
const AMBER = "#B8860B";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// log-scale x positions so 5min -> 24h fits on one readable axis.
const chartData = DECAY_POINTS.map((p) => ({ ...p, logMinutes: Math.log10(p.minutes) }));

export function LeadDecayChart(): ReactElement {
  const [industrySlug, setIndustrySlug] = useState<string>(INDUSTRY_MARKERS[0].slug);
  const [leadsPerMonth, setLeadsPerMonth] = useState(50);
  const [avgJobValue, setAvgJobValue] = useState(500);
  const [baseClosePct, setBaseClosePct] = useState(30);

  const industry = INDUSTRY_MARKERS.find((i) => i.slug === industrySlug) ?? INDUSTRY_MARKERS[0];
  const markerIndex = indexAtMinutes(industry.typicalResponseMinutes);
  const markerLogMinutes = Math.log10(industry.typicalResponseMinutes);

  const result = useMemo(
    () =>
      computeRevenueAtRisk({
        leadsPerMonth,
        avgJobValue,
        baseCloseRate: baseClosePct / 100,
        currentResponseMinutes: industry.typicalResponseMinutes,
      }),
    [leadsPerMonth, avgJobValue, baseClosePct, industry.typicalResponseMinutes],
  );

  // Split into solid segments (sourced adjacency) and dashed segments (a gap
  // in the literature) so recharts renders two distinct <Line> series rather
  // than implying one continuously-measured curve.
  const solidSegments: { logMinutes: number; index: number }[][] = [];
  const dashedSegments: { logMinutes: number; index: number }[][] = [];
  for (let i = 0; i < chartData.length - 1; i++) {
    const a = chartData[i];
    const b = chartData[i + 1];
    const pair = [
      { logMinutes: a.logMinutes, index: a.index },
      { logMinutes: b.logMinutes, index: b.index },
    ];
    if (isGapSegment(a.minutes, b.minutes)) dashedSegments.push(pair);
    else solidSegments.push(pair);
  }

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ height: 340, marginBottom: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 20, right: 24, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={INK10} vertical={false} />
            <XAxis
              dataKey="logMinutes"
              type="number"
              domain={[Math.log10(5), Math.log10(1440)]}
              ticks={chartData.map((p) => p.logMinutes)}
              tickFormatter={(v: number) => chartData.find((p) => Math.abs(p.logMinutes - v) < 0.001)?.label ?? ""}
              stroke={INK}
              fontSize={12}
              tick={{ fill: "rgba(34,29,23,0.7)" }}
            />
            <YAxis
              dataKey="index"
              type="number"
              domain={[0, 105]}
              stroke={INK}
              fontSize={12}
              tick={{ fill: "rgba(34,29,23,0.7)" }}
              label={{ value: "Relative odds of contact (indexed to 100)", angle: -90, position: "insideLeft", fontSize: 12, fill: "rgba(34,29,23,0.6)" }}
            />
            <Tooltip
              formatter={(value) => [`${value} / 100`, "Relative odds"] as [string, string]}
              labelFormatter={(v) => chartData.find((p) => Math.abs(p.logMinutes - Number(v)) < 0.001)?.label ?? ""}
            />
            {solidSegments.map((seg, i) => (
              <Line
                key={`solid-${i}`}
                data={seg}
                dataKey="index"
                xAxisId={0}
                yAxisId={0}
                type="linear"
                stroke={GREEN}
                strokeWidth={3}
                dot={{ r: 5, fill: GREEN }}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
            {dashedSegments.map((seg, i) => (
              <Line
                key={`dashed-${i}`}
                data={seg}
                dataKey="index"
                xAxisId={0}
                yAxisId={0}
                type="linear"
                stroke={AMBER}
                strokeWidth={2}
                strokeDasharray="6 6"
                dot={{ r: 5, fill: AMBER }}
                isAnimationActive={false}
                legendType="none"
              />
            ))}
            <ReferenceDot
              x={markerLogMinutes}
              y={markerIndex}
              r={7}
              fill={RED}
              stroke="#fff"
              strokeWidth={2}
              label={{ value: `avg ${industry.name} business`, position: "top", fill: RED, fontSize: 11, fontWeight: 700 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p style={{ margin: "0 0 20px", fontSize: 12, color: "rgba(34,29,23,0.55)" }}>
        <span style={{ color: GREEN, fontWeight: 700 }}>Solid</span> = sourced point-to-point comparison.{" "}
        <span style={{ color: AMBER, fontWeight: 700 }}>Dashed</span> = no data between these points — connecting line is illustrative only, not a
        measured curve.
      </p>

      <div style={{ display: "grid", gap: 22, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <label style={{ display: "block" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Your industry (illustrative placement)</div>
          <select
            value={industrySlug}
            onChange={(e) => setIndustrySlug(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${INK10}`, fontSize: 15, background: "#fff", color: INK }}
          >
            {INDUSTRY_MARKERS.map((i) => (
              <option key={i.slug} value={i.slug}>
                {i.name}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", marginTop: 6 }}>
            Illustrative average response window (~{industry.typicalResponseMinutes} min) — not a sourced per-industry benchmark; see the honesty note
            below.
          </div>
        </label>

        <Slider label="New leads per month" value={leadsPerMonth} min={5} max={1000} step={5} format={(v) => `${v} leads`} onChange={setLeadsPerMonth} />
        <Slider label="Average job value" value={avgJobValue} min={100} max={5000} step={50} format={(v) => money(v)} onChange={setAvgJobValue} />
        <Slider
          label="Close rate when you reply fast"
          value={baseClosePct}
          min={5}
          max={60}
          step={5}
          format={(v) => `${v}%`}
          onChange={setBaseClosePct}
        />
      </div>

      <div style={{ marginTop: 26, borderTop: `1px solid ${INK10}`, paddingTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <Stat label="Revenue you win now" value={`${money(result.revenueAtCurrentSpeed)}/mo`} tone="amber" />
        <Stat label="Revenue if you replied in ~5 min" value={`${money(result.revenueIfFast)}/mo`} tone="green" />
        <Stat label="Revenue at risk / month" value={money(result.revenueAtRiskMonthly)} tone="red" />
      </div>
      <p style={{ margin: "18px 0 0", fontSize: 15, fontWeight: 800, color: RED }}>
        At {industry.name}&rsquo;s typical response speed, about {money(result.revenueAtRiskYearly)}/year is at risk from slow follow-up.
      </p>

      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.6 }}>
        *Revenue-at-risk model: leads/month × close rate at your fastest response = deals if you always replied in ~5 minutes; the same figure scaled by
        the industry&rsquo;s relative-odds index above estimates deals at your current speed. The gap × average job value is the monthly figure. This is
        a transparent, stated model — not a specific study&rsquo;s prediction for your business.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <a href="/tools/speed-to-lead-calculator" style={{ background: INK, color: "#F6F2EA", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
          Run your own numbers
        </a>
        <a
          href="/tools/missed-call-calculator"
          style={{ border: `1.5px solid ${INK10}`, color: INK, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}
        >
          Fix missed calls
        </a>
      </div>

      <DataTable />
      <HonestyNote />
    </div>
  );
}

function DataTable(): ReactElement {
  return (
    <div style={{ marginTop: 32, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>The data points, with sources</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: `1.5px solid ${INK10}` }}>
              <th style={{ padding: "8px 10px" }}>Time since inquiry</th>
              <th style={{ padding: "8px 10px" }}>Relative odds (indexed to 100)</th>
              <th style={{ padding: "8px 10px" }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {DECAY_POINTS.map((p) => {
              const src = SOURCES[p.sourceKey as SourceKey];
              return (
                <tr key={p.minutes} style={{ borderBottom: `1px solid ${INK10}` }}>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{p.label}</td>
                  <td style={{ padding: "8px 10px" }}>{p.index}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" style={{ color: GREEN, fontWeight: 700 }}>
                      {src.label}
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HonestyNote(): ReactElement {
  return (
    <div style={{ marginTop: 24, borderTop: `1px solid ${INK10}`, paddingTop: 20 }}>
      <h2 style={{ margin: "0 0 10px", fontSize: 16, fontWeight: 800 }}>What this doesn&rsquo;t prove</h2>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7, color: "rgba(34,29,23,0.75)" }}>
        <li>This is <strong>correlational</strong> data, not a controlled experiment — it can&rsquo;t prove responding faster <em>causes</em> more sales for every business, only that faster responders connect and qualify more often in the studies measured.</li>
        <li>The underlying data is <strong>old</strong> — the Lead Response Management figures come from a multi-year study whose data collection predates 2011, and the Harvard Business Review analysis by the same researcher was published in 2011. Buyer behavior has changed since (more channels, more AI, more comparison shopping).</li>
        <li>The exact multipliers (4x, 21x, 6x) come from a <strong>single vendor-hosted study</strong> across six companies — not a peer-reviewed, replicated result. Treat the direction as reliable and the exact numbers as illustrative.</li>
        <li>The industry markers on this chart are an <strong>illustrative placement</strong>, not a sourced per-industry benchmark — see <a href="/guides/average-lead-response-time-by-industry" style={{ color: GREEN, fontWeight: 700 }}>our guide on why those numbers are unreliable</a>.</li>
      </ul>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
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
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: GREEN, marginTop: 8 }}
        aria-label={label}
      />
    </label>
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
