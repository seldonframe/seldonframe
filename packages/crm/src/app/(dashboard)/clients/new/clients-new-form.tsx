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

import { useEffect, useId, useRef, useState } from "react";
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
  // design-critique: pulled "in 60 seconds" out of the body subtext and into
  // the hero as a two-tone accent so the speed promise IS the headline.
  heroAccent: "in 60 seconds",
  subtext:
    "Paste your client's website. We'll build their CRM, booking page, intake form, and AI chatbot in one pass.",
  inputLabel: "Client website URL",
  placeholder: "https://your-client-business.com",
  primary: "Build workspace",
  primaryPending: "Building...",
  secondary: "Skip and set one up by hand",
  // design-critique: gave the right column a deliberate heading + subhead so
  // the at-rest state reads as a status surface, not as broken placeholder rows.
  asideHeading: "Live build",
  asideSubhead: "We'll narrate every step.",
  progress: {
    fetching: "Reading the site",
    extracting: "Pulling business facts",
    soul_built: "Shaping the personality",
    // 2026-05-17 — "Designing the landing page" removed. Ops-stack-only flow
    // now skips the landing page by default; operators add one later via the
    // landing-page-creation skill. Showing the step would imply a landing was
    // built and then the user would not find it in the dashboard.
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
    // design-critique: bail-out affordance so the BYOK swap-in doesn't feel
    // like a one-way trap.
    byokCancel: "Use a different approach",
  },
};

// 2026-05-17 — dropped "landing_built" because the ops-stack-only flow now
// skips landing page generation by default (see run-create-from-url.ts
// comments + landing-page-creation skill). Backend emits these five in
// order: fetching, extracting, soul_built, chatbot_built, demo_seeded.
const PROGRESS_KEYS = [
  "fetching",
  "extracting",
  "soul_built",
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
  chatbot_built: false,
  demo_seeded: false,
};

type ClientsNewFormProps = {
  // "proposal" → compact mode: suppresses agency onboarding chrome (hero,
  // subtext, skip link) so the flow reads as workspace activation, not
  // generic onboarding. All other values (including "default") render the
  // full form.
  source?: string;
};

export function ClientsNewForm({ source = "default" }: ClientsNewFormProps) {
  const isProposalSource = source === "proposal";
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
  // a11y: only autoFocus the URL input on the initial mount. After a BYOK
  // retry the form re-renders with the URL value still populated, and
  // re-focusing the URL input would yank focus away from wherever the user
  // last acted (Save and continue). Tracked via a ref so it persists across
  // renders without triggering them.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    hasMountedRef.current = true;
  }, []);
  // a11y: stable ids so error banner can be linked via aria-describedby and
  // the BYOK region can be linked via aria-labelledby.
  const errorBannerId = useId();
  const byokHeadingId = useId();

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
        {/* design-critique: two-tone hero pulls "in 60 seconds" into the
            headline so the speed promise is the first thing the eye lands on,
            not buried in body copy.
            Phase 8: suppress hero chrome when source==="proposal" — the
            prospect has already accepted; this screen is workspace activation,
            not onboarding. */}
        {!isProposalSource && (
          <>
            <h1 className="text-4xl font-semibold tracking-tight">
              {COPY.hero}{" "}
              <span className="text-muted-foreground">{COPY.heroAccent}</span>
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{COPY.subtext}</p>
          </>
        )}
        {isProposalSource && (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Activating your workspace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Paste the client&apos;s website URL to build the workspace now.
            </p>
          </>
        )}

        {!needsByok ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              startStream(url);
            }}
          >
            {/* a11y: <Label htmlFor> provides the accessible name. No
                aria-label override (would silence the visible Label
                semantics and create a duplicate name source). */}
            <Label htmlFor="client-url" className="sr-only">
              {COPY.inputLabel}
            </Label>
            <Input
              id="client-url"
              // a11y: autoFocus only on initial mount. See hasMountedRef.
              autoFocus={!hasMountedRef.current}
              type="url"
              placeholder={COPY.placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              className="h-12 text-base"
            />
            <Button type="submit" disabled={submitted} className="h-12 w-full">
              {submitted ? COPY.primaryPending : COPY.primary}
            </Button>
            {/* design-critique: moved the skip link to a smaller right-aligned
                affordance so it stays available without competing with the
                primary path. inline-block + py-2 gives a 36px+ touch zone.
                a11y: solid text-muted-foreground (no /80) so contrast stays
                >=4.5:1 in both light and dark themes.
                Phase 8: suppress in proposal mode — skipping workspace
                activation would orphan the accepted proposal. */}
            {!isProposalSource && (
              <p className="text-right">
                <Link
                  href="/dashboard"
                  className="inline-block py-2 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  {COPY.secondary}
                </Link>
              </p>
            )}
          </form>
        ) : (
          // design-critique: animate-in fade so the BYOK swap doesn't feel
          // like the form glitched.
          // a11y: wrap as a region with the heading as its accessible name
          // so SR users navigating by landmark/region hear "Add your
          // Anthropic key first" announced as the region context, not a
          // bare mid-page heading.
          <section
            role="region"
            aria-labelledby={byokHeadingId}
            className="mt-6 space-y-3 animate-in fade-in-0 duration-200"
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
            {/* design-critique: bail-out so the BYOK prompt isn't a trap. */}
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
        )}

        {errorBanner ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {/* a11y: link the retry button to the banner copy via
                aria-describedby so SR users hear the error reason as
                supplementary text after the button label. */}
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
        ) : null}
      </section>

      {/* design-critique: dropped bg-card (page bg already card-tinted in
          light theme → invisible edge), added pt-8 to push the column below
          the hero so the eye reads left first. */}
      <aside
        aria-live="polite"
        aria-label="Workspace build progress"
        className="rounded-lg border p-4 md:mt-8"
      >
        {/* design-critique: heading + subhead so the at-rest state reads as
            a deliberate status surface, not six greyed-out empty rows. */}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {COPY.asideHeading}
        </p>
        {/* a11y: solid text-muted-foreground (no /80) so the subhead stays
            >=4.5:1 in light theme at this small size. */}
        <p className="mt-1 text-xs text-muted-foreground">{COPY.asideSubhead}</p>
        {/* The CURRENTLY-IN-FLIGHT step (first pending key while the SSE
            stream is open + no error has fired). This makes the LIVE BUILD
            checklist feel alive — without it, the user sees a static list
            of checkmarks and faded rows during the 10-30 seconds of
            workspace generation and thinks the page is dead. */}
        <ol className="mt-4 space-y-3 text-sm">
          {PROGRESS_KEYS.map((key) => {
            const isDone = done[key];
            const isActive =
              submitted &&
              !errorBanner &&
              !needsByok &&
              !upgradeInfo &&
              !isDone &&
              // The "first pending" key — earlier keys are all done, this
              // is the one Anthropic is currently working on.
              PROGRESS_KEYS.find((k) => !done[k]) === key;
            return (
              <li
                key={key}
                data-testid={`progress-${key}`}
                data-state={isDone ? "done" : isActive ? "active" : "pending"}
                className={
                  isDone
                    ? "flex items-center gap-2 text-foreground transition-colors"
                    : isActive
                      ? // Active step: foreground color + medium weight + a
                        // subtle pulse on the ENTIRE row (not just the dot).
                        // User feedback: dot alone is too subtle to read as
                        // "this is alive" — text needs to breathe too.
                        // Tailwind animate-pulse cycles opacity 1.0→0.5→1.0
                        // at 2s. motion-reduce: drop the pulse (animate-none).
                        "flex items-center gap-2 text-foreground font-medium transition-colors animate-pulse motion-reduce:animate-none"
                      : "flex items-center gap-2 text-muted-foreground transition-colors"
                }
              >
                {/* design-critique: fixed 20x20 slot prevents reflow when
                    pending dot is swapped for the Check icon.
                    a11y: state is exposed on the slot via aria-label so SR
                    users get "Step done" / "Step active" / "Step pending"
                    as a clean rotor entry. */}
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center"
                  role="img"
                  aria-label={
                    isDone
                      ? "Step done"
                      : isActive
                        ? "Step in progress"
                        : "Step pending"
                  }
                >
                  {isDone ? (
                    <Check className="size-4 text-primary" aria-hidden="true" />
                  ) : isActive ? (
                    // Pulsing primary dot — the layered ping ring is the
                    // visible "this is alive" signal. motion-reduce: drop
                    // the ring + just show the solid dot at full opacity.
                    <span className="relative flex size-2.5">
                      <span
                        className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:hidden"
                        aria-hidden="true"
                      />
                      <span
                        className="relative inline-flex size-2.5 rounded-full bg-primary"
                        aria-hidden="true"
                      />
                    </span>
                  ) : (
                    // design-critique + a11y: bumped opacity from /40 to /60
                    // to satisfy WCAG 2.1 non-text contrast.
                    <span
                      className="size-1.5 rounded-full bg-muted-foreground/60"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span>{COPY.progress[key]}</span>
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
