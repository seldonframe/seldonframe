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
// tokens (#F6F2EA paper, #221D17 ink, #00897B green accent).
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
      let data: { code?: string; message?: string } = {};
      try {
        if (typeof payload === "string" && payload.length > 0) {
          data = JSON.parse(payload);
        }
      } catch {
        // Fall through to generic error copy.
      }
      es.close();
      setEventSource(null);
      setRateLimited(data.code === "rate_limited");
      setError(data.message ?? "Something broke on our end. Give it another try.");
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
    setBuildInput(null);
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
              <span className="inline-block size-1.5 rounded-full bg-[#00897B]" aria-hidden />
              Watch it build — no signup required
            </p>
            <h1 className="mt-3 max-w-[20ch] text-balance font-sans text-[clamp(30px,4.4vw,48px)] font-[500] leading-[1.06] tracking-[-0.02em] text-[#221D17]">
              Paste a URL. Watch your business build itself.
            </h1>
            <p className="mx-auto mt-3 max-w-[58ch] text-pretty text-[15px] leading-[1.55] text-[#6E665A]">
              We build a real hosted website, CRM, and a working AI chatbot in about a minute —
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
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#00897B] px-4 py-2 text-[13.5px] font-[600] text-[#FFFDFA]"
                  >
                    Sign up to keep building
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => startBuild(url)}
                    className="mt-3 rounded-full border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] px-4 py-2 text-[13.5px] font-[500] text-[#221D17]"
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
                  startBuild(url);
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
                        startBuild(url);
                      }
                    }}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    placeholder="https://your-business.com"
                    aria-label="Your website URL"
                    className="h-14 w-full border-0 bg-transparent font-mono text-[15px] text-[#221D17] caret-[#00897B] outline-none placeholder:text-[#9A9183]"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 px-3.5 pb-3.5 pt-3">
                  <button
                    type="submit"
                    disabled={!url.trim()}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#00897B] px-4 text-[13.5px] font-[600] text-[#FFFDFA] shadow-[0_6px_20px_rgba(0,137,123,.28)] transition-all hover:-translate-y-px hover:bg-[#00796B] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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

            {phase === "building" ? (
              <div className="relative mt-8 h-[560px] w-full max-w-[720px] overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#111814]">
                <BuildAnimation active={phase === "building"} input={buildInput} eventSource={eventSource} />
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

  return (
    <div className="flex flex-col items-center text-center">
      <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#6E665A]">
        <span className="inline-block size-1.5 rounded-full bg-[#00897B]" aria-hidden />
        It&apos;s live
      </p>
      <h1 className="mt-3 max-w-[24ch] text-balance font-sans text-[clamp(26px,3.6vw,40px)] font-[500] leading-[1.08] tracking-[-0.02em] text-[#221D17]">
        {done.slug}.app.seldonframe.com is live
      </h1>
      <p className="mx-auto mt-3 max-w-[58ch] text-pretty text-[15px] leading-[1.55] text-[#6E665A]">
        Your website and CRM are hosted and real. Try the chatbot below — it already knows your
        business.
      </p>

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
            Talk to your new AI receptionist — ask it anything about your business
          </span>
          <iframe
            src={done.chatbot_embed_url}
            title="Talk to your new AI receptionist — ask it anything about your business"
            className="h-[480px] w-full rounded-[14px] border border-[rgba(34,29,23,.14)] bg-white"
          />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href={saveHref}
          className="inline-flex items-center gap-2.5 rounded-full bg-[#1F2B24] px-6 py-3.5 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10)] transition-all hover:-translate-y-[1.5px]"
        >
          <span className="size-[7px] rounded-full bg-[#00897B]" aria-hidden />
          Save your workspace — it&apos;s free
        </a>
        <button
          type="button"
          onClick={onStartOver}
          className="inline-flex items-center gap-2 rounded-full border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] px-5 py-3.5 text-[15px] font-[500] text-[#221D17] transition-all hover:-translate-y-[1.5px]"
        >
          Start over
        </button>
      </div>
    </div>
  );
}
