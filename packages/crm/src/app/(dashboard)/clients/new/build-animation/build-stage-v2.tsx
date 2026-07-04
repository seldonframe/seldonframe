// packages/crm/src/app/(dashboard)/clients/new/build-animation/build-stage-v2.tsx
//
// Build Animation v2 — full-bleed canvas to the right of the operator
// sidebar, both themes first-class, archetype palette driven by
// detectVertical() at submit time and overridden by the server's
// `soul_built` SSE event when it arrives.
//
// Ported from Build Animation v2.html (1977 lines, inline <style>+<script>).
// The single-file HTML maps cleanly to a single TSX file because the CSS
// cascade is heavily archetype-token-driven and splitting it across files
// would force every phase to re-declare the cascade. styled-jsx `global`
// scopes the .sb-* prefix to the build animation render tree without
// leaking into the rest of the dashboard.
//
// What's intentionally NOT here:
//   - `.sb-controls` preview bar (the README calls out as design-time only)
//   - Per-phase fixed sprite frames (the v1 pattern) — v2 is a single
//     archetype-aware canvas that crossfades between 6 phase mocks
//   - localStorage / theme toggle (the dashboard's existing chrome owns
//     theme; we just read it)
//
// SSE wiring contract: the parent passes the live EventSource (or null)
// via the `eventSource` prop. We attach our own listeners that map the
// existing event names (`fetching`, `extracting`, `soul_built`,
// `chatbot_built`, `landing_built`, `demo_seeded`, `done`) onto the
// 6-phase timeline. The v1 build animation ran on a 60s clock; the v2
// uses the clock as a fallback when SSE isn't connected (demo mode) and
// snaps to real progress when SSE events arrive.
//
// 2026-05-22 — Foreign-embed fix. The previous v2 declared its own theme
// tokens (--sb-bg, --sb-surface, --sb-border, --sb-ink, etc.) keyed off
// a `data-theme` attribute resolved via useTheme(). That worked for
// inheriting dark/light but it also drew the stage as its OWN background
// fill on top of the dashboard, with the .sb-mock-frame card on top of
// that — card-on-card. The fix is to drop the theme token block entirely
// and have .sb-* selectors read host CSS vars (--background, --card,
// --border, --foreground, --muted-foreground) directly, then make
// .sb-stage transparent so the page background shows through. The
// archetype tokens (--sb-accent, --sb-accent-2, --sb-accent-ink) are
// scoped per-render and unchanged — they're brand tokens, not theme
// tokens. Inner mock surfaces (id-card, struct-card, module, etc.) stay
// rendered as sub-cards because they represent workspace modules.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import {
  ARCHETYPE_LABELS,
  type DetectVerticalInput,
  type DetectVerticalResult,
  detectVertical,
  inferPublishSubdomain,
} from "@/lib/workspace/detect-vertical";

// ─── Public surface ──────────────────────────────────────────────────────

export type BuildStageV2Props = {
  /** Whether the build animation is currently driving (parent fades it in
   *  when SSE has been opened). */
  active: boolean;
  /** The original form input that triggered the build. Used by Stage A
   *  (synchronous inferred state) — every phase mock renders content
   *  derived from this. */
  input: DetectVerticalInput | null;
  /** Live EventSource attached to /api/v1/web/workspaces/create-from-url
   *  or create-from-paste. The animation listens for `fetching`,
   *  `extracting`, `soul_built`, `chatbot_built`, `landing_built`,
   *  `demo_seeded`, and `done` events to drive phase progression and
   *  Stage A → Stage B crossfade. May be null if the parent hasn't
   *  opened the stream yet (we fall back to a demo timeline). */
  eventSource?: EventSource | null;
  /** Optional URLs surfaced after the `done` event fires. When present,
   *  the REVEAL phase's CTAs become clickable anchors that take the
   *  operator to the freshly-built workspace (open) or the public
   *  landing (share). The parent owns the lifecycle of these — it
   *  sets them on `done`, then can optionally auto-redirect on a
   *  timer so the operator sees the celebratory moment first. */
  revealLinks?: { open: string; share?: string | null } | null;
  /** 2026-07-04 — Optional total duration (seconds) the phase clock counts
   *  toward, scaling `PHASE_DURATIONS_S` proportionally. Defaults to 60,
   *  which reduces to the original fixed durations exactly (scale factor
   *  1) — every existing call site (e.g. /clients/new) omits this prop and
   *  renders byte-identically. /try passes 165 (~2-3 min) for honest
   *  timing on the public funnel, where real builds run longer than the
   *  original 60s demo clock. */
  totalS?: number;
};

// ─── Phase timeline ──────────────────────────────────────────────────────
// Six phases mapped to the README's narrative beats. Per-phase duration
// totals 60s — matches the v1 timeline + the "≈ 60s total" stat on the
// side panel.

const PHASE_DURATIONS_S = [8, 10, 9, 12, 11, 10] as const;
const BASE_TOTAL_S = PHASE_DURATIONS_S.reduce((a, b) => a + b, 0);

// 2026-07-04 — `totalS` prop scales phase pacing proportionally rather than
// hand-editing each duration (per the honest-timing brief). scale = 1 when
// totalS === BASE_TOTAL_S (the default), so every existing call site that
// omits the prop gets EXACTLY the original durations back — no rounding
// drift, since PHASE_DURATIONS_S itself is untouched and only multiplied.
function scaledDurations(totalS: number): readonly number[] {
  const scale = totalS / BASE_TOTAL_S;
  if (scale === 1) return PHASE_DURATIONS_S;
  return PHASE_DURATIONS_S.map((d) => d * scale);
}

// Footer label formatting — short stat-chip text, not a sentence. Below
// 90s keeps the original "Ns total" style; at/above 90s renders an honest
// minute range instead of a misleading small "≈Ns" (real /try builds run
// 2-3 minutes, not seconds). The range is fixed prose for the two known
// callers (60 and 165) rather than a generic minute-math formatter, since
// the brief calls for a short, specific chip — not a sentence.
function formatTotalLabel(totalS: number): string {
  if (totalS < 90) return `${Math.round(totalS)}s`;
  const minutes = totalS / 60;
  const lo = Math.max(1, Math.floor(minutes - 0.5));
  const hi = Math.ceil(minutes + 0.5);
  return `${lo}–${hi} min`;
}

type PhaseIndex = 0 | 1 | 2 | 3 | 4 | 5;

const PHASE_META: Array<{
  num: string;
  name: string;
  desc: string;
  title: string;
  meta: string;
}> = [
  {
    num: "01",
    name: "Scan",
    desc: "Reading the site",
    title: "Reading the website…",
    meta: "SSE · 200 OK",
  },
  {
    num: "02",
    name: "Identity",
    desc: "Pulling brand",
    title: "Pulling brand identity",
    meta: "stage A · inferred",
  },
  {
    num: "03",
    name: "Structure",
    desc: "Mapping entities",
    title: "Mapping the business",
    meta: "mapping entities",
  },
  {
    num: "04",
    name: "Modules",
    desc: "CRM · booking · intake · chatbot",
    title: "Assembling the workspace",
    meta: "wiring CRM · booking · intake · chatbot",
  },
  {
    num: "05",
    name: "Activation",
    desc: "Seeding data · publishing",
    title: "Wiring data + going live",
    meta: "seeding data · publishing",
  },
  {
    num: "06",
    name: "Reveal",
    desc: "Workspace ready",
    title: "Workspace ready",
    meta: "workspace ready",
  },
];

// SSE event → minimum phase index we should be at when it arrives.
// We use Math.max(currentPhase, mapped) so events never pull us backwards.
const EVENT_TO_MIN_PHASE: Record<string, PhaseIndex> = {
  fetching: 0,
  extracting: 0,
  soul_built: 1,
  chatbot_built: 3,
  landing_built: 4,
  demo_seeded: 4,
  done: 5,
};

// ─── Soul payload (best-effort) ──────────────────────────────────────────
// The current server emits `soul_built` with `{ workspaceId }` (see
// run-create-from-url.ts line 343). The Claude Design brief assumes a
// richer payload `{ name, niche, archetype, palette? }`. We parse both
// shapes gracefully — the richer the payload, the more we crossfade. If
// only workspaceId is present we still fire the Stage A → Stage B mark
// flip and the flash badge so the user sees confirmation that
// extraction is locked in.

type SoulBuiltPayload = {
  name?: string;
  niche?: string;
  archetype?: AestheticArchetypeId;
  palette?: { primary?: string; secondary?: string };
  workspaceId?: string;
};

function parseSoulPayload(raw: unknown): SoulBuiltPayload | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: SoulBuiltPayload = {};
    if (typeof parsed.name === "string") out.name = parsed.name;
    if (typeof parsed.niche === "string") out.niche = parsed.niche;
    if (typeof parsed.workspaceId === "string") out.workspaceId = parsed.workspaceId;
    const arche = parsed.archetype;
    if (
      typeof arche === "string" &&
      arche in ARCHETYPE_LABELS
    ) {
      out.archetype = arche as AestheticArchetypeId;
    }
    const palette = parsed.palette;
    if (palette && typeof palette === "object") {
      const p = palette as Record<string, unknown>;
      out.palette = {};
      if (typeof p.primary === "string") out.palette.primary = p.primary;
      if (typeof p.secondary === "string") out.palette.secondary = p.secondary;
    }
    return out;
  } catch {
    return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────

export function BuildStageV2({
  active,
  input,
  eventSource,
  revealLinks,
  totalS = BASE_TOTAL_S,
}: BuildStageV2Props) {
  // Theme is read straight off the host via CSS vars (--background,
  // --foreground, --card, --border, --muted-foreground, etc.). The
  // dashboard chrome already owns theme switching — we just inherit. No
  // useTheme(), no data-theme attribute, no internal theme state. See
  // file header comment for why this changed in 2026-05-22.

  // Phase pacing scaled by the (optional) totalS prop — see scaledDurations
  // header comment. Default totalS === BASE_TOTAL_S so `durations` is
  // reference-stable to PHASE_DURATIONS_S and TOTAL_S === BASE_TOTAL_S for
  // every existing call site.
  const durations = useMemo(() => scaledDurations(totalS), [totalS]);
  const TOTAL_S = totalS;

  // Stage A — synchronous, derived from `input` at mount. Pure detection.
  const stageA: DetectVerticalResult | null = useMemo(
    () => (input ? detectVertical(input) : null),
    [input],
  );

  // Stage B — populated when `soul_built` arrives. Optional.
  const [stageB, setStageB] = useState<SoulBuiltPayload | null>(null);
  const stageMark: "inferred" | "real" = stageB ? "real" : "inferred";

  // The archetype currently driving the palette — Stage B wins if present
  // AND differs from the inferred Stage A choice.
  const activeArchetype: AestheticArchetypeId =
    (stageB?.archetype as AestheticArchetypeId | undefined) ??
    stageA?.rule.archetype ??
    "technical-restrained";

  // Business name shown in the side panel + identity card.
  const displayName =
    stageB?.name && stageB.name.trim().length > 0
      ? stageB.name.trim()
      : stageA?.businessName ?? "Your business";

  // Niche string under the business name (left side).
  const displayNiche = useMemo(() => {
    if (!stageA) return "";
    const input = stageA.inputDisplay;
    const niche = stageB?.niche ?? stageA.rule.vertical;
    return `${input} · ${niche}`;
  }, [stageA, stageB]);

  // ─── Animation phase clock ─────────────────────────────────────────────
  // Two drivers: timeline (rAF clock, ticks every frame from 0 → TOTAL_S)
  // and SSE (clamps the phase index up when events arrive). The phase
  // index used by the UI is max(clockPhase, sseMinPhase).
  const [elapsedS, setElapsedS] = useState(0);
  const [sseMinPhase, setSseMinPhase] = useState<PhaseIndex>(0);
  const [reducedFromOs, setReducedFromOs] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Detect prefers-reduced-motion once on mount. The CSS @media query
  // handles the visual layer; this flag handles the JS pin-to-IDENTITY
  // behavior the README calls for.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedFromOs(mq.matches);
    const onChange = () => setReducedFromOs(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Reduced-motion JS override flag. The README distinguishes between
  // OS-level prefers-reduced-motion (CSS-driven via @media) and the
  // demo-controlled toggle (JS-driven via [data-reduced="yes"]). In
  // production we don't ship the toggle, so this defaults to the OS
  // value — but we keep the data attribute so the CSS rules that ONLY
  // target [data-reduced="yes"] still fire.
  const reduced = reducedFromOs;

  // Restart the clock whenever `active` flips false→true.
  useEffect(() => {
    if (!active) {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      startedAtRef.current = null;
      setElapsedS(0);
      setSseMinPhase(0);
      setStageB(null);
      return;
    }
    if (reduced) {
      // Pin to IDENTITY (phase index 1) — README requires this for the
      // reduced-motion state so the user still sees the archetype-correct
      // business name + brand color. No clock; no rAF; just freeze.
      setElapsedS(durations[0]! + durations[1]! * 0.6);
      return;
    }
    startedAtRef.current = null;
    setElapsedS(0);
    const step = (ts: number) => {
      if (startedAtRef.current === null) startedAtRef.current = ts;
      const e = (ts - startedAtRef.current) / 1000;
      setElapsedS(Math.min(TOTAL_S, e));
      if (e < TOTAL_S) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, reduced, durations, TOTAL_S]);

  // ─── SSE wiring ────────────────────────────────────────────────────────
  // Attach listeners once per EventSource. The parent owns the lifecycle
  // (open, close on done/error) — we just read.
  useEffect(() => {
    const es = eventSource ?? null;
    if (!es) return;
    const onSoul = (raw: MessageEvent) => {
      const parsed = parseSoulPayload(raw.data);
      setStageB(parsed ?? {}); // empty object still flips the stage mark
      setSseMinPhase((p) => Math.max(p, EVENT_TO_MIN_PHASE.soul_built ?? p) as PhaseIndex);
    };
    const generic = (eventName: keyof typeof EVENT_TO_MIN_PHASE) => () => {
      const target = EVENT_TO_MIN_PHASE[eventName];
      if (target !== undefined) {
        setSseMinPhase((p) => Math.max(p, target) as PhaseIndex);
      }
    };
    const onFetching = generic("fetching");
    const onExtracting = generic("extracting");
    const onChatbot = generic("chatbot_built");
    const onLanding = generic("landing_built");
    const onDemoSeeded = generic("demo_seeded");
    const onDone = generic("done");

    es.addEventListener("fetching", onFetching);
    es.addEventListener("extracting", onExtracting);
    es.addEventListener("soul_built", onSoul as EventListener);
    es.addEventListener("chatbot_built", onChatbot);
    es.addEventListener("landing_built", onLanding);
    es.addEventListener("demo_seeded", onDemoSeeded);
    es.addEventListener("done", onDone);

    return () => {
      es.removeEventListener("fetching", onFetching);
      es.removeEventListener("extracting", onExtracting);
      es.removeEventListener("soul_built", onSoul as EventListener);
      es.removeEventListener("chatbot_built", onChatbot);
      es.removeEventListener("landing_built", onLanding);
      es.removeEventListener("demo_seeded", onDemoSeeded);
      es.removeEventListener("done", onDone);
    };
  }, [eventSource]);

  // ─── Derived phase index + per-tick fill ───────────────────────────────
  const { clockPhase, phaseFraction } = useMemo(() => {
    let acc = 0;
    for (let i = 0; i < durations.length; i++) {
      const d = durations[i]!;
      if (elapsedS < acc + d) {
        return {
          clockPhase: i as PhaseIndex,
          phaseFraction: (elapsedS - acc) / d,
        };
      }
      acc += d;
    }
    return {
      clockPhase: (durations.length - 1) as PhaseIndex,
      phaseFraction: 1,
    };
  }, [elapsedS, durations]);

  const phaseIndex = Math.max(clockPhase, sseMinPhase) as PhaseIndex;

  // Flash badge ("soul_built ✓") — visible for 1600ms after Stage B lands.
  const [flashOn, setFlashOn] = useState(false);
  const stageBRef = useRef<SoulBuiltPayload | null>(null);
  useEffect(() => {
    if (!stageB) return;
    if (stageBRef.current) return; // already flashed
    stageBRef.current = stageB;
    setFlashOn(true);
    const t = setTimeout(() => setFlashOn(false), 1600);
    return () => clearTimeout(t);
  }, [stageB]);

  // ─── Render ────────────────────────────────────────────────────────────
  if (!stageA) {
    // Defensive: nothing to render if no input. Parent never mounts us
    // without input but be safe.
    return null;
  }

  const rule = stageA.rule;
  const archetypeLabel = ARCHETYPE_LABELS[activeArchetype];
  const publishDomain = inferPublishSubdomain(input ?? { kind: "url", value: "" });
  const elapsedFmt = formatTime(elapsedS);
  const totalFmt = formatTotalLabel(TOTAL_S);
  // 2026-06-03 — The rAF narrative clock can reach the REVEAL phase before
  // the orchestrator's `done` event fires (real builds occasionally run
  // past the 60s clock). `isReady` is the single source of truth for "the
  // workspace is actually built and its dashboard URL is live" — it gates
  // the REVEAL copy and flips the CTAs from a finalizing state to real
  // clickable anchors. Without it the operator saw a finished-looking
  // screen with a dead look-alike button and no cue it was still wiring up.
  const isReady = Boolean(revealLinks?.open);

  return (
    <div
      className="sb-stage"
      data-archetype={activeArchetype}
      data-reduced={reduced ? "yes" : "no"}
    >
      {/* Atmospheric backdrop — radial wash + grid mask under everything. */}
      <div className="sb-atmos" aria-hidden />

      {/* 2026-05-22 — Removed the .sb-crumb "Clients / New · building"
          breadcrumb. The dashboard chrome already renders the page
          heading + workspace switcher above the content area; the
          internal breadcrumb was a foreign-embed signal duplicating the
          host. The "Building workspace" status now lives in the side
          panel (sb-biz-row + sb-tick states). */}

      <div className="sb-canvas">
        {/* LEFT — phase mock */}
        <section className="sb-mock">
          <div className="sb-mock-frame">
            <span className="sb-reg tl" />
            <span className="sb-reg tr" />
            <span className="sb-reg bl" />
            <span className="sb-reg br" />

            <div className="sb-phases">
              {/* PHASE 1 — SCAN */}
              <PhasePanel index={0} active={phaseIndex === 0}>
                <PhaseHead phase={0} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-scan">
                    <div className="ln">
                      <span className="p">&gt;</span> fetch <span className="v">{stageA.inputDisplay}</span>
                    </div>
                    <div className="ln">
                      <span className="ok">✓</span> 200 OK <span className="dim">· 14.3 KB</span>
                    </div>
                    <div className="ln">
                      <span className="p">&gt;</span> parse <span className="dim">title, services, contact, hours…</span>
                    </div>
                    <div className="ln">
                      <span className="ok">✓</span> title:{" "}
                      <span className="v">{`"${displayName} — ${rule.vertical}"`}</span>
                    </div>
                    <div className="ln">
                      <span className="ok">✓</span> phone <span className="dim">·</span> hours <span className="dim">·</span>{" "}
                      {rule.services.length} services
                    </div>
                    <div className="ln">
                      <span className="p">&gt;</span> extracting brand tokens
                      <span className="caret" />
                    </div>
                  </div>
                </div>
              </PhasePanel>

              {/* PHASE 2 — IDENTITY */}
              <PhasePanel index={1} active={phaseIndex === 1}>
                <PhaseHead phase={1} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-identity">
                    <div className="sb-id-card">
                      <p className="sb-id-niche">{rule.vertical} · inferred from input</p>
                      <h4
                        className="sb-id-name"
                        data-inferred={stageB ? "no" : "yes"}
                      >
                        {displayName}
                      </h4>
                      <p className="sb-id-voice">{rule.voice}</p>
                      <div className="sb-id-tokens">
                        <Token k="Archetype">
                          <span className="sb-swatch" />
                          <span>{archetypeLabel}</span>
                        </Token>
                        <Token k="Headline font">{rule.headlineFont}</Token>
                        <Token k="Hero variant">{rule.heroVariant}</Token>
                        <Token k="Sticky CTA">{rule.stickyCta}</Token>
                      </div>
                    </div>
                    <div className="sb-id-poster">
                      <div className="sb-id-poster-kicker">{rule.posterKicker}</div>
                      <h3
                        className="sb-id-poster-name"
                        // posterName from the rule may contain <br/> per the
                        // HTML source. We render it as raw HTML — content is
                        // hardcoded in detect-vertical.ts so this is safe.
                        dangerouslySetInnerHTML={{ __html: rule.posterName }}
                      />
                      <p className="sb-id-poster-tag">{rule.posterTag}</p>
                    </div>
                  </div>
                </div>
              </PhasePanel>

              {/* PHASE 3 — STRUCTURE */}
              <PhasePanel index={2} active={phaseIndex === 2}>
                <PhaseHead phase={2} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-struct">
                    <StructCard
                      i={1}
                      label="Services"
                      count={`${rule.services.length} found`}
                      items={rule.services}
                      iconPath="M3 12h18M3 6h18M3 18h12"
                    />
                    <StructCard
                      i={2}
                      label="Hours"
                      count="24/7"
                      items={rule.hours}
                      iconPath="M12 6v6l4 2"
                      iconCircle
                    />
                    <StructCard
                      i={3}
                      label="Service area"
                      count={rule.serviceAreaLabel}
                      items={rule.serviceArea}
                      iconPath="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"
                      iconCircleSmall
                    />
                    <StructCard
                      i={4}
                      label="Contact"
                      count="3 channels"
                      items={[rule.contact, "service@…", "Web form"]}
                      iconPath="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"
                    />
                  </div>
                </div>
              </PhasePanel>

              {/* PHASE 4 — MODULES */}
              <PhasePanel index={3} active={phaseIndex === 3}>
                <PhaseHead phase={3} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-modules">
                    <ModuleCard
                      title="CRM"
                      on={moduleLitCount(phaseIndex, phaseFraction) >= 1}
                      iconPath="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75"
                      iconCircle
                    >
                      <div className="row">
                        <span>Leads</span>
                        <span className="v">5 seeded</span>
                      </div>
                      <div className="row">
                        <span>Pipeline</span>
                        <span className="v">New · Warm · Booked</span>
                      </div>
                    </ModuleCard>
                    <ModuleCard
                      title="Booking page"
                      on={moduleLitCount(phaseIndex, phaseFraction) >= 2}
                      iconPath="M3 4h18v18H3zM16 2v4M8 2v4M3 10h18"
                    >
                      <div className="row">
                        <span>Slots</span>
                        <span className="v">Mon–Sat · 24/7</span>
                      </div>
                      <div className="row is-cta">{rule.bookingCta}</div>
                    </ModuleCard>
                    <ModuleCard
                      title="Intake form"
                      on={moduleLitCount(phaseIndex, phaseFraction) >= 3}
                      iconPath="M3 3h18v18H3zM7 8h10M7 12h7M7 16h4"
                    >
                      <div className="row">
                        <span>Fields</span>
                        <span className="v">{rule.intakeFields}</span>
                      </div>
                      <div className="row">
                        <span>Routing</span>
                        <span className="v">→ CRM new lead</span>
                      </div>
                    </ModuleCard>
                    <ModuleCard
                      title="AI chatbot"
                      on={moduleLitCount(phaseIndex, phaseFraction) >= 4}
                      iconPath="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                    >
                      <div className="bubble bot">{rule.chatBot}</div>
                      <div className="bubble user">{rule.chatUser}</div>
                    </ModuleCard>
                  </div>
                </div>
              </PhasePanel>

              {/* PHASE 5 — ACTIVATION */}
              <PhasePanel index={4} active={phaseIndex === 4}>
                <PhaseHead phase={4} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-activate">
                    <div className="sb-act-pane">
                      <div className="sb-act-head">
                        <span className="dot" /> Seeding CRM
                      </div>
                      <Lead i={1} who="Diane M." tag="new" amount="$1,840" />
                      <Lead i={2} who="Marcus V." tag="warm" amount="$4,200" />
                      <Lead i={3} who="Hartmann Fmly." tag="booked" amount="$2,650" />
                      <Lead i={4} who="Reyes Co." tag="new" amount="$980" />
                      <Lead i={5} who="Lin O." tag="warm" amount="$3,100" />
                    </div>
                    <div className="sb-act-pane">
                      <div className="sb-act-head">
                        <span className="dot" /> Publishing landing
                      </div>
                      <div className="sb-publish-browser">
                        <div className="dots">
                          <span /><span /><span />
                        </div>
                        <div className="addr">
                          <span className="domain">{publishDomain}</span>
                        </div>
                        <div className="sb-publish-status">LIVE</div>
                      </div>
                      <div className="sb-publish-preview">
                        <span className="arche">{archetypeLabel}</span>
                        <span className="h">{rule.publishHead}</span>
                        <span className="s">{rule.publishCta}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </PhasePanel>

              {/* PHASE 6 — REVEAL */}
              <PhasePanel index={5} active={phaseIndex === 5}>
                <PhaseHead phase={5} stageMark={stageMark} />
                <div className="sb-phase-body">
                  <div className="sb-reveal" data-ready={isReady ? "yes" : "no"}>
                    <div className={`sb-reveal-banner${isReady ? "" : " is-pending"}`}>
                      <span className="sb-reveal-tag">
                        {isReady
                          ? `Live · ${Math.round(elapsedS)}s build`
                          : `Finalizing · ${Math.round(elapsedS)}s`}
                      </span>
                      <h3 className="sb-reveal-name">
                        {isReady
                          ? `${displayName} is ready to hand over.`
                          : `Putting the finishing touches on ${displayName}…`}
                      </h3>
                    </div>
                    <div className="sb-reveal-stats">
                      <Stat k="Modules" v="4" small="/ 4 live" />
                      <Stat k="Build time" v={String(Math.round(elapsedS))} small="s" />
                      <Stat k="Leads seeded" v="5" />
                      <Stat k="Archetype" v={archetypeLabel} small="" smallValue />
                    </div>
                    <div className="sb-reveal-ctas">
                      {/* 2026-06-03 — The rAF clock can reach REVEAL before the
                          orchestrator's `done` event arrives. Until it does
                          (isReady === false) the primary CTA renders as an
                          explicit finalizing state — spinner + shimmer — so the
                          operator reads it as still-working, not broken. The
                          instant `done` lands and revealLinks is set, it flips
                          to a real, clickable anchor. */}
                      {isReady ? (
                        <a
                          href={revealLinks!.open}
                          className="sb-btn sb-btn-primary"
                        >
                          Open workspace
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                            <line x1={5} y1={12} x2={19} y2={12} />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </a>
                      ) : (
                        <span
                          className="sb-btn sb-btn-primary is-pending"
                          role="status"
                          aria-live="polite"
                          aria-busy="true"
                        >
                          <span className="sb-btn-spinner" aria-hidden="true" />
                          Finalizing workspace…
                        </span>
                      )}
                      {isReady && revealLinks?.share ? (
                        <a
                          href={revealLinks.share}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sb-btn sb-btn-ghost"
                        >
                          Share with client
                        </a>
                      ) : (
                        <span
                          className={`sb-btn sb-btn-ghost${isReady ? " is-disabled" : " is-pending"}`}
                          aria-busy={!isReady}
                          aria-disabled="true"
                        >
                          Share with client
                        </span>
                      )}
                    </div>
                    {!isReady && (
                      <p className="sb-reveal-hint" role="status" aria-live="polite">
                        Wiring the last modules together — this goes live the moment your workspace is ready.
                      </p>
                    )}
                  </div>
                </div>
              </PhasePanel>
            </div>
          </div>
        </section>

        {/* RIGHT — narration panel */}
        <aside className="sb-side">
          <div className="sb-biz" style={{ position: "relative" }}>
            <div className="sb-biz-row">
              <span className="badge">{archetypeLabel}</span>
              <span
                className={`stage-mark ${
                  stageMark === "real" ? "is-real" : "is-inferred"
                }`}
              >
                {stageMark === "real" ? "Stage B · soul_built" : "Stage A · inferred"}
              </span>
              <span className={`sb-soul-flash ${flashOn ? "is-on" : ""}`}>
                soul_built ✓
              </span>
            </div>
            <h2 className="sb-biz-name">{displayName}</h2>
            <p className="sb-biz-niche">{displayNiche}</p>
          </div>

          <div className="sb-ticker">
            {PHASE_META.map((p, i) => {
              const isActive = i === phaseIndex;
              const isPast = i < phaseIndex;
              const fill =
                isPast || phaseIndex > i
                  ? 100
                  : isActive
                    ? Math.round(phaseFraction * 100)
                    : 0;
              const status = isPast ? "done" : isActive ? "running" : "queued";
              return (
                <div
                  key={p.num}
                  className={`sb-tick ${isActive ? "is-active" : ""} ${
                    isPast ? "is-past" : ""
                  }`}
                >
                  <div className="num">{p.num}</div>
                  <div className="label">
                    <div className="name">{p.name}</div>
                    <div className="desc">{p.desc}</div>
                    <div className="bar">
                      <div className="fill" style={{ width: `${fill}%` }} />
                    </div>
                  </div>
                  <div className="status">{status}</div>
                </div>
              );
            })}
          </div>

          <div className="sb-side-foot">
            <span>
              elapsed <b>{elapsedFmt}</b>
            </span>
            <span>
              ≈ <b>{totalFmt}</b> total
            </span>
          </div>
        </aside>
      </div>

      <StageStyles />
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function moduleLitCount(phaseIndex: number, phaseFraction: number): number {
  if (phaseIndex < 3) return 0;
  if (phaseIndex > 3) return 4;
  // Phase 3 (MODULES): light up sequentially 0 → 4 across the phase.
  return Math.min(4, Math.floor(phaseFraction * 4.4));
}

function formatTime(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const mm = String(Math.floor(t / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────

function PhasePanel({
  index,
  active,
  children,
}: {
  index: number;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`sb-phase ${active ? "is-active" : ""}`}
      data-phase={index}
    >
      {children}
    </div>
  );
}

function PhaseHead({
  phase,
  stageMark,
}: {
  phase: number;
  stageMark: "inferred" | "real";
}) {
  const meta = PHASE_META[phase]!;
  // Identity phase has a stage-mark override so it can flip from A→B
  const metaText =
    phase === 1
      ? stageMark === "real"
        ? "stage B · soul_built"
        : "stage A · inferred"
      : meta.meta;
  return (
    <>
      <div className="sb-phase-head">
        <div className="sb-phase-label">
          <span className="num">{meta.num}</span>
          {meta.name}
        </div>
        <div className="sb-phase-meta">{metaText}</div>
      </div>
      <h3 className="sb-phase-title">{meta.title}</h3>
    </>
  );
}

function Token({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="sb-id-token">
      <div className="k">{k}</div>
      <div className="v">{children}</div>
    </div>
  );
}

function StructCard({
  i,
  label,
  count,
  items,
  iconPath,
  iconCircle = false,
  iconCircleSmall = false,
}: {
  i: number;
  label: string;
  count: string;
  items: readonly string[];
  iconPath: string;
  iconCircle?: boolean;
  iconCircleSmall?: boolean;
}) {
  return (
    <div className="sb-struct-card" data-i={i}>
      <div className="sb-struct-head">
        <span className="icon">
          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
            {iconCircle ? <circle cx={12} cy={12} r={9} /> : null}
            {iconCircleSmall ? <circle cx={12} cy={10} r={3} /> : null}
            <path d={iconPath} />
          </svg>
        </span>
        {label}
        <span className="sb-struct-count">{count}</span>
      </div>
      <div className="sb-struct-body">
        {items.slice(0, 4).map((it) => (
          <div key={it} className="item">
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  on,
  iconPath,
  iconCircle = false,
  children,
}: {
  title: string;
  on: boolean;
  iconPath: string;
  iconCircle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className={`sb-module ${on ? "is-on" : ""}`}>
      <div className="sb-module-head">
        <span className="icon">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
            {iconCircle ? <circle cx={8.5} cy={7} r={4} /> : null}
            <path d={iconPath} />
          </svg>
        </span>
        <h4>{title}</h4>
        <span className="status">{on ? "live" : "queued"}</span>
      </div>
      <div className="sb-module-mock">{children}</div>
    </article>
  );
}

function Lead({
  i,
  who,
  tag,
  amount,
}: {
  i: number;
  who: string;
  tag: string;
  amount: string;
}) {
  return (
    <div className="sb-lead" data-i={i}>
      <span>{who}</span>
      <span className="tag">{tag}</span>
      <span className="amount">{amount}</span>
    </div>
  );
}

function Stat({
  k,
  v,
  small,
  smallValue = false,
}: {
  k: string;
  v: string;
  small?: string;
  /** When true, shrink the value text — used by the Archetype tile so the
   *  longer "Cinematic aspirational" string still fits in the stat box. */
  smallValue?: boolean;
}) {
  return (
    <div className="sb-reveal-stat">
      <div className="k">{k}</div>
      <div className="v" style={smallValue ? { fontSize: 14 } : undefined}>
        {v}
        {small ? <small>{small}</small> : null}
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────
// Ported verbatim from Build Animation v2.html. Scoped under the `.sb-*`
// prefix so we don't leak into the dashboard. styled-jsx `global` is
// required because the archetype-token cascade (`--sb-accent`, etc.) has
// to apply to deeply-nested children of <div className="sb-stage">.

function StageStyles() {
  return (
    <style jsx global>{`
      /* 2026-05-22 — Theme tokens are READ FROM THE HOST via existing
         CSS vars on :root and .dark (declared in globals.css +
         design-tokens.css). No internal theme state; no [data-theme=...]
         attribute. The .sb-stage maps its internal token names onto host
         vars so deeply-nested .sb-* rules keep working without touching
         every selector. The grain / shadow values are theme-aware via
         the .dark cascade override below. */
      .sb-stage {
        --sb-bg: var(--background);
        --sb-surface: var(--card);
        --sb-surface-2: var(--muted);
        --sb-surface-deep: color-mix(in oklab, var(--muted) 70%, var(--background));
        --sb-border: var(--border);
        --sb-border-soft: color-mix(in oklab, var(--border) 60%, transparent);
        --sb-ink: var(--foreground);
        --sb-ink-2: color-mix(in oklab, var(--foreground) 78%, transparent);
        --sb-ink-3: var(--muted-foreground);
        --sb-ink-4: color-mix(in oklab, var(--muted-foreground) 60%, transparent);
        --sb-glow: color-mix(in oklab, var(--sb-accent, var(--primary)) 9%, transparent);
        --sb-grain: rgba(0, 0, 0, 0.025);
        --sb-shadow-card: var(--shadow-card, 0 18px 48px rgba(15, 23, 42, 0.08), 0 1px 0 rgba(255, 255, 255, 0.85));
        --sb-shadow-mock: 0 2px 12px rgba(15, 23, 42, 0.06);
      }
      :is(.dark) .sb-stage {
        --sb-grain: rgba(255, 255, 255, 0.035);
        --sb-glow: color-mix(in oklab, var(--sb-accent, var(--primary)) 14%, transparent);
        --sb-shadow-card: var(--shadow-card, 0 24px 72px rgba(0, 0, 0, 0.4), 0 1px 0 rgba(255, 255, 255, 0.04));
        --sb-shadow-mock: 0 8px 28px rgba(0, 0, 0, 0.3);
      }

      /* ARCHETYPE TOKENS — brand colors per detected vertical. Independent
         from theme tokens; never re-declared off a data-theme attribute. */
      .sb-stage[data-archetype="bold-urgency"] {
        --sb-accent: #cc2d2d;
        --sb-accent-2: #1a1a1a;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="clinical-trust"] {
        --sb-accent: #1e3a5f;
        --sb-accent-2: #7a1f24;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="cinematic-aspirational"] {
        --sb-accent: #a08562;
        --sb-accent-2: #1a1a1a;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="technical-restrained"] {
        --sb-accent: #2a2a2a;
        --sb-accent-2: #7a7a7a;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="soft-residential"] {
        --sb-accent: #3d6e4f;
        --sb-accent-2: #a08562;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="editorial-warm"] {
        --sb-accent: #9c2b1d;
        --sb-accent-2: #3a3530;
        --sb-accent-ink: #ffffff;
      }
      .sb-stage[data-archetype="brutalist"] {
        --sb-accent: #0a0a0a;
        --sb-accent-2: #d92020;
        --sb-accent-ink: #ffffff;
      }

      /* Theme-specific archetype overrides for contrast. The data-theme
         attribute is gone — we drive these off the host's .dark cascade
         instead. Light is the default; .dark overrides. */
      .sb-stage[data-archetype="technical-restrained"] {
        --sb-accent: #3f3f46;
      }
      .sb-stage[data-archetype="brutalist"] {
        --sb-accent: #0a0a0a;
      }
      :is(.dark) .sb-stage[data-archetype="brutalist"] {
        --sb-accent: #f4f4f5;
      }
      :is(.dark) .sb-stage[data-archetype="technical-restrained"] {
        --sb-accent: #d4d4d8;
      }

      /* STAGE shell — flow component. No outer card surface; the page
         background shows through. The atmosphere block (.sb-atmos) gives
         the canvas warmth without drawing a card boundary. Flex sizing
         lets the parent (clients-new-form.tsx wrapper) control height. */
      .sb-stage {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        height: 100%;
        isolation: isolate;
        background: transparent;
        color: var(--sb-ink);
        font-family: var(--font-geist-sans), 'Geist', system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
        overflow: hidden;
      }

      /* .sb-crumb removed 2026-05-22 — internal breadcrumb dropped in
         favor of the dashboard chrome's existing page header. The .dot
         pulse animation is preserved on the side panel's biz row. */

      .sb-canvas {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr;
        gap: 0;
        position: relative;
        min-height: 0;
      }
      @media (min-width: 1100px) {
        .sb-canvas {
          grid-template-columns: minmax(0, 1.7fr) minmax(360px, 1fr);
        }
      }

      .sb-atmos {
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .sb-atmos::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(50% 40% at 20% 30%, color-mix(in oklab, var(--sb-accent) 9%, transparent), transparent 70%),
          radial-gradient(40% 35% at 80% 75%, color-mix(in oklab, var(--sb-accent-2) 6%, transparent), transparent 70%);
      }
      :is(.dark) .sb-atmos::before {
        background:
          radial-gradient(55% 45% at 22% 30%, color-mix(in oklab, var(--sb-accent) 14%, transparent), transparent 70%),
          radial-gradient(45% 40% at 80% 75%, color-mix(in oklab, var(--sb-accent-2) 10%, transparent), transparent 70%);
      }
      .sb-atmos::after {
        content: '';
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(var(--sb-grain) 1px, transparent 1px),
          linear-gradient(90deg, var(--sb-grain) 1px, transparent 1px);
        background-size: 44px 44px;
        -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 88%);
        mask-image: radial-gradient(ellipse at center, black 30%, transparent 88%);
      }

      .sb-mock {
        position: relative;
        z-index: 1;
        padding: 40px 28px;
        display: flex;
        align-items: stretch;
        min-height: 520px;
      }
      @media (min-width: 768px) { .sb-mock { padding: 56px 40px; } }
      @media (min-width: 1100px) { .sb-mock { padding: 64px 56px; min-height: 720px; } }

      /* 2026-05-22 — Mock frame stripped of its outer surface (card
         background + border + shadow) so it doesn't draw a card-on-card
         boundary against the dashboard chrome. The phase mock surfaces
         inside (.sb-id-card, .sb-struct-card, .sb-module, .sb-act-pane,
         etc.) remain rendered as sub-cards because they represent
         workspace modules — that's the intentional product metaphor. */
      .sb-mock-frame {
        position: relative;
        flex: 1;
        display: flex;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        overflow: hidden;
      }

      .sb-reg {
        position: absolute;
        width: 14px;
        height: 14px;
      }
      .sb-reg::before, .sb-reg::after {
        content: '';
        position: absolute;
        background: currentColor;
      }
      .sb-reg::before { width: 14px; height: 1px; }
      .sb-reg::after { width: 1px; height: 14px; }
      .sb-reg.tl {
        top: 18px;
        left: 18px;
        color: color-mix(in oklab, var(--sb-accent) 60%, transparent);
      }
      .sb-reg.tl::before { top: 0; left: 0; }
      .sb-reg.tl::after { top: 0; left: 0; }
      .sb-reg.tr {
        top: 18px;
        right: 18px;
        color: color-mix(in oklab, var(--sb-accent) 60%, transparent);
      }
      .sb-reg.tr::before { top: 0; right: 0; }
      .sb-reg.tr::after { top: 0; right: 0; }
      .sb-reg.bl {
        bottom: 18px;
        left: 18px;
        color: color-mix(in oklab, var(--sb-accent) 60%, transparent);
      }
      .sb-reg.bl::before { bottom: 0; left: 0; }
      .sb-reg.bl::after { bottom: 0; left: 0; }
      .sb-reg.br {
        bottom: 18px;
        right: 18px;
        color: color-mix(in oklab, var(--sb-accent) 60%, transparent);
      }
      .sb-reg.br::before { bottom: 0; right: 0; }
      .sb-reg.br::after { bottom: 0; right: 0; }

      .sb-phases {
        position: relative;
        flex: 1;
        display: flex;
        align-items: stretch;
      }
      .sb-phase {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        padding: 36px 40px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 360ms ease;
        gap: 18px;
      }
      .sb-phase.is-active {
        opacity: 1;
        pointer-events: auto;
        transition: opacity 480ms ease;
      }
      @media (max-width: 767px) {
        .sb-phase { padding: 24px 22px; }
      }
      .sb-phase-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 14px;
      }
      .sb-phase-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        font-weight: 500;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: color-mix(in oklab, var(--sb-accent) 88%, var(--sb-ink-2));
      }
      .sb-phase-label .num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 5px;
        background: color-mix(in oklab, var(--sb-accent) 14%, transparent);
        border: 1px solid color-mix(in oklab, var(--sb-accent) 30%, transparent);
        color: var(--sb-accent);
        font-size: 10.5px;
        font-variant-numeric: tabular-nums;
      }
      .sb-phase-title {
        margin: 0;
        font-family: 'Geist', sans-serif;
        font-weight: 600;
        font-size: clamp(20px, 2.4vw, 28px);
        letter-spacing: -0.022em;
        line-height: 1.1;
        color: var(--sb-ink);
      }
      .sb-phase-meta {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--sb-ink-3);
        letter-spacing: 0.02em;
      }
      .sb-phase-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      /* PHASE 1 — SCAN */
      .sb-scan {
        background: var(--sb-surface-deep);
        border: 1px solid var(--sb-border);
        border-radius: 10px;
        padding: 22px 24px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 13px;
        line-height: 1.65;
        color: var(--sb-ink-2);
        flex: 1;
        overflow: hidden;
      }
      .sb-scan .ln { display: flex; align-items: baseline; gap: 8px; }
      .sb-scan .ln .p { color: color-mix(in oklab, var(--sb-accent) 80%, var(--sb-ink-3)); }
      .sb-scan .ln .ok { color: oklch(0.65 0.14 158); }
      .sb-scan .ln .v { color: var(--sb-ink); font-weight: 500; }
      .sb-scan .ln .dim { color: var(--sb-ink-3); }
      .sb-scan .caret {
        display: inline-block;
        width: 8px;
        height: 14px;
        background: var(--sb-accent);
        vertical-align: middle;
        animation: sb-caret 1s steps(2, end) infinite;
      }
      @keyframes sb-caret { 50% { opacity: 0; } }

      /* PHASE 2 — IDENTITY */
      .sb-identity {
        flex: 1;
        display: grid;
        gap: 18px;
        grid-template-columns: 1.4fr 1fr;
        align-items: stretch;
      }
      @media (max-width: 767px) {
        .sb-identity { grid-template-columns: 1fr; }
      }
      .sb-id-card {
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 14px;
        box-shadow: var(--sb-shadow-mock);
      }
      .sb-id-name {
        margin: 0;
        font-size: clamp(28px, 3.4vw, 40px);
        font-weight: 600;
        letter-spacing: -0.028em;
        line-height: 1.05;
        color: var(--sb-ink);
        transition: opacity 240ms ease;
      }
      .sb-id-name[data-inferred="yes"] { color: var(--sb-ink-2); }
      .sb-id-niche {
        margin: 0;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11.5px;
        letter-spacing: 0.04em;
        color: var(--sb-ink-3);
      }
      .sb-id-voice {
        margin: 0;
        font-size: 14.5px;
        color: var(--sb-ink-2);
        line-height: 1.55;
        text-wrap: pretty;
      }
      .sb-id-tokens {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin-top: auto;
      }
      .sb-id-token {
        padding: 12px;
        border-radius: 8px;
        background: var(--sb-surface-2);
        border: 1px solid var(--sb-border-soft);
      }
      .sb-id-token .k {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 9.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-id-token .v {
        margin-top: 2px;
        font-size: 13px;
        font-weight: 500;
        color: var(--sb-ink);
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .sb-swatch {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        background: var(--sb-accent);
        flex-shrink: 0;
        box-shadow: 0 0 0 1px color-mix(in oklab, var(--sb-ink) 8%, transparent);
      }
      .sb-id-poster {
        background: var(--sb-accent);
        color: var(--sb-accent-ink);
        border-radius: 12px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 220px;
        box-shadow: var(--sb-shadow-mock);
        position: relative;
        overflow: hidden;
      }
      .sb-id-poster::after {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(50% 70% at 100% 0%, rgba(255, 255, 255, 0.18), transparent 60%),
          radial-gradient(40% 40% at 0% 100%, rgba(0, 0, 0, 0.18), transparent 60%);
        pointer-events: none;
      }
      .sb-id-poster-kicker {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.75;
        position: relative;
      }
      .sb-id-poster-name {
        margin: 0;
        font-family: 'Geist', sans-serif;
        font-weight: 700;
        font-size: clamp(22px, 2.6vw, 32px);
        letter-spacing: -0.022em;
        line-height: 1.05;
        position: relative;
      }
      .sb-id-poster-tag {
        margin: 0;
        font-size: 13px;
        opacity: 0.82;
        position: relative;
      }

      /* PHASE 3 — STRUCTURE */
      .sb-struct {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        align-content: start;
      }
      @media (max-width: 767px) {
        .sb-struct { grid-template-columns: 1fr; }
      }
      .sb-struct-card {
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        border-radius: 10px;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        position: relative;
        box-shadow: var(--sb-shadow-mock);
        opacity: 0;
        transform: translateY(8px);
        animation: sb-struct-in 400ms ease forwards;
      }
      .sb-struct-card[data-i="1"] { animation-delay: 0.1s; }
      .sb-struct-card[data-i="2"] { animation-delay: 0.3s; }
      .sb-struct-card[data-i="3"] { animation-delay: 0.5s; }
      .sb-struct-card[data-i="4"] { animation-delay: 0.7s; }
      @keyframes sb-struct-in {
        to { opacity: 1; transform: translateY(0); }
      }
      .sb-struct-head {
        display: flex;
        align-items: center;
        gap: 9px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-struct-head .icon {
        width: 22px;
        height: 22px;
        border-radius: 6px;
        background: color-mix(in oklab, var(--sb-accent) 14%, var(--sb-surface-2));
        color: var(--sb-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in oklab, var(--sb-accent) 28%, transparent);
      }
      .sb-struct-body { display: flex; flex-direction: column; gap: 4px; }
      .sb-struct-body .item {
        font-size: 13.5px;
        color: var(--sb-ink);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sb-struct-body .item::before {
        content: '';
        width: 4px;
        height: 4px;
        background: var(--sb-accent);
        border-radius: 2px;
        flex-shrink: 0;
      }
      .sb-struct-count {
        margin-left: auto;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--sb-ink-3);
        font-variant-numeric: tabular-nums;
      }

      /* PHASE 4 — MODULES */
      .sb-modules {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px;
      }
      .sb-module {
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        border-radius: 12px;
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: var(--sb-shadow-mock);
        opacity: 0.45;
        transition: opacity 320ms ease, border-color 320ms ease, transform 320ms ease;
      }
      .sb-module.is-on {
        opacity: 1;
        border-color: color-mix(in oklab, var(--sb-accent) 35%, var(--sb-border));
        transform: translateY(-1px);
      }
      .sb-module-head { display: flex; align-items: center; gap: 10px; }
      .sb-module-head .icon {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: color-mix(in oklab, var(--sb-accent) 14%, var(--sb-surface-2));
        color: var(--sb-accent);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid color-mix(in oklab, var(--sb-accent) 26%, transparent);
        flex-shrink: 0;
      }
      .sb-module-head h4 {
        margin: 0;
        font-size: 14.5px;
        font-weight: 600;
        color: var(--sb-ink);
        letter-spacing: -0.012em;
      }
      .sb-module-head .status {
        margin-left: auto;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-module.is-on .status { color: oklch(0.65 0.14 158); }
      .sb-module-mock {
        background: var(--sb-surface-2);
        border: 1px solid var(--sb-border-soft);
        border-radius: 8px;
        padding: 12px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--sb-ink-2);
        min-height: 80px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .sb-module-mock .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .sb-module-mock .row .v { color: var(--sb-ink); font-weight: 500; }
      .sb-module-mock .row.is-cta {
        background: var(--sb-accent);
        color: var(--sb-accent-ink);
        padding: 7px 10px;
        border-radius: 6px;
        margin-top: 4px;
        font-weight: 600;
        letter-spacing: 0.02em;
        justify-content: center;
      }
      .sb-module-mock .bubble {
        padding: 7px 10px;
        border-radius: 10px;
        max-width: 85%;
        line-height: 1.4;
        font-family: 'Geist', sans-serif;
        font-size: 11.5px;
      }
      .sb-module-mock .bubble.bot {
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        color: var(--sb-ink);
        align-self: flex-start;
        border-bottom-left-radius: 4px;
      }
      .sb-module-mock .bubble.user {
        background: var(--sb-accent);
        color: var(--sb-accent-ink);
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }

      /* PHASE 5 — ACTIVATION */
      .sb-activate {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      @media (max-width: 767px) {
        .sb-activate { grid-template-columns: 1fr; }
      }
      .sb-act-pane {
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        border-radius: 12px;
        padding: 18px;
        box-shadow: var(--sb-shadow-mock);
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 240px;
      }
      .sb-act-head {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-act-head .dot {
        width: 6px;
        height: 6px;
        border-radius: 3px;
        background: var(--sb-accent);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--sb-accent) 22%, transparent);
        animation: sb-blink 1.4s ease-in-out infinite;
      }
      .sb-lead {
        display: grid;
        grid-template-columns: 1fr auto auto;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        background: var(--sb-surface-2);
        border: 1px solid var(--sb-border-soft);
        border-radius: 7px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11.5px;
        color: var(--sb-ink);
        opacity: 0;
        transform: translateX(-6px);
        animation: sb-lead-in 360ms ease forwards;
      }
      .sb-lead[data-i="1"] { animation-delay: 0.1s; }
      .sb-lead[data-i="2"] { animation-delay: 0.5s; }
      .sb-lead[data-i="3"] { animation-delay: 0.9s; }
      .sb-lead[data-i="4"] { animation-delay: 1.3s; }
      .sb-lead[data-i="5"] { animation-delay: 1.7s; }
      @keyframes sb-lead-in {
        to { opacity: 1; transform: translateX(0); }
      }
      .sb-lead .tag {
        font-size: 9.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        background: color-mix(in oklab, var(--sb-accent) 16%, transparent);
        color: var(--sb-accent);
      }
      .sb-lead .amount {
        color: var(--sb-ink-2);
        font-variant-numeric: tabular-nums;
      }
      .sb-publish-browser {
        margin-top: auto;
        background: var(--sb-surface-2);
        border: 1px solid var(--sb-border-soft);
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .sb-publish-browser .dots {
        display: inline-flex;
        gap: 4px;
      }
      .sb-publish-browser .dots span {
        width: 7px;
        height: 7px;
        border-radius: 4px;
        background: var(--sb-border);
      }
      .sb-publish-browser .dots span:nth-child(1) { background: #ff5f57; }
      .sb-publish-browser .dots span:nth-child(2) { background: #febc2e; }
      .sb-publish-browser .dots span:nth-child(3) { background: #28c840; }
      .sb-publish-browser .addr {
        flex: 1;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--sb-ink-2);
        background: var(--sb-surface);
        border: 1px solid var(--sb-border-soft);
        border-radius: 5px;
        padding: 4px 8px;
      }
      .sb-publish-browser .addr .domain {
        color: var(--sb-ink);
        font-weight: 500;
      }
      .sb-publish-status {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: oklch(0.65 0.14 158);
      }
      .sb-publish-preview {
        background: var(--sb-accent);
        color: var(--sb-accent-ink);
        border-radius: 8px;
        padding: 16px;
        min-height: 100px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 8px;
        margin-top: 4px;
        position: relative;
        overflow: hidden;
      }
      .sb-publish-preview::after {
        content: '';
        position: absolute;
        inset: 0;
        background: radial-gradient(40% 60% at 100% 0%, rgba(255, 255, 255, 0.18), transparent 60%);
        pointer-events: none;
      }
      .sb-publish-preview .arche {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        opacity: 0.75;
      }
      .sb-publish-preview .h {
        font-family: 'Geist', sans-serif;
        font-weight: 700;
        font-size: 16px;
        letter-spacing: -0.018em;
        line-height: 1.1;
        position: relative;
      }
      .sb-publish-preview .s {
        font-size: 12px;
        opacity: 0.85;
        position: relative;
      }

      /* PHASE 6 — REVEAL */
      .sb-reveal {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .sb-reveal-banner {
        background: linear-gradient(135deg,
          color-mix(in oklab, var(--sb-accent) 14%, var(--sb-surface)) 0%,
          var(--sb-surface) 60%);
        border: 1px solid color-mix(in oklab, var(--sb-accent) 28%, var(--sb-border));
        border-radius: 12px;
        padding: 22px;
        box-shadow: var(--sb-shadow-mock);
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .sb-reveal-tag {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--sb-accent);
      }
      .sb-reveal-tag::before {
        content: '';
        width: 7px;
        height: 7px;
        border-radius: 4px;
        background: oklch(0.65 0.14 158);
        box-shadow: 0 0 0 3px color-mix(in oklab, oklch(0.65 0.14 158) 22%, transparent);
      }
      .sb-reveal-name {
        margin: 0;
        font-family: 'Geist', sans-serif;
        font-weight: 600;
        font-size: clamp(24px, 3vw, 36px);
        letter-spacing: -0.025em;
        line-height: 1.05;
        color: var(--sb-ink);
      }
      .sb-reveal-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }
      @media (max-width: 767px) {
        .sb-reveal-stats { grid-template-columns: repeat(2, 1fr); }
      }
      .sb-reveal-stat {
        padding: 14px 16px;
        background: var(--sb-surface);
        border: 1px solid var(--sb-border);
        border-radius: 10px;
      }
      .sb-reveal-stat .k {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 9.5px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-reveal-stat .v {
        margin-top: 4px;
        font-family: 'Geist', sans-serif;
        font-weight: 600;
        font-size: 22px;
        color: var(--sb-ink);
        letter-spacing: -0.018em;
        font-variant-numeric: tabular-nums;
      }
      .sb-reveal-stat .v small {
        font-size: 0.55em;
        color: var(--sb-ink-3);
        margin-left: 2px;
        font-weight: 500;
      }
      .sb-reveal-ctas {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .sb-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 0 18px;
        height: 44px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: -0.005em;
        transition: transform 120ms ease, background 160ms ease, color 160ms ease, border-color 160ms ease;
      }
      .sb-btn:active { transform: translateY(1px); }
      .sb-btn-primary {
        background: var(--sb-accent);
        color: var(--sb-accent-ink);
        border: 1px solid var(--sb-accent);
        box-shadow: 0 8px 24px color-mix(in oklab, var(--sb-accent) 28%, transparent);
      }
      .sb-btn-ghost {
        background: var(--sb-surface);
        color: var(--sb-ink);
        border: 1px solid var(--sb-border);
      }

      /* 2026-06-03 — Pending CTA state. The build clock can reach REVEAL
         before the orchestrator done event fires; rather than a dead
         look-alike button, the primary CTA shows an explicit finalizing
         state (spinner + shimmer sweep) and flips to a real anchor the
         moment revealLinks arrives. */
      .sb-btn.is-pending { cursor: progress; pointer-events: none; }
      .sb-btn-ghost.is-pending { opacity: 0.55; }
      .sb-btn-ghost.is-disabled { opacity: 0.4; cursor: default; pointer-events: none; }
      .sb-btn-primary.is-pending {
        position: relative;
        overflow: hidden;
        background: color-mix(in oklab, var(--sb-accent) 60%, var(--sb-surface));
        border-color: color-mix(in oklab, var(--sb-accent) 38%, var(--sb-border));
        color: color-mix(in oklab, var(--sb-accent-ink) 88%, transparent);
        box-shadow: none;
      }
      .sb-btn-primary.is-pending::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, color-mix(in oklab, var(--sb-accent-ink) 24%, transparent), transparent);
        transform: translateX(-100%);
        animation: sb-btn-shimmer 1.5s ease-in-out infinite;
      }
      .sb-btn-spinner {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
        border-radius: 50%;
        border: 2px solid color-mix(in oklab, var(--sb-accent-ink) 32%, transparent);
        border-top-color: var(--sb-accent-ink);
        animation: sb-spin 0.7s linear infinite;
      }
      @keyframes sb-spin { to { transform: rotate(360deg); } }
      @keyframes sb-btn-shimmer {
        0% { transform: translateX(-100%); }
        55%, 100% { transform: translateX(100%); }
      }
      .sb-reveal-hint {
        margin: 2px 0 0;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        letter-spacing: 0.01em;
        color: var(--sb-ink-3);
      }
      /* Pending banner pulses an amber dot instead of the live green. */
      .sb-reveal-banner.is-pending {
        border-color: color-mix(in oklab, oklch(0.74 0.16 75) 30%, var(--sb-border));
      }
      .sb-reveal-banner.is-pending .sb-reveal-tag { color: oklch(0.62 0.13 75); }
      .sb-reveal-banner.is-pending .sb-reveal-tag::before {
        background: oklch(0.74 0.16 75);
        box-shadow: 0 0 0 3px color-mix(in oklab, oklch(0.74 0.16 75) 22%, transparent);
        animation: sb-pulse-dot 1.2s ease-in-out infinite;
      }
      @keyframes sb-pulse-dot { 50% { opacity: 0.4; } }

      /* RIGHT — phase narration panel */
      .sb-side {
        position: relative;
        z-index: 1;
        padding: 32px 28px 40px;
        display: flex;
        flex-direction: column;
        gap: 24px;
        background: linear-gradient(180deg, transparent 0%, color-mix(in oklab, var(--sb-bg) 90%, transparent) 100%);
        border-left: 1px solid var(--sb-border);
      }
      @media (max-width: 1099px) {
        .sb-side {
          border-left: none;
          border-top: 1px solid var(--sb-border);
          padding: 32px 28px;
        }
      }
      @media (min-width: 1100px) {
        .sb-side { padding: 64px 40px; }
      }
      .sb-biz {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-bottom: 22px;
        border-bottom: 1px solid var(--sb-border);
      }
      .sb-biz-row { display: flex; align-items: center; gap: 8px; }
      .sb-biz-row .badge {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 9.5px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        padding: 3px 8px;
        border-radius: 999px;
        background: color-mix(in oklab, var(--sb-accent) 12%, var(--sb-surface));
        border: 1px solid color-mix(in oklab, var(--sb-accent) 28%, var(--sb-border));
        color: var(--sb-accent);
      }
      .sb-biz-row .stage-mark {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
      }
      .sb-biz-row .stage-mark.is-inferred {
        color: color-mix(in oklab, var(--sb-accent) 60%, var(--sb-ink-3));
      }
      .sb-biz-row .stage-mark.is-real {
        color: oklch(0.65 0.14 158);
      }
      .sb-biz-name {
        margin: 0;
        font-family: 'Geist', sans-serif;
        font-weight: 600;
        font-size: clamp(22px, 2.6vw, 30px);
        letter-spacing: -0.026em;
        line-height: 1.05;
        color: var(--sb-ink);
        transition: opacity 240ms ease;
      }
      .sb-biz-niche {
        margin: 0;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11.5px;
        color: var(--sb-ink-3);
        letter-spacing: 0.005em;
      }

      .sb-ticker {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .sb-tick {
        display: grid;
        grid-template-columns: 22px 1fr auto;
        gap: 14px;
        align-items: center;
        padding: 14px 4px;
        border-top: 1px solid var(--sb-border-soft);
        position: relative;
      }
      .sb-tick:first-child { border-top: none; }
      .sb-tick .num {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11.5px;
        color: var(--sb-ink-3);
        font-variant-numeric: tabular-nums;
        text-align: right;
      }
      .sb-tick .label { display: flex; flex-direction: column; gap: 2px; }
      .sb-tick .label .name {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--sb-ink-3);
        transition: color 200ms ease;
      }
      .sb-tick .label .desc {
        font-size: 13px;
        color: var(--sb-ink-2);
        letter-spacing: -0.005em;
        line-height: 1.4;
      }
      .sb-tick .status {
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10.5px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--sb-ink-4);
      }
      .sb-tick.is-past .num,
      .sb-tick.is-past .label .name { color: var(--sb-ink-2); }
      .sb-tick.is-past .status { color: oklch(0.62 0.14 158); }
      .sb-tick.is-active .num { color: var(--sb-accent); font-weight: 600; }
      .sb-tick.is-active .label .name { color: var(--sb-accent); }
      .sb-tick.is-active .label .desc { color: var(--sb-ink); }
      .sb-tick.is-active .status { color: var(--sb-accent); }
      .sb-tick.is-active::before {
        content: '';
        position: absolute;
        left: -22px;
        top: 0;
        bottom: 0;
        width: 3px;
        border-radius: 2px;
        background: var(--sb-accent);
      }
      @media (max-width: 1099px) {
        .sb-tick.is-active::before { left: -10px; }
      }
      .sb-tick .bar {
        grid-column: 2 / 4;
        height: 2px;
        background: var(--sb-border-soft);
        border-radius: 1px;
        overflow: hidden;
        margin-top: 6px;
        position: relative;
      }
      .sb-tick .bar .fill {
        position: absolute;
        inset: 0;
        background: var(--sb-accent);
        transition: width 160ms linear;
      }
      .sb-tick.is-past .bar .fill { width: 100% !important; }

      .sb-side-foot {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 11px;
        color: var(--sb-ink-3);
        letter-spacing: 0.04em;
        padding-top: 22px;
        border-top: 1px solid var(--sb-border-soft);
      }
      .sb-side-foot b { color: var(--sb-ink); font-weight: 500; }

      /* SOUL FLASH */
      .sb-soul-flash {
        position: absolute;
        top: -12px;
        right: 0;
        font-family: 'Geist Mono', ui-monospace, monospace;
        font-size: 10px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 4px 8px;
        border-radius: 999px;
        background: oklch(0.65 0.14 158);
        color: oklch(0.1 0.04 158);
        opacity: 0;
        pointer-events: none;
        transition: opacity 240ms ease, transform 240ms ease;
        transform: translateY(4px);
        white-space: nowrap;
      }
      .sb-soul-flash.is-on { opacity: 1; transform: translateY(0); }

      @keyframes sb-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }

      /* Reduced motion (CSS layer) */
      @media (prefers-reduced-motion: reduce) {
        .sb-phase { transition: none; }
        .sb-struct-card, .sb-lead { animation: none; opacity: 1; transform: none; }
        .sb-act-head .dot, .sb-reveal-tag::before { animation: none; }
        .sb-scan .caret { animation: none; }
        .sb-btn-spinner,
        .sb-btn-primary.is-pending::after,
        .sb-reveal-banner.is-pending .sb-reveal-tag::before { animation: none; }
      }
      /* Reduced motion (JS-controlled layer) */
      .sb-stage[data-reduced="yes"] .sb-phase { transition: none; }
      .sb-stage[data-reduced="yes"] .sb-struct-card,
      .sb-stage[data-reduced="yes"] .sb-lead {
        animation: none;
        opacity: 1;
        transform: none;
      }
      .sb-stage[data-reduced="yes"] .sb-act-head .dot,
      .sb-stage[data-reduced="yes"] .sb-reveal-tag::before {
        animation: none;
      }
      .sb-stage[data-reduced="yes"] .sb-scan .caret { animation: none; }
      .sb-stage[data-reduced="yes"] .sb-btn-spinner,
      .sb-stage[data-reduced="yes"] .sb-btn-primary.is-pending::after,
      .sb-stage[data-reduced="yes"] .sb-reveal-banner.is-pending .sb-reveal-tag::before {
        animation: none;
      }
      .sb-stage[data-reduced="yes"] .sb-tick.is-active { opacity: 1; }
      .sb-stage[data-reduced="yes"] .sb-tick.is-active .bar .fill {
        transition: none;
      }
    `}</style>
  );
}
