// packages/crm/src/app/(dashboard)/clients/new/clients-new-form.tsx
// Client-side form for the /clients/new page. Spec §"New frontend page".
//
// Design-system recommendation (Task 8.1, design:design-system):
//   - Heading/subtext: plain <h1>/<p> with Tailwind type tokens
//   - URL input: @/components/ui/input (already wraps base-ui Input with
//     focus-visible ring + aria-invalid styling) + @/components/ui/label
//   - Primary CTA + BYOK save: @/components/ui/button (default variant)
//   - Secondary link: plain next/link <Link> (a subordinate link is text,
//     not a button — Button ghost variant over-emphasises it)
//   - Progress narration column: plain <aside aria-live="polite"> with
//     <ol>/<li data-state> driving Tailwind variants. No Card primitive —
//     a bordered aside reads as a status surface, not a card with header chrome.
//   - Check icon: <Check> from lucide-react (already in deps via UpgradeModal)
//   - Error banner: plain <div role="alert"> with semantic destructive Tailwind.
//     The codebase has no @/components/ui/alert primitive; matches the inline
//     banner pattern at /settings/integrations/llm:73-87.
//   - UpgradeModal: REUSE from Phase 7 (@/components/billing/upgrade-modal).
//
// UX copy (Task 8.2, design:ux-copy): bundled in COPY const below.
// Verbs unified across CTA, narration, and errors ("build", "reading",
// "wiring up"). Error copy never blames the user. 500 banner explicitly
// reassures "Your URL is still here" — first-run anxiety relief.
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UpgradeModal } from "@/components/billing/upgrade-modal";

// Output of design:ux-copy (Task 8.2). Future Cuts can re-read this block
// to stay consistent — do not edit ad-hoc.
const COPY = {
  hero: "Spin up a client workspace",
  subtext:
    "Paste your client's website. We'll build their CRM, booking page, intake form, and AI chatbot in about 60 seconds.",
  inputLabel: "Client website URL",
  placeholder: "https://your-client-business.com",
  primary: "Build workspace",
  primaryPending: "Building...",
  secondary: "Skip and set one up by hand",
  progress: {
    fetching: "Reading the site",
    extracting: "Pulling business facts",
    soul_built: "Shaping the personality",
    landing_built: "Designing the landing page",
    chatbot_built: "Wiring up the chatbot",
    demo_seeded: "Seeding demo data",
  },
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
  },
};

const PROGRESS_KEYS = [
  "fetching",
  "extracting",
  "soul_built",
  "landing_built",
  "chatbot_built",
  "demo_seeded",
] as const;
type ProgressKey = (typeof PROGRESS_KEYS)[number];

type LimitInfo = {
  tier: "free" | "growth";
  used: number;
  limit: number;
  upgradeUrl: string;
};

const EMPTY_PROGRESS: Record<ProgressKey, boolean> = {
  fetching: false,
  extracting: false,
  soul_built: false,
  landing_built: false,
  chatbot_built: false,
  demo_seeded: false,
};

export function ClientsNewForm() {
  // Navigation: use window.location.assign on the "done" event instead of
  // useRouter() so the form renders cleanly in jsdom tests (App-router
  // Provider isn't mounted in unit tests). The dashboard URL is a same-origin
  // workspace-scoped path; client-side router push isn't required for a
  // post-onboarding navigation that loads a fresh server-rendered tree.
  const [url, setUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [done, setDone] = useState<Record<ProgressKey, boolean>>({ ...EMPTY_PROGRESS });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [needsByok, setNeedsByok] = useState(false);
  const [byokKey, setByokKey] = useState("");
  const [byokSaving, setByokSaving] = useState(false);
  const [upgradeInfo, setUpgradeInfo] = useState<LimitInfo | null>(null);
  const esRef = useRef<EventSource | null>(null);

  function startStream(targetUrl: string) {
    // Close any prior connection (BYOK retry path).
    esRef.current?.close();

    setSubmitted(true);
    setErrorBanner(null);
    setNeedsByok(false);
    setUpgradeInfo(null);
    setDone({ ...EMPTY_PROGRESS });

    const qs = new URLSearchParams({ url: targetUrl });
    const es = new EventSource(`/api/v1/web/workspaces/create-from-url?${qs.toString()}`);
    esRef.current = es;

    for (const key of PROGRESS_KEYS) {
      es.addEventListener(key, () => {
        setDone((prev) => ({ ...prev, [key]: true }));
      });
    }

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as { dashboardUrl: string };
      es.close();
      if (typeof window !== "undefined" && data.dashboardUrl) {
        window.location.assign(data.dashboardUrl);
      }
    });

    es.addEventListener("error", (raw) => {
      // EventSource fires an `error` event with no data on transport errors
      // too; guard the JSON.parse.
      const payload = (raw as MessageEvent).data;
      let data: { code?: number; reason?: string } & Partial<LimitInfo> = {};
      try {
        if (typeof payload === "string" && payload.length > 0) {
          data = JSON.parse(payload);
        }
      } catch {
        // Fall through to generic error banner below.
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

  // BYOK save endpoint — see Phase 8 task notes. Server-side wiring at
  // /api/integrations/anthropic must encrypt + merge into
  // organizations.integrations.anthropic.apiKey, matching the same path
  // saveLlmKeyAction takes at packages/crm/src/lib/integrations/llm/actions.ts.
  // If this endpoint isn't wired yet, save will fail and surface the
  // internal-error banner; user can copy the URL or paste their key on
  // /settings/integrations/llm and retry from /clients/new.
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
        // startStream resets needsByok + re-opens the EventSource with the
        // same URL the user already entered.
        startStream(url);
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

  return (
    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">{COPY.hero}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{COPY.subtext}</p>

        {!needsByok ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startStream(url);
            }}
          >
            <Label htmlFor="client-url" className="sr-only">
              {COPY.inputLabel}
            </Label>
            <Input
              id="client-url"
              autoFocus
              type="url"
              placeholder={COPY.placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="h-12 text-base"
              aria-label={COPY.inputLabel}
            />
            <Button type="submit" disabled={submitted} className="h-12 w-full">
              {submitted ? COPY.primaryPending : COPY.primary}
            </Button>
            <p className="text-center text-xs">
              <Link
                href="/dashboard"
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                {COPY.secondary}
              </Link>
            </p>
          </form>
        ) : (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium">{COPY.errors.byokHeading}</h2>
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
          </div>
        )}

        {errorBanner ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <p>{errorBanner}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setErrorBanner(null);
                startStream(url);
              }}
              className="mt-2"
            >
              {COPY.errors.internal_retry}
            </Button>
          </div>
        ) : null}
      </section>

      <aside
        aria-live="polite"
        aria-label="Workspace build progress"
        className="rounded-lg border bg-card p-4"
      >
        <ol className="space-y-3 text-sm">
          {PROGRESS_KEYS.map((key) => {
            const isDone = done[key];
            return (
              <li
                key={key}
                data-testid={`progress-${key}`}
                data-state={isDone ? "done" : "pending"}
                className={
                  isDone
                    ? "flex items-start gap-2 text-foreground transition-colors"
                    : "flex items-start gap-2 text-muted-foreground transition-colors"
                }
              >
                {isDone ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className="mt-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/40"
                    aria-hidden="true"
                  />
                )}
                <span>{COPY.progress[key]}</span>
                <span className="sr-only">
                  {isDone ? " — done" : " — pending"}
                </span>
              </li>
            );
          })}
        </ol>
      </aside>

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
    </div>
  );
}
