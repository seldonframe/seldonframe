"use client";

// The agency profit margin calculator — the whitelabel pitch as a tool at
// /tools/agency-margin-calculator. Pure client math, no network calls:
// retainer x clients = revenue, minus tool-stack cost and labor cost = profit
// and margin %. Includes a 3-scenario preset row (GHL-style stack / typical
// SaaS stack / SeldonFrame stack) so the reader can compare their own
// retainer against different cost structures. Styled on the MKT palette.

import { useState, useEffect, useRef, type ReactElement } from "react";

import {
  encodeAgencyMarginState,
  decodeAgencyMarginState,
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
const BLUE = "#2E5F8A";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// ─── Pure math (exported for unit tests — no DOM, no network) ──────────

export interface AgencyMarginResult {
  revenue: number;
  toolCost: number;
  laborCost: number;
  profit: number;
  /** Margin as a percentage of revenue (0-100 scale, can go negative). */
  marginPct: number;
}

/**
 * Core margin math: revenue = retainer x clients. Costs = (tool-stack cost
 * per client x clients) + (hours per client x hourly rate x clients).
 * Profit = revenue - costs. marginPct = profit / revenue x 100 (0 when
 * revenue is 0, to avoid a divide-by-zero NaN).
 */
export function agencyMargin(input: {
  retainer: number;
  clients: number;
  stackCostPerClient: number;
  hoursPerClient: number;
  hourlyRate: number;
}): AgencyMarginResult {
  const clients = Math.max(0, input.clients);
  const revenue = input.retainer * clients;
  const toolCost = input.stackCostPerClient * clients;
  const laborCost = input.hoursPerClient * input.hourlyRate * clients;
  const profit = revenue - toolCost - laborCost;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;
  return { revenue, toolCost, laborCost, profit, marginPct };
}

export type StackPresetKey = "ghlStyle" | "typicalSaas" | "seldonframe";

export interface StackPreset {
  key: StackPresetKey;
  label: string;
  hint: string;
}

export const STACK_PRESETS: StackPreset[] = [
  { key: "ghlStyle", label: "GHL-style stack ~$150+", hint: "Base plan + AI Employee add-on + rebilled usage, stacked per client" },
  { key: "typicalSaas", label: "Typical SaaS stack ~$80", hint: "A typical multi-tool SaaS stack (CRM + scheduling + email) per client" },
  { key: "seldonframe", label: "SeldonFrame stack ~$3–10", hint: "Flat plan ($29 builder, up to $299 agency) ÷ clients, plus raw BYOK usage — no per-client software fee" },
];

/**
 * Resolve a preset key to a slider value for a given client count. GHL-style
 * and typical-SaaS are flat per-client estimates (hedged, "~" in the label).
 * SeldonFrame's is genuinely a function of client count — flat $29 (builder) to $299 (agency)
 * divided across clients, plus a small raw-usage estimate — since that's the
 * actual pitch: the per-client software cost shrinks as an agency adds
 * clients, unlike a per-seat/per-sub-account competitor stack.
 */
export function stackPresetCostPerClient(key: StackPresetKey, clients: number): number {
  const n = Math.max(1, clients);
  if (key === "ghlStyle") return 150;
  if (key === "typicalSaas") return 80;
  // seldonframe: $29/mo flat platform fee amortized across clients, plus a
  // hedged ~$5/client raw BYOK usage estimate (AI + telephony at cost).
  const flatAmortized = 29 / n;
  const rawUsageEstimate = 5;
  return Math.round((flatAmortized + rawUsageEstimate) * 100) / 100;
}

/** Margin scenario for each preset at the user's retainer/clients/labor
 *  inputs — used to draw the 3-bar comparison. */
export function marginByPreset(input: {
  retainer: number;
  clients: number;
  hoursPerClient: number;
  hourlyRate: number;
}): { preset: StackPreset; result: AgencyMarginResult }[] {
  return STACK_PRESETS.map((preset) => ({
    preset,
    result: agencyMargin({
      retainer: input.retainer,
      clients: input.clients,
      stackCostPerClient: stackPresetCostPerClient(preset.key, input.clients),
      hoursPerClient: input.hoursPerClient,
      hourlyRate: input.hourlyRate,
    }),
  }));
}

/** A real, commonly-cited "good" agency margin range for context copy. */
export const GOOD_MARGIN_RANGE = { min: 40, max: 60 };

export function AgencyMarginCalculator(): ReactElement {
  const [retainer, setRetainer] = useState(500);
  const [clients, setClients] = useState(10);
  const [stackCostPerClient, setStackCostPerClient] = useState(150);
  const [hoursPerClient, setHoursPerClient] = useState(3);
  const [hourlyRate, setHourlyRate] = useState(40);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeAgencyMarginState(window.location.search);
    if (decoded.retainer !== undefined) setRetainer(decoded.retainer);
    if (decoded.clients !== undefined) setClients(decoded.clients);
    if (decoded.stackCostPerClient !== undefined) setStackCostPerClient(decoded.stackCostPerClient);
    if (decoded.hoursPerClient !== undefined) setHoursPerClient(decoded.hoursPerClient);
    if (decoded.hourlyRate !== undefined) setHourlyRate(decoded.hourlyRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeAgencyMarginState({ retainer, clients, stackCostPerClient, hoursPerClient, hourlyRate });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [retainer, clients, stackCostPerClient, hoursPerClient, hourlyRate]);

  const result = agencyMargin({ retainer, clients, stackCostPerClient, hoursPerClient, hourlyRate });
  const scenarios = marginByPreset({ retainer, clients, hoursPerClient, hourlyRate });
  const maxScenarioProfit = Math.max(...scenarios.map((s) => Math.abs(s.result.profit)), 1);

  const losesMoney = result.profit < 0;

  // ─── Shareable result card ───
  // bigNumber = monthly profit when positive; when the retainer would lose
  // money at this cost structure, show the margin % instead so the card
  // still tells an honest, useful story ("this retainer loses money").
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
        headline: losesMoney ? "This retainer loses money at this cost structure" : "Agency profit margin",
        bigNumber: losesMoney ? `${result.marginPct.toFixed(0)}% margin` : `${money(result.profit)}/mo profit`,
        subline: `${clients} clients at ${money(retainer)}/mo retainer, ${result.marginPct.toFixed(0)}% margin`,
        rows: [
          { label: "Revenue", value: `${money(result.revenue)}/mo` },
          { label: "Tool + labor cost", value: `${money(result.toolCost + result.laborCost)}/mo` },
          { label: "Profit", value: `${money(result.profit)}/mo` },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [result.profit, result.revenue, result.toolCost, result.laborCost, result.marginPct, clients, retainer, losesMoney]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "agency-margin.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "Agency profit margin",
      text: losesMoney
        ? `At this cost structure my retainer loses money (${result.marginPct.toFixed(0)}% margin).`
        : `My agency margin works out to ~${money(result.profit)}/mo profit.`,
      url,
      filename: "agency-margin.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <NumberField
          label="Monthly retainer per client"
          hint="What you charge each client per month"
          value={retainer}
          min={100}
          max={2000}
          step={25}
          format={(v) => `${money(v)}/mo`}
          onChange={setRetainer}
        />
        <NumberField
          label="Number of clients"
          hint="How many clients you're running this retainer for"
          value={clients}
          min={1}
          max={100}
          step={1}
          format={(v) => `${v} client${v === 1 ? "" : "s"}`}
          onChange={setClients}
        />

        <label style={{ display: "block" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Tool-stack cost per client</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: GREEN, whiteSpace: "nowrap" }}>{money(stackCostPerClient)}/mo</span>
          </div>
          <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.55)", margin: "2px 0 10px" }}>
            What your software stack costs per client, per month
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {STACK_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                title={p.hint}
                onClick={() => setStackCostPerClient(stackPresetCostPerClient(p.key, clients))}
                style={{
                  border: `1.5px solid ${INK10}`,
                  color: INK,
                  padding: "8px 14px",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: 13,
                  background: "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={500}
            step={5}
            value={stackCostPerClient}
            onChange={(e) => setStackCostPerClient(Number(e.target.value))}
            style={{ width: "100%", accentColor: GREEN }}
            aria-label="Tool-stack cost per client"
          />
        </label>

        <NumberField
          label="Hours per client per month"
          hint="Fulfillment/management time you spend per client"
          value={hoursPerClient}
          min={0}
          max={40}
          step={0.5}
          format={(v) => `${v} hrs`}
          onChange={setHoursPerClient}
        />
        <NumberField
          label="Your hourly rate"
          hint="What your time is worth (or what you pay staff) per hour"
          value={hourlyRate}
          min={10}
          max={200}
          step={5}
          format={(v) => `${money(v)}/hr`}
          onChange={setHourlyRate}
        />
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)" }}>
          {losesMoney ? "This retainer loses money" : "Monthly profit"}
        </div>
        <div style={{ fontSize: 34, fontWeight: 900, color: losesMoney ? RED : GREEN, margin: "6px 0 4px" }}>
          {losesMoney ? `${result.marginPct.toFixed(0)}% margin` : `${money(result.profit)}/mo`}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(34,29,23,0.6)" }}>
          {losesMoney ? `${money(result.profit)}/mo` : `${result.marginPct.toFixed(0)}% margin`} · {money(result.revenue)}/mo revenue
        </div>
      </div>

      <div style={{ marginTop: 24, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 14 }}>
          Margin by stack scenario, at your retainer
        </div>
        <div style={{ display: "grid", gap: 14 }} role="img" aria-label={scenarios.map((s) => `${s.preset.label}: ${money(s.result.profit)} per month profit, ${s.result.marginPct.toFixed(0)} percent margin`).join(", ")}>
          {scenarios.map((s) => {
            const negative = s.result.profit < 0;
            const widthPct = Math.max(4, (Math.abs(s.result.profit) / maxScenarioProfit) * 100);
            const tone = s.preset.key === "seldonframe" ? GREEN : negative ? RED : AMBER;
            return (
              <div key={s.preset.key}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
                  <span>{s.preset.label}</span>
                  <span style={{ color: negative ? RED : INK }}>
                    {money(s.result.profit)}/mo ({s.result.marginPct.toFixed(0)}%)
                  </span>
                </div>
                <div style={{ position: "relative", height: 22, borderRadius: 8, background: "rgba(34,29,23,0.06)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${widthPct}%`, background: tone, borderRadius: 8 }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ margin: "18px 0 0", fontSize: 14.5, fontWeight: 700, color: losesMoney ? RED : GREEN }}>
        {losesMoney
          ? "At this retainer and cost structure, you're losing money on every client — raise the retainer, cut costs, or both."
          : `You're keeping ~${result.marginPct.toFixed(0)}% of revenue as profit.`}
      </p>

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> revenue = retainer × clients. Cost = (tool-stack cost per client × clients) +
          (hours per client × hourly rate × clients). The SeldonFrame preset assumes BYOK raw usage (you pay your own AI
          and telephony provider directly, at cost) — it is not a published GoHighLevel or SaaS-competitor number.
        </p>
        <p style={{ margin: 0 }}>
          Source for the GHL-style preset:{" "}
          <a href="https://www.gohighlevel.com/pricing" target="_blank" rel="noopener noreferrer" style={{ color: GREEN }}>gohighlevel.com/pricing</a> (verified July 2026).
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing agency profit margin" />
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
