// packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx
// Client-side form for the /clients/new page.
//
// Phase P: Replaced the at-rest grid layout (hero column + aside checklist)
// with the cinematic IdleScene from Claude Design. When the operator submits,
// the IdleScene crossfades into the existing 60s build animation over 600ms.
// Both scenes live on the same 720x960 dark canvas so the transition is one
// continuous shot.
//
// Phase Q: Added paste-mode tab (no website → paste business info). The
// IdleScene now has an internal tab switcher; this form provides two
// independent submit callbacks and two input pairs. The paste path opens
// an EventSource against /api/v1/web/workspaces/create-from-paste?text=...
// and shares the same done/error listener logic and BYOK error path as the
// URL mode.
//
// The per-step SSE checklist listeners have been dropped (the build animation
// runs on its own clock). The "done" and "error" listeners are preserved.
"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import type { DetectVerticalInput } from "@/lib/workspace/detect-vertical";
import { BuildAnimation } from "./build-animation";
import { IdleScene } from "./build-animation/idle-scene";
import type { DesignId } from "@/components/clients/design-picker/types";

// ── BYOK copy ─────────────────────────────────────────────────────────────────
const COPY = {
  errors: {
    invalid_url: "That URL doesn't look right. Check for typos and try again.",
    extraction_failed:
      "We couldn't read that site. Try a different URL — a homepage works best.",
    workspace_limit_short:
      "You're at your workspace limit. Upgrade to add this client.",
    internal_error:
      "Something broke on our end. Your URL is still here — give it another go.",
    internal_retry: "Try again",
    byokHeading: "Add your Anthropic key first",
    byokBody:
      "We use your Anthropic API key to read the site and build the workspace. We store it encrypted; you can rotate it any time.",
    byokLabel: "Anthropic API key",
    byokSave: "Save key and continue",
    byokSaving: "Saving...",
    byokCancel: "Use a different approach",
  },
};

type LimitInfo = {
  tier: "free" | "growth";
  used: number;
  limit: number;
  upgradeUrl: string;
};

type ClientsNewFormProps = {
  // "proposal" → compact mode: suppresses skip link inside IdleScene is still
  // shown as-is; the cinematic canvas copy is generic enough to work for
  // workspace activation. The hero copy inside IdleScene reads "Spin up a
  // client workspace in 60 seconds." — acceptable for proposal activations too.
  // No special treatment for proposal source in Phase P; noted in report.
  source?: string;
  // 2026-05-22 — Prompt forwarding from the marketing hero. The signup
  // flow embeds these into /signup → /signup/billing → /clients/new so
  // the visitor's original URL or business description survives the
  // round trip. autoSubmit fires the SSE build on mount when intent=build.
  //
  // 2026-05-23 — These come from the URL query string only. For long
  // paste payloads (`biz`), the marketing hero writes to
  // localStorage('sf-workspace-seed') instead — the form reads that
  // on mount and hydrates either tab from it as a fallback.
  prefillUrl?: string | null;
  prefillBiz?: string | null;
  autoSubmit?: boolean;
  // 2026-06-23 — Programmatic SEO/GEO deploy CTA. `prefillAgent` is the
  // canonical starter-pack id the visitor wants instantiated (from the
  // /agents/* "Deploy it for my business" link); `prefillVertical` is a niche
  // hint. Both are threaded onto the build SSE query string (as ?agent= and
  // ?niche=) so the create pipeline can fork that starter post-build and seed
  // the niche. They survive the same way the existing ?template=/?mode= picks
  // do — purely additive to the build request.
  prefillAgent?: string | null;
  prefillVertical?: string | null;
};

/**
 * Shape of the localStorage seed the marketing hero writes on submit.
 * Documented here so consumers (analytics, debug tooling) have a single
 * source of truth.
 *
 *   localStorage.setItem('sf-workspace-seed', JSON.stringify({
 *     kind: 'url' | 'biz',
 *     value: string,        // the URL or paste text the visitor typed
 *     at: number,           // Date.now() at submit time
 *   }))
 *
 * Read once on /clients/new mount, then removed to avoid replay on the
 * next visit to /clients/new (e.g. operator clicking "New workspace"
 * from the sidebar after building one).
 */
const STORAGE_KEY = "sf-workspace-seed";
const STORAGE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — covers magic-link delay

type StoredSeed = { kind: "url" | "biz"; value: string; at: number };

function readStoredSeed(): StoredSeed | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSeed>;
    if (
      (parsed.kind === "url" || parsed.kind === "biz") &&
      typeof parsed.value === "string" &&
      parsed.value.trim().length >= 3 &&
      typeof parsed.at === "number"
    ) {
      // Drop stale seeds — if the visitor abandoned the magic-link
      // and revisited /clients/new days later, we don't want to
      // auto-submit a long-stale prompt.
      if (Date.now() - parsed.at > STORAGE_MAX_AGE_MS) {
        return null;
      }
      return { kind: parsed.kind, value: parsed.value, at: parsed.at };
    }
  } catch {
    // Malformed JSON — ignore.
  }
  return null;
}

function clearStoredSeed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Quota or permission errors — non-fatal.
  }
}

export function ClientsNewForm({
  source = "default",
  prefillUrl = null,
  prefillBiz = null,
  autoSubmit = false,
  prefillAgent = null,
  prefillVertical = null,
}: ClientsNewFormProps) {
  // source is currently unused post-P but kept for future skip-link suppression
  void source;

  // 2026-06-23 — The canonical agent + vertical hint from a /agents/* deploy
  // link, stable across the component's lifetime, so both SSE builders can
  // append them to the create request. Refs (not state) — they never change
  // after mount and must not retrigger the build effect.
  const agentRef = useRef<string | null>(prefillAgent);
  const verticalRef = useRef<string | null>(prefillVertical);

  // Seed the inputs with the marketing-prompt prefill values. The
  // controlled-input contract is preserved by defaulting to "".
  //
  // 2026-05-23 — The actual localStorage read happens in the mount
  // effect below (can't access `window` during SSR). We initialize
  // from the URL query prefill here and hydrate from localStorage on
  // mount as a fallback.
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [bizInfo, setBizInfo] = useState(prefillBiz ?? "");
  // Tracks which mode was initially populated — used to set the
  // IdleScene's `initialTab`. Updated by the localStorage hydration
  // effect when the seed contains `kind: 'biz'`.
  const [initialTab, setInitialTab] = useState<"url" | "biz">(
    prefillBiz && !prefillUrl ? "biz" : "url",
  );
  const [submitted, setSubmitted] = useState(false);
  const [keepBuildMounted, setKeepBuildMounted] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [byokKey, setByokKey] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [upgradeInfo, setUpgradeInfo] = useState<LimitInfo | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // 2026-05-22 — v2 build animation reads the live EventSource to
  // crossfade the inferred biz name to the real one on `soul_built`.
  // Mirrored as state (not just a ref) so the BuildAnimation re-renders
  // when the stream opens/closes.
  const [liveEventSource, setLiveEventSource] = useState<EventSource | null>(null);
  // Snapshot of the input that triggered the build — fed to the v2
  // animation so detectVertical() can render archetype-aware mock copy
  // from the very first frame. Captured at submit time so the textbox
  // value can change underneath us without re-detecting.
  const [buildInput, setBuildInput] = useState<DetectVerticalInput | null>(null);
  // 2026-05-24 — URLs surfaced on the REVEAL phase's CTAs after `done`
  // fires. We populate this BEFORE the auto-redirect so the user has a
  // brief window to click into the workspace or share link manually.
  // The auto-redirect timer is then ~3.5s so the celebratory moment
  // actually lands instead of vanishing in 50ms.
  const [revealLinks, setRevealLinks] = useState<
    { open: string; share?: string | null } | null
  >(null);
  // 2026-06-04 — Operator's pre-build landing-design pick (the Design chip in
  // the idle scene). "auto" → the pipeline auto-picks by vertical; a concrete
  // template id is threaded to the create SSE as ?template= and overrides it.
  const [landingTemplate, setLandingTemplate] = useState<DesignId>("auto");
  // 2026-06-20 — Operator's pre-build light/dark mode pick (the Theme toggle
  // in the idle scene). "auto" → resolveThemeMode picks by archetype default;
  // "light"/"dark" are threaded as ?mode= and override it in runR1LandingStep.
  const [themeMode, setThemeMode] = useState<"auto" | "light" | "dark">("auto");
  // Tracks which mode was last submitted so BYOK retry re-submits the right stream.
  const lastModeRef = useRef<"url" | "biz">(prefillBiz && !prefillUrl ? "biz" : "url");
  // Guard so the autoSubmit effect only fires once per mount even if
  // strict-mode double-invokes the effect.
  const autoSubmittedRef = useRef(false);

  // a11y: stable ids
  const errorBannerId = useId();
  const byokHeadingId = useId();

  // Keep BuildAnimation mounted for 700ms after submitted goes false
  // so the 600ms fade-out animation can complete before unmounting.
  useEffect(() => {
    if (submitted) {
      setKeepBuildMounted(true);
      return;
    }
    const t = setTimeout(() => setKeepBuildMounted(false), 700);
    return () => clearTimeout(t);
  }, [submitted]);

  function startStream(targetUrl: string) {
    esRef.current?.close();
    lastModeRef.current = "url";

    setSubmitted(true);
    setBuildInput({ kind: "url", value: targetUrl });
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);

    const qs = new URLSearchParams({ url: targetUrl });
    if (landingTemplate && landingTemplate !== "auto") qs.set("template", landingTemplate);
    if (themeMode && themeMode !== "auto") qs.set("mode", themeMode);
    // 2026-06-23 — Carry the programmatic-SEO deploy intent into the build:
    // `agent` = the canonical starter to fork post-build; `niche` = the vertical
    // hint. The create-from-url route reads these from its query string.
    if (agentRef.current) qs.set("agent", agentRef.current);
    if (verticalRef.current) qs.set("niche", verticalRef.current);
    const es = new EventSource(`/api/v1/web/workspaces/create-from-url?${qs.toString()}`);
    esRef.current = es;
    setLiveEventSource(es);

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as {
        dashboardUrl: string;
        publicHomeUrl?: string | null;
      };
      es.close();
      setLiveEventSource(null);
      if (typeof window !== "undefined" && data.dashboardUrl) {
        // 2026-05-24 — Surface URLs on the REVEAL CTAs and give the user
        // ~3.5s to click "Open workspace" / "Share with client" before
        // auto-redirecting. The previous instant window.location.assign
        // made the celebratory REVEAL moment vanish in 50ms.
        setRevealLinks({ open: data.dashboardUrl, share: data.publicHomeUrl ?? null });
        window.setTimeout(() => {
          window.location.assign(data.dashboardUrl);
        }, 3500);
      }
    });

    es.addEventListener("error", (raw) => {
      const payload = (raw as MessageEvent).data;
      let data: { code?: number; reason?: string } & Partial<LimitInfo> = {};
      try {
        if (typeof payload === "string" && payload.length > 0) {
          data = JSON.parse(payload);
        }
      } catch {
        // Fall through to generic error banner.
      }
      es.close();
      setLiveEventSource(null);
      setSubmitted(false);

      if (data.code === 412) {
        setNeedsByok(true);
        return;
      }
      if (data.code === 402 && data.reason === "workspace_limit_reached") {
        setUpgradeInfo({
          tier: (data.tier as "free" | "growth") ?? "free",
          used: data.used ?? 0,
          limit: data.limit ?? 1,
          upgradeUrl: data.upgradeUrl ?? "/settings/billing",
        });
        return;
      }
      if (data.code === 400) {
        setErrorBanner(COPY.errors.invalid_url);
        return;
      }
      if (data.code === 422) {
        setErrorBanner(COPY.errors.extraction_failed);
        return;
      }
      setErrorBanner(COPY.errors.internal_error);
    });
  }

  // Same SSE listener logic for the paste path — opens EventSource against
  // the create-from-paste route with "text" as the query param.
  function startBizInfoStream(text: string) {
    esRef.current?.close();
    lastModeRef.current = "biz";

    setSubmitted(true);
    setBuildInput({ kind: "biz", value: text });
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);

    const qs = new URLSearchParams({ text });
    if (landingTemplate && landingTemplate !== "auto") qs.set("template", landingTemplate);
    if (themeMode && themeMode !== "auto") qs.set("mode", themeMode);
    // 2026-06-23 — Carry the programmatic-SEO deploy intent into the build (see
    // startStream): `agent` = canonical starter to fork; `niche` = vertical hint.
    if (agentRef.current) qs.set("agent", agentRef.current);
    if (verticalRef.current) qs.set("niche", verticalRef.current);
    const es = new EventSource(`/api/v1/web/workspaces/create-from-paste?${qs.toString()}`);
    esRef.current = es;
    setLiveEventSource(es);

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as {
        dashboardUrl: string;
        publicHomeUrl?: string | null;
      };
      es.close();
      setLiveEventSource(null);
      if (typeof window !== "undefined" && data.dashboardUrl) {
        // 2026-05-24 — Surface URLs on the REVEAL CTAs and give the user
        // ~3.5s to click "Open workspace" / "Share with client" before
        // auto-redirecting. The previous instant window.location.assign
        // made the celebratory REVEAL moment vanish in 50ms.
        setRevealLinks({ open: data.dashboardUrl, share: data.publicHomeUrl ?? null });
        window.setTimeout(() => {
          window.location.assign(data.dashboardUrl);
        }, 3500);
      }
    });

    es.addEventListener("error", (raw) => {
      const payload = (raw as MessageEvent).data;
      let data: { code?: number; reason?: string } & Partial<LimitInfo> = {};
      try {
        if (typeof payload === "string" && payload.length > 0) {
          data = JSON.parse(payload);
        }
      } catch {
        // Fall through to generic error banner.
      }
      es.close();
      setLiveEventSource(null);
      setSubmitted(false);

      if (data.code === 412) {
        setNeedsByok(true);
        return;
      }
      if (data.code === 402 && data.reason === "workspace_limit_reached") {
        setUpgradeInfo({
          tier: (data.tier as "free" | "growth") ?? "free",
          used: data.used ?? 0,
          limit: data.limit ?? 1,
          upgradeUrl: data.upgradeUrl ?? "/settings/billing",
        });
        return;
      }
      if (data.code === 400) {
        setErrorBanner(COPY.errors.invalid_url);
        return;
      }
      if (data.code === 422) {
        setErrorBanner(COPY.errors.extraction_failed);
        return;
      }
      setErrorBanner(COPY.errors.internal_error);
    });
  }

  useEffect(() => () => esRef.current?.close(), []);

  // 2026-05-22 — Auto-submit on mount when the visitor arrived from the
  // marketing prompt (?intent=build with ?url= or ?biz=). The mental
  // model is "type URL on marketing site → build starts" — making the
  // visitor click a second time on /clients/new would break that
  // promise. We gate on prefill values being non-empty so a bare
  // /clients/new?intent=build never auto-fires.
  //
  // 2026-05-23 — Bug #1: long paste payloads (`biz`) no longer travel
  // through the URL chain — they live in localStorage('sf-workspace-seed').
  // On mount we read that seed and hydrate either tab from it.
  // Resolution order:
  //   1. Query-string prefillUrl wins (short URL passthrough still works).
  //   2. Query-string prefillBiz wins (backward compat — should be
  //      empty going forward, but keeps old marketing links working).
  //   3. localStorage seed populates whichever tab matches its `kind`.
  // After hydrating from localStorage we clear the key so the seed
  // doesn't replay on the next visit to /clients/new.
  //
  // The ref guard is necessary for React Strict Mode's double-effect
  // invocation: without it the SSE stream would open twice, the second
  // one would lose the race, and we'd see a console warning + a
  // dangling EventSource.
  useEffect(() => {
    if (autoSubmittedRef.current) return;

    // Resolve the effective payload — query-string wins, then
    // localStorage seed as a fallback.
    let effectiveUrl = prefillUrl ?? "";
    let effectiveBiz = prefillBiz ?? "";

    if (!effectiveUrl && !effectiveBiz) {
      const seed = readStoredSeed();
      if (seed) {
        if (seed.kind === "url") {
          effectiveUrl = seed.value;
          setUrl(seed.value);
          setInitialTab("url");
        } else {
          effectiveBiz = seed.value;
          setBizInfo(seed.value);
          setInitialTab("biz");
        }
        // Clear the seed so a return visit to /clients/new (e.g. via
        // "New workspace" sidebar link after build finishes) doesn't
        // hydrate from a stale prompt.
        clearStoredSeed();
      }
    }

    // Auto-submit when the intent flag is on AND we have a payload
    // (from either URL or localStorage). Bare /clients/new with no
    // payload still never auto-fires.
    if (!autoSubmit) return;
    if (effectiveUrl) {
      autoSubmittedRef.current = true;
      startStream(effectiveUrl);
    } else if (effectiveBiz) {
      autoSubmittedRef.current = true;
      startBizInfoStream(effectiveBiz);
    }
    // Intentionally fires only when the autoSubmit signal flips on or
    // the prefill payload changes. startStream + startBizInfoStream are
    // stable closures defined above; including them in deps would be
    // noise. The autoSubmittedRef guard ensures we only fire once even
    // if a re-render makes this effect re-run.
  }, [autoSubmit, prefillUrl, prefillBiz]);

  async function saveByokAndRetry() {
    const key = byokKey.trim();
    if (!key) return;
    setByokSaving(true);
    try {
      const res = await fetch("/api/integrations/anthropic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "anthropic", apiKey: key }),
      });
      if (res.ok) {
        setByokKey("");
        if (lastModeRef.current === "biz") {
          startBizInfoStream(bizInfo);
        } else {
          startStream(url);
        }
      } else {
        setErrorBanner(COPY.errors.internal_error);
        setNeedsByok(false);
      }
    } catch {
      setErrorBanner(COPY.errors.internal_error);
      setNeedsByok(false);
    } finally {
      setByokSaving(false);
    }
  }

  // ── Error overlay rendered inside IdleScene ──────────────────────────────
  const errorOverlayNode = errorBanner ? (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <p id={errorBannerId}>{errorBanner}</p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setErrorBanner(null);
          startStream(url);
        }}
        aria-describedby={errorBannerId}
        className="mt-2"
      >
        {COPY.errors.internal_retry}
      </Button>
    </div>
  ) : null;

  // ── BYOK swap replaces the crossfade pair ────────────────────────────────
  if (needsByok) {
    return (
      <section
        role="region"
        aria-labelledby={byokHeadingId}
        className="space-y-3 animate-in fade-in-0 duration-200"
      >
        <h2 id={byokHeadingId} className="text-lg font-medium">
          {COPY.errors.byokHeading}
        </h2>
        <p className="text-sm text-muted-foreground">{COPY.errors.byokBody}</p>
        <Label htmlFor="byok-key" className="block text-sm">
          {COPY.errors.byokLabel}
        </Label>
        <Input
          id="byok-key"
          type="password"
          autoFocus
          placeholder="sk-ant-..."
          value={byokKey}
          onChange={(e) => setByokKey(e.target.value)}
          className="h-12 font-mono text-base"
        />
        <Button
          onClick={saveByokAndRetry}
          disabled={byokSaving || !byokKey.trim()}
          className="h-12 w-full"
        >
          {byokSaving ? COPY.errors.byokSaving : COPY.errors.byokSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setNeedsByok(false);
            setByokKey("");
          }}
          className="w-full text-muted-foreground"
        >
          {COPY.errors.byokCancel}
        </Button>
      </section>
    );
  }

  // ── IdleScene + BuildAnimation crossfade ──────────────────────────────────
  // Phase P2: `h-full` (with `min-h-[inherit]`) lets the wrapper inherit the
  // viewport-fill min-height set on <main>, so the Stage's ResizeObserver
  // sees a real parent height and can scale the canvas to fit both
  // dimensions.
  return (
    <>
      <div className="relative h-full min-h-[inherit]">
        {/* IdleScene — visible until submit */}
        <div
          className={`h-full transition-opacity duration-[600ms] ease-out ${
            submitted
              ? "pointer-events-none opacity-0 absolute inset-0"
              : "opacity-100"
          }`}
          aria-hidden={submitted}
        >
          <IdleScene
            url={url}
            onUrlChange={setUrl}
            onUrlSubmit={() => startStream(url)}
            urlDisabled={!url.trim() || submitted}
            bizInfo={bizInfo}
            onBizInfoChange={setBizInfo}
            onBizInfoSubmit={() => startBizInfoStream(bizInfo)}
            bizInfoDisabled={bizInfo.trim().length < 20 || submitted}
            errorOverlay={errorOverlayNode}
            // 2026-05-22 — Default to the biz tab when the marketing-prompt
            // forwarder passed ?biz= but no ?url=, so the visitor's
            // textarea is what they see first.
            //
            // 2026-05-23 — `initialTab` is now state, set by either
            // the query-string defaults OR the localStorage seed
            // hydration in the mount effect above.
            initialTab={initialTab}
            landingTemplate={landingTemplate}
            onLandingTemplateChange={setLandingTemplate}
            themeMode={themeMode}
            onThemeModeChange={setThemeMode}
          />
        </div>

        {/* BuildAnimation — visible after submit, mounted on first activation.
            v2 reads `input` (frozen snapshot of what the user typed at submit
            time) for synchronous archetype detection, and the live SSE
            EventSource for the Stage A → Stage B crossfade when
            `soul_built` arrives. */}
        {(submitted || keepBuildMounted) && (
          <div
            className={`absolute inset-0 transition-opacity duration-[600ms] ease-out ${
              submitted
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!submitted}
          >
            <BuildAnimation
              active={submitted}
              input={buildInput}
              eventSource={liveEventSource}
              revealLinks={revealLinks}
            />
          </div>
        )}
      </div>

      {upgradeInfo ? (
        <UpgradeModal
          open={true}
          onOpenChange={(open) => {
            if (!open) setUpgradeInfo(null);
          }}
          tier={upgradeInfo.tier}
          used={upgradeInfo.used}
          limit={upgradeInfo.limit}
        />
      ) : null}
    </>
  );
}
