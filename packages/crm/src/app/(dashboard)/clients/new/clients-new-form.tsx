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
import { BuildAnimation } from "./build-animation";
import { IdleScene } from "./build-animation/idle-scene";

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
};

export function ClientsNewForm({ source = "default" }: ClientsNewFormProps) {
  // source is currently unused post-P but kept for future skip-link suppression
  void source;

  const [url, setUrl] = useState("");
  const [bizInfo, setBizInfo] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [keepBuildMounted, setKeepBuildMounted] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [byokKey, setByokKey] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [upgradeInfo, setUpgradeInfo] = useState<LimitInfo | null>(null);
  const esRef = useRef<EventSource | null>(null);
  // Tracks which mode was last submitted so BYOK retry re-submits the right stream.
  const lastModeRef = useRef<"url" | "biz">("url");

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
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);

    const qs = new URLSearchParams({ url: targetUrl });
    const es = new EventSource(`/api/v1/web/workspaces/create-from-url?${qs.toString()}`);
    esRef.current = es;

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as { dashboardUrl: string };
      es.close();
      if (typeof window !== "undefined" && data.dashboardUrl) {
        window.location.assign(data.dashboardUrl);
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
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);

    const qs = new URLSearchParams({ text });
    const es = new EventSource(`/api/v1/web/workspaces/create-from-paste?${qs.toString()}`);
    esRef.current = es;

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as { dashboardUrl: string };
      es.close();
      if (typeof window !== "undefined" && data.dashboardUrl) {
        window.location.assign(data.dashboardUrl);
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
          />
        </div>

        {/* BuildAnimation — visible after submit, mounted on first activation */}
        {(submitted || keepBuildMounted) && (
          <div
            className={`absolute inset-0 transition-opacity duration-[600ms] ease-out ${
              submitted
                ? "opacity-100"
                : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!submitted}
          >
            <BuildAnimation active={submitted} />
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
