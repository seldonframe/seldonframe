// packages/crm/src/app/(public)/try/try-client.tsx
//
// Client island for the public /try page — paste a URL, watch the live
// build animation, land on a reveal with a real hosted site + a working
// chatbot, then "Save your workspace" to claim it via signup.
//
// Wiring mirrors clients-new-form.tsx's startStream() (same EventSource +
// done/error listener idiom), pointed at the PUBLIC anonymous SSE route
// (api/v1/web/build/stream) instead of the authed create-from-url route.
// That route's `done` event carries the additional claim-grant fields
// (ws_id, slug, public_home_url, chatbot_embed_url, claim_token) this page
// needs for the reveal + save CTA — see route.ts's doc comment.
//
// Description/paste mode: the marketing hero supports a "biz" (no website,
// describe your business) tab, but the public build route this page calls
// is URL-only (`GET .../build/stream?url=...` — no `text`/`biz` param, see
// route.ts GET handler). Wiring a description mode here would require a
// second public anonymous route this task doesn't create, so the biz seed
// (if present) is shown read-only with a short explanatory note instead of
// being submittable. Recorded as a deviation in the task report.
//
// No dashboard chrome, no auth imports — this must render for a fully
// anonymous visitor. Palette matches marketing-hero.tsx's light/warm
// tokens (#F6F2EA paper, #221D17 ink, #1F2B24 green accent).
"use client";

import { useEffect, useRef, useState } from "react";
import { BuildAnimation } from "@/app/(dashboard)/clients/new/build-animation";
import type { DetectVerticalInput } from "@/lib/workspace/detect-vertical";

type DoneData = {
  ws_id: string;
  slug: string;
  public_home_url: string;
  chatbot_embed_url: string;
  claim_token: string;
};

type Phase = "idle" | "building" | "revealed" | "error";

type StoredSeed = { kind: "url" | "biz"; value: string; at: number };

const STORAGE_KEY = "sf-workspace-seed";
const STORAGE_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes — same window as clients-new-form.tsx

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
      if (Date.now() - parsed.at > STORAGE_MAX_AGE_MS) return null;
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
    // Quota/permission errors — non-fatal.
  }
}

export function TryClient({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [descriptionSeed, setDescriptionSeed] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [buildInput, setBuildInput] = useState<DetectVerticalInput | null>(null);
  const [eventSource, setEventSource] = useState<EventSource | null>(null);
  const [done, setDone] = useState<DoneData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  // 2026-07-14 — extraction-failed honesty fix. extraction_failed is a
  // PERMANENT condition for that URL (the site genuinely has no phone/name/
  // location we could find) — "Try again" would just fail identically and
  // burn the visitor's rate limit. See run-create-from-url.ts's step-5 catch
  // for the server-side `message` this reads.
  const [extractionFailed, setExtractionFailed] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => () => esRef.current?.close(), []);

  // Hydrate from the marketing hero's localStorage seed when no ?url= was
  // passed in. kind "url" prefills the input; kind "biz" is shown read-only
  // (see the top-of-file deviation note — description-mode build isn't
  // wired to a public route yet).
  useEffect(() => {
    if (initialUrl) return;
    const seed = readStoredSeed();
    if (!seed) return;
    if (seed.kind === "url") {
      setUrl(seed.value);
    } else {
      setDescriptionSeed(seed.value);
    }
    clearStoredSeed();
  }, [initialUrl]);

  function startBuild(targetUrl: string) {
    const trimmed = targetUrl.trim();
    if (!trimmed) return;

    esRef.current?.close();
    setError(null);
    setRateLimited(false);
    setDone(null);
    setBuildInput({ kind: "url", value: trimmed });
    setPhase("building");

    const es = new EventSource(`/api/v1/web/build/stream?url=${encodeURIComponent(trimmed)}`);
    esRef.current = es;
    setEventSource(es);

    es.addEventListener("done", (raw) => {
      const data = JSON.parse((raw as MessageEvent).data) as DoneData;
      es.close();
      setEventSource(null);
      setDone(data);
      setPhase("revealed");
    });

    es.addEventListener("error", (raw) => {
      const payload = (raw as MessageEvent).data;
      let data: { code?: string; reason?: string; message?: string } = {};
      try {
        if (typeof payload === "string" && payload.length > 0) {
          data = JSON.parse(payload);
        }
      } catch {
        // Fall through to generic error copy.
      }
      es.close();
      setEventSource(null);
      const isExtractionFailed = data.reason === "extraction_failed";
      setRateLimited(data.code === "rate_limited");
      setExtractionFailed(isExtractionFailed);
      setError(
        data.message ??
          (isExtractionFailed
            ? "We read that site but couldn't find the basics we need — a business name, location, and phone number. Try a different URL, or describe your business instead."
            : "Something broke on our end. Give it another try."),
      );
      setPhase("error");
    });
  }

  // Auto-submit when the hero passed ?url= directly (mirrors clients-new-form's
  // autoSubmit contract) — only fires once per mount.
  useEffect(() => {
    if (autoSubmittedRef.current) return;
    if (!initialUrl) return;
    autoSubmittedRef.current = true;
    startBuild(initialUrl);
    // startBuild is a stable closure defined above; only re-run if the
    // initial URL itself changes (it won't post-mount).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl]);

  function reset() {
    esRef.current?.close();
    setEventSource(null);
    setPhase("idle");
    setDone(null);
    setError(null);
    setRateLimited(false);
    setExtractionFailed(false);
    setBuildInput(null);
  }

  // 2026-07-04 — Full-viewport takeover for the "building" phase, mirroring
  // /clients/new's own full-bleed host (clients-new-form.tsx + page.tsx):
  // BuildAnimation (build-stage-v2.tsx's .sb-stage) is designed to receive a
  // real viewport-height box from its parent and do its OWN internal fitting
  // (flex:1 canvas, 2-col grid only ≥1100px of ITS container, mobile-specific
  // padding/min-heights) — it was never meant to be dropped into a bounded
  // card with a hardcoded min-height. The previous `min-h-[1000px]` approach
  // fought the component's own responsive contract: it "fit" by making the
  // PAGE taller instead of making the STAGE fit the screen, so the operator
  // had to scroll past the fold to see the build. Root fix: give the stage
  // section `h-[100svh]` (svh, not vh, for mobile URL-bar correctness) when
  // building, unmount/hide the hero + paste box instead of stacking above
  // it, and scroll to top on submit so the stage IS the screen — exactly
  // /clients/new's contract, reused instead of re-invented.
  const stageHostRef = useRef<HTMLElement | null>(null);
  const isBuilding = phase === "building";

  function submitAndTakeOver(targetUrl: string) {
    startBuild(targetUrl);
    // Smooth-scroll the takeover section to the top of the viewport so the
    // stage fills the screen instead of sitting mid-page under the hero.
    // rAF-deferred so the "building" section has mounted first.
    requestAnimationFrame(() => {
      stageHostRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  if (isBuilding) {
    // Full-viewport takeover — no hero, no paste box, no page scroll. The
    // stage manages its own internal layout/overflow (see build-stage-v2.tsx);
    // this host just hands it `100svh` (svh corrects for the mobile browser
    // URL bar so the box doesn't undershoot/overshoot like `100vh` would).
    //
    // 100svh on an iPhone SE is ~667px. Below build-stage-v2's own 1100px
    // breakpoint, `.sb-canvas` stacks `.sb-mock` (min-height 520px) directly
    // above `.sb-side` (the narration panel — no min-height, but its ticker
    // rows + biz header run ~350-450px of real content) — combined comfortably
    // over 900px, taller than a small phone's viewport. `.sb-stage` itself is
    // `overflow: hidden`, which on /clients/new's finite-height host means
    // that overflow is silently clipped. Page scroll is explicitly
    // disallowed here (this section IS the screen), so the fix is scoped
    // internal scroll: `.sf-try-stage` overrides `.sb-canvas` to
    // `overflow-y: auto` below 1100px, letting the operator scroll the
    // narration/mock content INSIDE the stage on tiny screens without the
    // page itself ever scrolling. Scoped to this class (not touching
    // build-stage-v2.tsx's own rules) so /clients/new's byte-identical
    // clipping behavior is unaffected.
    return (
      <main
        ref={stageHostRef}
        className="sf-try-stage h-[100svh] w-full overflow-hidden bg-[#F6F2EA] text-[#221D17]"
      >
        <BuildAnimation
          active={isBuilding}
          input={buildInput}
          eventSource={eventSource}
          totalS={165}
        />
        <style jsx global>{`
          @media (max-width: 1099px) {
            .sf-try-stage .sb-stage {
              overflow: hidden;
            }
            .sf-try-stage .sb-canvas {
              overflow-y: auto;
              -webkit-overflow-scrolling: touch;
            }
          }

          /* 2026-07-04 — Light SF branding for the /try stage, scoped to
             this class only. Root cause of the dark render: the dashboard's
             ThemeProvider sets defaultTheme="dark" app-wide (see
             components/shared/theme-provider.tsx), so the html element
             carries the .dark class on every route including this public
             one, and build-stage-v2.tsx's .sb-stage reads its --sb-*
             tokens straight off the host's --background/--foreground/
             --card/etc custom properties (by design — see that file's
             2026-05-22 header comment; it deliberately owns no theme
             state and is not touched here). Custom properties inherit
             down the DOM, so re-declaring the same host var NAMES at this
             narrower .sf-try-stage scope shadows the .dark values for
             every descendant .sb-* selector without touching the global
             .dark class itself — /clients/new keeps inheriting the real
             (dark) host values untouched. Values match the /try idle hero
             + reveal screen's existing light palette (marketing-hero.tsx
             tokens noted at the top of this file): #F6F2EA paper,
             #221D17 ink, #1F2B24 teal accent — not invented hexes. */
          .sf-try-stage {
            --background: #f6f2ea;
            --foreground: #221d17;
            --card: #fffdfa;
            --border: #e0d9cc;
            --muted: #efe9dd;
            --muted-foreground: #6e665a;
            --primary: #1F2B24;
          }
          /* The archetype brand-preview cards (e.g. the red "Bold urgency"
             hero card) stay brand-colored by design — only two archetypes
             (technical-restrained, brutalist) have a dark-mode .sb-stage
             contrast override baked into build-stage-v2.tsx for dark
             CHROME. Since the html element is still .dark here
             (unchanged), those rules would still match and wash their
             accent out against our light chrome. Re-assert the
             light-chrome accent values at one extra class of specificity
             so they win regardless of stylesheet order, without editing
             build-stage-v2.tsx's own rules. */
          :is(.dark) .sf-try-stage .sb-stage[data-archetype="technical-restrained"] {
            --sb-accent: #3f3f46;
          }
          :is(.dark) .sf-try-stage .sb-stage[data-archetype="brutalist"] {
            --sb-accent: #0a0a0a;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F6F2EA] px-5 py-10 text-[#221D17] md:px-8 md:py-16">
      <div className="mx-auto w-full max-w-[880px]">
        {phase === "revealed" && done ? (
          <RevealPanel done={done} onStartOver={reset} />
        ) : (
          <div className="flex flex-col items-center text-center">
            <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#6E665A]">
              <span className="inline-block h-px w-4 bg-[#9A9183]" aria-hidden />
              <span className="inline-block size-1.5 rounded-full bg-[#1F2B24]" aria-hidden />
              Watch it build — no signup required
            </p>
            <h1 className="mt-3 max-w-[20ch] text-balance font-sans text-[clamp(30px,4.4vw,48px)] font-[500] leading-[1.06] tracking-[-0.02em] text-[#221D17]">
              Paste a URL. Watch your business build itself.
            </h1>
            <p className="mx-auto mt-3 max-w-[58ch] text-pretty text-[15px] leading-[1.55] text-[#6E665A]">
              We build a real hosted website, CRM, and a working AI chatbot in a few minutes —
              free to try, nothing to sign up for yet.
            </p>

            {phase === "error" ? (
              <div
                role="alert"
                className="mt-6 w-full max-w-[560px] rounded-[14px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] p-4 text-left text-sm text-[#221D17]"
              >
                <p>{error}</p>
                {rateLimited ? (
                  <a
                    href="/signup"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-[11px] bg-[#1F2B24] px-4 py-2 text-[13.5px] font-[600] text-[#FFFDFA]"
                  >
                    Sign up to keep building
                  </a>
                ) : extractionFailed ? (
                  // extraction_failed is a permanent condition for this URL —
                  // no "Try again" (it would just fail identically). Offer
                  // the two honest paths instead: pick a different URL, or
                  // sign up to describe the business instead (the anonymous
                  // paste/describe path isn't public — see the file-header
                  // deviation note).
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={reset}
                      className="rounded-[11px] border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] px-4 py-2 text-[13.5px] font-[500] text-[#221D17]"
                    >
                      Try a different URL
                    </button>
                    <a
                      href="/signup"
                      className="inline-flex items-center gap-1.5 rounded-[11px] bg-[#1F2B24] px-4 py-2 text-[13.5px] font-[600] text-[#FFFDFA]"
                    >
                      Describe your business instead
                    </a>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startBuild(url)}
                    className="mt-3 rounded-[11px] border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] px-4 py-2 text-[13.5px] font-[500] text-[#221D17]"
                  >
                    Try again
                  </button>
                )}
              </div>
            ) : null}

            {phase === "idle" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAndTakeOver(url);
                }}
                className="sf-prompt relative mt-8 w-full max-w-[640px] overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08)]"
              >
                <div className="px-4 pt-4">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && url.trim()) {
                        e.preventDefault();
                        submitAndTakeOver(url);
                      }
                    }}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    placeholder="https://your-business.com"
                    aria-label="Your website URL"
                    className="h-14 w-full border-0 bg-transparent font-mono text-[15px] text-[#221D17] caret-[#1F2B24] outline-none placeholder:text-[#9A9183]"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 px-3.5 pb-3.5 pt-3">
                  <button
                    type="submit"
                    disabled={!url.trim()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1F2B24] px-4 text-[13.5px] font-[600] text-[#FFFDFA] shadow-[0_6px_20px_rgba(31, 43, 36,.28)] transition-all hover:-translate-y-px hover:bg-[#16201B] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                  >
                    Build it
                  </button>
                </div>
              </form>
            ) : null}

            {descriptionSeed && phase === "idle" ? (
              <div className="mt-4 w-full max-w-[640px] rounded-[14px] border border-[rgba(34,29,23,.12)] bg-[#FFFDFA]/70 p-3 text-left text-[13px] text-[#6E665A]">
                <p className="font-[600] text-[#221D17]">Your business description (from the homepage):</p>
                <p className="mt-1 line-clamp-3">{descriptionSeed}</p>
                <p className="mt-2 text-[12px]">
                  URL builds only for now — paste your website above, or{" "}
                  <a href="/signup" className="underline">
                    sign up
                  </a>{" "}
                  to build from a description.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

function RevealPanel({ done, onStartOver }: { done: DoneData; onStartOver: () => void }) {
  const saveHref =
    "/signup?callbackUrl=" +
    encodeURIComponent(`/claim-build?ws=${done.ws_id}&token=${done.claim_token}`);

  // `chatbot_embed_url` points at .../embed.js (see
  // packages/crm/src/app/api/v1/public/agent/[slug]/embed.js/route.ts) —
  // a Content-Type: application/javascript response, NOT an HTML page.
  // There is no standalone public HTML chat surface today (confirmed:
  // workspace/v2/complete's `chatbot.preview_url` is just the workspace
  // home page URL, which the same embed.js bubble is injected onto — see
  // packages/crm/src/lib/agents/store.ts's embedUrl construction and
  // complete/route.ts). Iframing embed.js renders raw script text, so
  // instead of an iframe we inject the script directly into this page's
  // DOM on reveal, exactly like an operator would on their own site.
  useEffect(() => {
    const script = document.createElement("script");
    script.src = done.chatbot_embed_url;
    script.async = true;
    script.setAttribute("data-sf-try-reveal-embed", "1");
    document.body.appendChild(script);

    return () => {
      // Mirror embed.js's own DOM footprint (route.ts's renderEmbedScript):
      // a <style>, an optional Google Fonts <link data-sf-agent-fonts="1">,
      // a `.sf-agent-bubble` button, and a `.sf-agent-panel` div — all
      // appended directly to document.body/head with no wrapper element.
      // Clean up all of it plus the load guard so "Start over" (which
      // remounts this component on the next reveal) can re-inject a fresh
      // widget instead of no-op'ing on window.__sf_agent_loaded__.
      script.remove();
      document.querySelectorAll(".sf-agent-bubble, .sf-agent-panel").forEach((el) => el.remove());
      document.querySelectorAll('link[data-sf-agent-fonts="1"]').forEach((el) => el.remove());
      document
        .querySelectorAll("style")
        .forEach((el) => {
          if (el.textContent?.includes(".sf-agent-bubble")) el.remove();
        });
      delete (window as unknown as { __sf_agent_loaded__?: boolean }).__sf_agent_loaded__;
    };
  }, [done.chatbot_embed_url]);

  return (
    <div className="flex flex-col items-center text-center">
      <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#6E665A]">
        <span className="inline-block size-1.5 rounded-full bg-[#1F2B24]" aria-hidden />
        It&apos;s live
      </p>
      {/* 2026-07-04 — Headline compressed one size down (was
          clamp(26px,3.6vw,40px)) to make room for the primary Save CTA in
          this header cluster, above the two panels below — at a
          1512x812-ish desktop viewport the panels alone pushed the CTA
          below the fold, so the operator saw the build finish with no
          visible next step without scrolling. */}
      <h1 className="mt-3 max-w-[24ch] text-balance font-sans text-[clamp(22px,2.8vw,32px)] font-[500] leading-[1.08] tracking-[-0.02em] text-[#221D17]">
        {done.slug}.app.seldonframe.com is live
      </h1>
      <p className="mx-auto mt-3 max-w-[58ch] text-pretty text-[15px] leading-[1.55] text-[#6E665A]">
        Your website and CRM are hosted and real. Try the chatbot below — it already knows your
        business.
      </p>

      <a
        href={saveHref}
        className="mt-5 inline-flex items-center gap-2.5 rounded-[11px] bg-[#1F2B24] px-6 py-3.5 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10)] transition-all hover:-translate-y-[1.5px]"
      >
        Save your workspace — it&apos;s free
      </a>

      <div className="mt-8 flex w-full flex-col gap-5 lg:flex-row">
        <div className="flex flex-1 flex-col gap-2 lg:w-[60%]">
          <span className="text-left text-[12px] font-[600] uppercase tracking-[0.06em] text-[#6E665A]">
            Your new site
          </span>
          <iframe
            src={done.public_home_url}
            title="Your new hosted website"
            className="h-[480px] w-full rounded-[14px] border border-[rgba(34,29,23,.14)] bg-white"
          />
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <span className="text-left text-[12px] font-[600] uppercase tracking-[0.06em] text-[#6E665A]">
            Talk to your new AI receptionist
          </span>
          <div className="flex h-[480px] w-full flex-col items-center justify-center gap-3 rounded-[14px] border border-[rgba(34,29,23,.14)] bg-white p-8 text-center">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-[#1F2B24] text-[#F6F2EA]" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9h8" /><path d="M8 13h6" /><path d="M9 18h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-3l-3 3l-3 -3z" /></svg>
            </span>
            <p className="max-w-[36ch] text-[15px] leading-[1.5] text-[#221D17]">
              Your AI receptionist is live — click the chat bubble in the corner and ask it
              anything about your business.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={saveHref}
          className="inline-flex items-center gap-2.5 rounded-[11px] bg-[#1F2B24] px-6 py-3.5 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10)] transition-all hover:-translate-y-[1.5px]"
        >
          Save your workspace — it&apos;s free
        </a>
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-2 rounded-[11px] border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] px-5 py-3.5 text-[15px] font-[500] text-[#221D17] transition-all hover:-translate-y-[1.5px]"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
