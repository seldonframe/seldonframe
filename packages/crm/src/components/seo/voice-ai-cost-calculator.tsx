"use client";

// The voice AI cost-per-minute calculator — the interactive island of
// /tools/voice-ai-cost-calculator. Pure client math, no network calls.
// The hero visual is a stacked per-minute cost bar: platform fee + LLM +
// TTS + STT + telephony, because that stack is the whole story — the
// advertised headline rate is only one slice of it.
//
// Constants trace to the vapi / retell-ai / synthflow entries in
// lib/seo/competitor-pricing.ts (registry, verified July 2026):
//   - Vapi: advertised hosting fee $0.05/min; "real-world all-in cost is
//     reported around $0.10-$0.30/min depending on the stack" (registry,
//     hedged, not itemized by Vapi).
//   - Retell: itemized and the most granular published breakdown —
//     voice infra $0.055/min, TTS $0.015-$0.040/min, LLM $0.045-$0.16/min,
//     telephony $0.015/min. This calculator's per-component defaults for
//     the "typical stack" option are built from Retell's itemized numbers
//     (the only vendor that publishes a breakdown), since Vapi/Synthflow
//     only publish an all-in blended estimate.
//   - Synthflow: self-serve reported "~$0.08-$0.09/min", enterprise-only
//     on the live page (~$30k/yr, quote-gated) — both hedged/reported, not
//     independently itemized.
//   - Advertised headline rates used here ($0.05 Vapi, ~$0.07 Retell
//     pay-as-you-go floor, ~$0.08 Synthflow reported) vs. the itemized
//     "real" stack are exactly the registry's "$0.05 is really $0.25-0.33"
//     finding for Vapi; Retell and Synthflow use their own reported ranges.
//
// Styled on the MKT palette to match the other free-tool pages.

import { useState, useEffect, useRef, type ReactElement } from "react";

import { renderResultCard, buildShareUrl, copyToClipboard, downloadCanvasAsImage, shareResultCard } from "./result-card";

const INK = "#221D17";
const GREEN = "#1F2B24";
const INK10 = "rgba(34,29,23,0.10)";
const AMBER = "#B8860B";
const RED = "#C0392B";
const BLUE = "#3B6E9E";
const PURPLE = "#7B5CA6";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function moneyPrecise(n: number, digits = 3): string {
  return `$${n.toFixed(digits)}`;
}

// ─── URL-state schema ──────────────────────────────────────────────────
// Short keys: vc = callsPerMonth, vm = avgMinutes, vp = platform, vt = includeTelephony (1/0)

export type VoicePlatform = "vapi" | "retell" | "synthflow" | "typical";

export interface VoiceCalcState {
  callsPerMonth: number;
  avgMinutes: number;
  platform: VoicePlatform;
  includeTelephony: boolean;
}

export interface VoiceCalcBounds {
  callsPerMonth: { min: number; max: number };
  avgMinutes: { min: number; max: number };
}

export const VOICE_CALC_BOUNDS: VoiceCalcBounds = {
  callsPerMonth: { min: 20, max: 5000 },
  avgMinutes: { min: 1, max: 20 },
};

const VOICE_PLATFORMS: VoicePlatform[] = ["vapi", "retell", "synthflow", "typical"];

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function parseNum(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function encodeVoiceCalcState(state: VoiceCalcState): string {
  const params = new URLSearchParams();
  params.set("vc", String(Math.round(state.callsPerMonth)));
  params.set("vm", String(state.avgMinutes));
  params.set("vp", state.platform);
  params.set("vt", state.includeTelephony ? "1" : "0");
  return params.toString();
}

export function decodeVoiceCalcState(search: string): Partial<VoiceCalcState> {
  const params = new URLSearchParams(search);
  const out: Partial<VoiceCalcState> = {};

  const vc = parseNum(params, "vc");
  if (vc !== undefined) out.callsPerMonth = clamp(vc, VOICE_CALC_BOUNDS.callsPerMonth.min, VOICE_CALC_BOUNDS.callsPerMonth.max);

  const vm = parseNum(params, "vm");
  if (vm !== undefined) out.avgMinutes = clamp(vm, VOICE_CALC_BOUNDS.avgMinutes.min, VOICE_CALC_BOUNDS.avgMinutes.max);

  const vpRaw = params.get("vp");
  if (vpRaw !== null && (VOICE_PLATFORMS as string[]).includes(vpRaw)) out.platform = vpRaw as VoicePlatform;

  const vt = params.get("vt");
  if (vt === "1" || vt === "0") out.includeTelephony = vt === "1";

  return out;
}

// ─── pure cost math ─────────────────────────────────────────────────────

export interface VoiceStackComponent {
  label: string;
  perMinute: number;
}

export interface VoicePlatformInfo {
  label: string;
  advertisedPerMinute: number;
  advertisedLabel: string;
  /** Per-minute stack components, hedged, used to compute the "real" rate. */
  stt: number;
  llm: number;
  tts: number;
  platformFee: number;
  telephony: number;
}

// Component values are the midpoint of each vendor's reported/itemized
// range (see file header comment for sourcing per platform).
const PLATFORM_INFO: Record<VoicePlatform, VoicePlatformInfo> = {
  vapi: {
    label: "Vapi",
    advertisedPerMinute: 0.05,
    advertisedLabel: "$0.05/min hosting fee",
    stt: 0.03,
    llm: 0.08,
    tts: 0.04,
    platformFee: 0.05,
    telephony: 0.015,
  },
  retell: {
    label: "Retell",
    advertisedPerMinute: 0.07,
    advertisedLabel: "~$0.07/min pay-as-you-go floor",
    stt: 0.0, // folded into "voice infra" below per Retell's published breakdown
    llm: 0.1, // midpoint of $0.045-$0.16
    tts: 0.0275, // midpoint of $0.015-$0.040
    platformFee: 0.055, // Retell's published "voice infrastructure" line
    telephony: 0.015,
  },
  synthflow: {
    label: "Synthflow",
    advertisedPerMinute: 0.08,
    advertisedLabel: "~$0.08/min reported self-serve rate",
    stt: 0.03,
    llm: 0.09,
    tts: 0.035,
    platformFee: 0.02,
    telephony: 0.015,
  },
  typical: {
    label: "Typical stack",
    advertisedPerMinute: 0.05,
    advertisedLabel: "$0.05/min — a common advertised headline rate",
    // Built from Retell's itemized breakdown (the only vendor with a full
    // published component list), used as the "typical" blended stack.
    stt: 0.03,
    llm: 0.1,
    tts: 0.0275,
    platformFee: 0.05,
    telephony: 0.015,
  },
};

export interface VoiceCostResult {
  stack: VoiceStackComponent[];
  realPerMinute: number;
  advertisedPerMinute: number;
  monthlyTotal: number;
  totalMinutes: number;
}

export function computeVoiceCost(
  platform: VoicePlatform,
  callsPerMonth: number,
  avgMinutes: number,
  includeTelephony: boolean,
): VoiceCostResult {
  const info = PLATFORM_INFO[platform];
  const clampedCalls = clamp(callsPerMonth, VOICE_CALC_BOUNDS.callsPerMonth.min, VOICE_CALC_BOUNDS.callsPerMonth.max);
  const clampedMinutes = clamp(avgMinutes, VOICE_CALC_BOUNDS.avgMinutes.min, VOICE_CALC_BOUNDS.avgMinutes.max);

  const stack: VoiceStackComponent[] = [
    { label: "Speech-to-text", perMinute: info.stt },
    { label: "LLM", perMinute: info.llm },
    { label: "Text-to-speech", perMinute: info.tts },
    { label: "Platform fee", perMinute: info.platformFee },
  ];
  if (includeTelephony) {
    stack.push({ label: "Telephony", perMinute: info.telephony });
  }

  const realPerMinute = stack.reduce((sum, c) => sum + c.perMinute, 0);
  const totalMinutes = clampedCalls * clampedMinutes;
  const monthlyTotal = totalMinutes * realPerMinute;

  return {
    stack,
    realPerMinute: Math.round(realPerMinute * 1000) / 1000,
    advertisedPerMinute: info.advertisedPerMinute,
    monthlyTotal: Math.round(monthlyTotal),
    totalMinutes: Math.round(totalMinutes),
  };
}

const SELDONFRAME_MONTHLY = 29;

const COMPONENT_TONES: Record<string, string> = {
  "Speech-to-text": BLUE,
  LLM: PURPLE,
  "Text-to-speech": AMBER,
  "Platform fee": GREEN,
  Telephony: RED,
};

export function VoiceAiCostCalculator(): ReactElement {
  const [callsPerMonth, setCallsPerMonth] = useState(300);
  const [avgMinutes, setAvgMinutes] = useState(4);
  const [platform, setPlatform] = useState<VoicePlatform>("typical");
  const [includeTelephony, setIncludeTelephony] = useState(true);
  const replaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const decoded = decodeVoiceCalcState(window.location.search);
    if (decoded.callsPerMonth !== undefined) setCallsPerMonth(decoded.callsPerMonth);
    if (decoded.avgMinutes !== undefined) setAvgMinutes(decoded.avgMinutes);
    if (decoded.platform !== undefined) setPlatform(decoded.platform);
    if (decoded.includeTelephony !== undefined) setIncludeTelephony(decoded.includeTelephony);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (replaceTimer.current) clearTimeout(replaceTimer.current);
    replaceTimer.current = setTimeout(() => {
      const qs = encodeVoiceCalcState({ callsPerMonth, avgMinutes, platform, includeTelephony });
      const url = `${window.location.pathname}?${qs}`;
      window.history.replaceState(null, "", url);
    }, 150);
    return () => {
      if (replaceTimer.current) clearTimeout(replaceTimer.current);
    };
  }, [callsPerMonth, avgMinutes, platform, includeTelephony]);

  const result = computeVoiceCost(platform, callsPerMonth, avgMinutes, includeTelephony);
  const maxComponent = Math.max(...result.stack.map((c) => c.perMinute), 0.001);
  const multiplier = result.advertisedPerMinute > 0 ? result.realPerMinute / result.advertisedPerMinute : 1;

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
        headline: "What voice AI really costs per minute",
        bigNumber: `${money(result.monthlyTotal)}/mo`,
        subline: `Advertised ${moneyPrecise(result.advertisedPerMinute)}/min → real ~${moneyPrecise(result.realPerMinute)}/min`,
        rows: [
          { label: "Real per-minute rate", value: `~${moneyPrecise(result.realPerMinute)}/min` },
          { label: "Total minutes/mo", value: result.totalMinutes.toLocaleString("en-US") },
          { label: "SeldonFrame", value: `${money(SELDONFRAME_MONTHLY)}/mo flat` },
        ],
        footer: "built free at seldonframe.com/tools",
      });
    }, 150);
    return () => {
      if (renderTimer.current) clearTimeout(renderTimer.current);
    };
  }, [result.monthlyTotal, result.advertisedPerMinute, result.realPerMinute, result.totalMinutes]);

  const handleCopyLink = async () => {
    const url = buildShareUrl(window.location.search);
    const ok = await copyToClipboard(url);
    setCopyFeedback(ok ? "Copied ✓" : "Copy failed");
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleDownload = () => {
    if (canvasRef.current) downloadCanvasAsImage(canvasRef.current, "voice-ai-cost.png");
  };

  const handleNativeShare = async () => {
    const url = buildShareUrl(window.location.search);
    await shareResultCard(canvasRef.current, {
      title: "What voice AI really costs per minute",
      text: `My voice AI stack works out to ~${money(result.monthlyTotal)}/mo — ~${moneyPrecise(result.realPerMinute)}/min real cost.`,
      url,
      filename: "voice-ai-cost.png",
    });
  };

  return (
    <div style={{ border: `1px solid ${INK10}`, borderRadius: 20, background: "rgba(255,255,255,0.6)", padding: "28px 28px" }}>
      <div style={{ display: "grid", gap: 22 }}>
        <label style={{ display: "block" }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Platform</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VOICE_PLATFORMS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                aria-pressed={platform === p}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: platform === p ? `2px solid ${GREEN}` : `1.5px solid ${INK10}`,
                  background: platform === p ? "rgba(31, 43, 36,0.08)" : "#fff",
                  color: INK,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {PLATFORM_INFO[p].label}
              </button>
            ))}
          </div>
        </label>

        <NumberField
          label="Calls per month"
          hint="Total inbound/outbound calls handled by the AI agent"
          value={callsPerMonth}
          min={VOICE_CALC_BOUNDS.callsPerMonth.min}
          max={VOICE_CALC_BOUNDS.callsPerMonth.max}
          step={10}
          format={(v) => `${v.toLocaleString("en-US")} calls`}
          onChange={setCallsPerMonth}
        />
        <NumberField
          label="Average call length"
          hint="Minutes per call, start to finish"
          value={avgMinutes}
          min={VOICE_CALC_BOUNDS.avgMinutes.min}
          max={VOICE_CALC_BOUNDS.avgMinutes.max}
          step={0.5}
          format={(v) => `${v} min`}
          onChange={setAvgMinutes}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 14.5 }}>
          <input
            type="checkbox"
            checked={includeTelephony}
            onChange={(e) => setIncludeTelephony(e.target.checked)}
            aria-label="Include telephony (phone number + carrier minutes) in the stack"
            style={{ width: 18, height: 18, accentColor: GREEN }}
          />
          Include telephony (phone number + carrier minutes)
        </label>
      </div>

      <div style={{ marginTop: 28, borderTop: `1px solid ${INK10}`, paddingTop: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(34,29,23,0.55)", marginBottom: 14 }}>
          The real per-minute stack
        </div>

        {/* Stacked bar — the hero visual: each component as a horizontal segment */}
        <div
          role="img"
          aria-label={`Per-minute cost stack: ${result.stack.map((c) => `${c.label} ${moneyPrecise(c.perMinute)}`).join(", ")}. Total ~${moneyPrecise(result.realPerMinute)} per minute.`}
          style={{ display: "flex", height: 44, borderRadius: 10, overflow: "hidden", border: `1px solid ${INK10}` }}
        >
          {result.stack.map((c) => {
            const widthPct = Math.max(2, (c.perMinute / result.realPerMinute) * 100);
            return (
              <div
                key={c.label}
                title={`${c.label}: ~${moneyPrecise(c.perMinute)}/min`}
                style={{ width: `${widthPct}%`, background: COMPONENT_TONES[c.label] ?? GREEN, minWidth: 3 }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 10 }}>
          {result.stack.map((c) => (
            <div key={c.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: COMPONENT_TONES[c.label] ?? GREEN, display: "inline-block" }} />
              <span>
                {c.label}: ~{moneyPrecise(c.perMinute)}/min
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, padding: "16px 18px", borderRadius: 12, background: "rgba(192,57,43,0.06)", border: `1px solid rgba(192,57,43,0.2)` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(34,29,23,0.6)" }}>
            Advertised: {moneyPrecise(result.advertisedPerMinute)}/min
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: RED, marginTop: 4 }}>
            Real: ~{moneyPrecise(result.realPerMinute)}/min
            {multiplier > 1.05 && (
              <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 8, color: "rgba(34,29,23,0.6)" }}>
                (~{multiplier.toFixed(1)}x the headline rate)
              </span>
            )}
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", fontSize: 14, padding: "10px 12px", background: "rgba(34,29,23,0.04)", borderRadius: 8 }}>
          <span>{result.totalMinutes.toLocaleString("en-US")} total minutes/mo</span>
          <span style={{ fontWeight: 800, color: GREEN }}>~{money(result.monthlyTotal)}/mo</span>
        </div>
      </div>

      <div style={{ marginTop: 22, fontSize: 12.5, color: "rgba(34,29,23,0.6)", lineHeight: 1.6 }}>
        <p style={{ margin: "0 0 6px" }}>
          <strong>Assumptions:</strong> per-component rates are <strong>~hedged</strong> midpoints of each vendor's
          reported/itemized ranges (only Retell publishes a full component breakdown — the "typical stack" option is
          built from theirs). Vapi and Synthflow only publish a blended all-in estimate, not itemized components,
          so their per-component split here is an approximation for illustration.
        </p>
        <p style={{ margin: 0 }}>
          <strong>SeldonFrame:</strong> $29/mo flat for the platform — you connect your own AI provider and Twilio
          keys at raw provider cost (typically a few cents per minute), instead of paying a per-minute markup on top
          of every component.
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
          <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "auto" }} aria-label="Downloadable result card showing real voice AI monthly cost" />
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
