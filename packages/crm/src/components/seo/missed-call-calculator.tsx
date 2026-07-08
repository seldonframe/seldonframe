"use client";

// The missed-call cost calculator — the interactive island of
// /tools/missed-call-calculator. Pure client math, no network calls: sliders →
// lost-revenue estimate → CTA. Styled on the MKT palette to match the SEO pages.

import { useState, type ReactElement, type CSSProperties } from "react";

const INK = "#221D17";
const GREEN = "#00897B";
const INK10 = "rgba(34,29,23,0.10)";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function MissedCallCalculator(): ReactElement {
  const [missedPerWeek, setMissedPerWeek] = useState(10);
  const [closeRate, setCloseRate] = useState(30);
  const [jobValue, setJobValue] = useState(400);

  // 4.33 weeks/month; a missed call only costs you if it would have closed.
  const lostMonthly = Math.round(missedPerWeek * 4.33 * (closeRate / 100) * jobValue);
  const lostYearly = lostMonthly * 12;
  const recoveredMonthly = Math.round(lostMonthly * 0.8); // answered ≠ 100% saved; be conservative.

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
      <p style={{ margin: "16px 0 0", fontSize: 12.5, color: "rgba(34,29,23,0.55)", lineHeight: 1.5 }}>
        *Assumes ~80% of missed calls get answered, qualified and booked or texted back by an AI receptionist that picks up
        24/7. SeldonFrame is $29/mo flat — at these numbers it pays for itself with{" "}
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
