"use client";

// The AI receptionist cost calculator — the interactive island of
// /tools/ai-receptionist-cost-calculator. Pure client math, no network calls:
// inputs → four cost lines → a simple bar comparison. Styled on the MKT
// palette to match the other free-tool pages.

import { useState, type ReactElement } from "react";

const INK = "#221D17";
const GREEN = "#00897B";
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
        <div style={{ display: "grid", gap: 12 }}>
          {bars.map((b) => (
            <div key={b.label}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                <span>{b.label}</span>
                <span style={{ color: b.tone }}>{money(b.value)}/mo</span>
              </div>
              <div style={{ height: 12, borderRadius: 6, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.max(3, (b.value / maxValue) * 100)}%`,
                    background: b.tone,
                    borderRadius: 6,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

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
