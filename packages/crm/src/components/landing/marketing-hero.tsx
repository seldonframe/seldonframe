// packages/crm/src/components/landing/marketing-hero.tsx
//
// 2026-05-22 — Port of the Claude Design HTML mockup hero
// (handoff `seldonframe-home.html` §Hero). The dominant input lives
// here: tabs (URL vs business info), typewriter placeholders,
// example chips, localStorage seed + /signup forward.
//
// 2026-05-23 — Switched the seed carrier from sessionStorage to
// localStorage. The magic-link click in the signup flow opens a NEW
// TAB, and sessionStorage is per-tab — so the seed was vanishing on
// landing. localStorage is per-origin and survives the cross-tab hop.
// We also stopped forwarding `biz` as a URL query param: long paste
// payloads (3KB Google Maps + reviews was the prod incident) blow past
// Stripe's 2048-char return_url cap. Short URLs still pass through as
// `?url=…` since they're harmless and that's the dominant test traffic.
//
// Behaviour contracts (from handoff README §1–§3):
//   - On submit, persist localStorage['sf-workspace-seed'] as
//     { kind: 'url' | 'biz', value, at }
//   - For URL mode, also forward to /signup?url=…&intent=build so the
//     short-URL passthrough still works without localStorage (graceful
//     degradation in private-mode browsers that disable localStorage).
//   - For BIZ mode, forward to /signup?intent=build (no biz in URL).
//     /clients/new hydrates the biz textarea from localStorage on mount.
//   - Typewriter cycles through real examples while idle; pauses on
//     focus or when user has typed; prefers-reduced-motion gets
//     only the first example
//   - Plain Enter inside URL field also submits; ⌘/Ctrl+Enter from
//     anywhere on the page submits
//
// Aurora / grid / grain / dot animations live in a single styled-jsx
// global block at the bottom — translating them to Tailwind would
// require a huge `tailwind.config` extension for one component and
// the marketing surface doesn't need that surface area.

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Globe, Heart, Stethoscope, Wrench, Zap } from "lucide-react";

const URL_EXAMPLES = [
  "https://your-clients-hvac-company.com",
  "https://your-clients-roofing-business.com",
  "https://your-clients-dental-practice.com",
  "https://your-clients-medspa.com",
  "https://your-clients-lawn-care.com",
  "https://your-clients-law-firm.com",
];
const BIZ_EXAMPLES = [
  "Family-owned HVAC in Stockton, CA. 24/7 emergency service. Licensed C-20, bonded, insured. 4.8 stars on Google with 412 reviews.",
  "Heritage roofer in the Hudson Valley. Slate, copper, cedar. Family-owned since 1962. Master craftsman certified.",
  "Dental practice in Auburn, CA. Two board-certified DDS + a periodontist. In-network with 28 PPO carriers.",
  "Medspa on Montana Avenue. Discreet, physician-led, by appointment only. AAD Fellow on staff.",
  "Weekly residential lawn care in Raleigh. Same crew every visit, no contracts. 4.8 stars on Google.",
];

type TabKind = "url" | "biz";

type Example = {
  kind: TabKind;
  value: string;
  icon: typeof Globe;
  label: string;
};

const EXAMPLE_CHIPS: readonly Example[] = [
  { kind: "url", value: "https://stocktonheating.com", icon: Zap, label: "an HVAC company" },
  { kind: "url", value: "https://example-roofing.com", icon: Wrench, label: "a heritage roofer" },
  { kind: "url", value: "https://example-dental.com", icon: Stethoscope, label: "a dental practice" },
  {
    kind: "biz",
    value:
      "Family-owned residential lawn care in Raleigh, NC. Weekly mowing, no contracts, same crew every visit. Friendly voice. 4.8 stars on Google.",
    icon: Heart,
    label: "a lawn-care business (no website)",
  },
];

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Typewriter cycle. Pauses while the input is focused OR has user-entered
 *  text. With prefers-reduced-motion, only sets the first example as the
 *  placeholder and returns immediately. */
function useTypewriterPlaceholder(
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  examples: readonly string[],
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = prefersReducedMotion();
    if (reduce || !enabled) {
      el.setAttribute("placeholder", examples[0] ?? "");
      return;
    }

    let stopped = false;
    let i = 0;
    let phase: "typing" | "holding" | "deleting" = "typing";
    let pos = 0;
    let target = examples[0] ?? "";
    let timer: ReturnType<typeof setTimeout> | null = null;

    const step = () => {
      if (stopped || !ref.current) return;
      const node = ref.current;
      // Pause if user is engaged
      if (document.activeElement === node || (node.value && node.value.length > 0)) {
        node.setAttribute("placeholder", target);
        timer = setTimeout(step, 800);
        return;
      }
      if (phase === "typing") {
        pos++;
        node.setAttribute("placeholder", target.slice(0, pos));
        if (pos >= target.length) {
          phase = "holding";
          timer = setTimeout(step, 1800);
          return;
        }
        timer = setTimeout(step, 24 + Math.random() * 30);
      } else if (phase === "holding") {
        phase = "deleting";
        timer = setTimeout(step, 80);
      } else {
        pos = Math.max(0, pos - 2);
        node.setAttribute("placeholder", target.slice(0, pos) || " ");
        if (pos === 0) {
          i = (i + 1) % examples.length;
          target = examples[i] ?? "";
          phase = "typing";
          timer = setTimeout(step, 280);
          return;
        }
        timer = setTimeout(step, 16);
      }
    };

    el.setAttribute("placeholder", target);
    timer = setTimeout(step, 1200);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, examples, ref]);
}

export function MarketingHero() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKind>("url");
  const [urlValue, setUrlValue] = useState("");
  const [bizValue, setBizValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const urlRef = useRef<HTMLInputElement | null>(null);
  const bizRef = useRef<HTMLTextAreaElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useTypewriterPlaceholder(urlRef, URL_EXAMPLES, tab === "url" || urlValue === "");
  useTypewriterPlaceholder(bizRef, BIZ_EXAMPLES, tab === "biz" || bizValue === "");

  const activeValue = tab === "url" ? urlValue : bizValue;
  const canSubmit = activeValue.trim().length >= 3;

  const handleTab = useCallback((next: TabKind) => {
    setTab(next);
    setTimeout(() => {
      if (next === "url") urlRef.current?.focus();
      else bizRef.current?.focus();
    }, 0);
  }, []);

  const handleExample = useCallback(
    (ex: Example) => {
      setTab(ex.kind);
      if (ex.kind === "url") setUrlValue(ex.value);
      else setBizValue(ex.value);
      setTimeout(() => {
        if (ex.kind === "url") urlRef.current?.focus();
        else bizRef.current?.focus();
      }, 0);
    },
    [],
  );

  const submit = useCallback(() => {
    const value = (tab === "url" ? urlValue : bizValue).trim();
    if (value.length < 3) return;
    try {
      // localStorage (not sessionStorage) — the magic-link click in
      // the signup flow opens a NEW TAB, and sessionStorage is
      // per-tab. localStorage is per-origin so the seed survives the
      // /signup → email → magic-link → new-tab landing.
      localStorage.setItem(
        "sf-workspace-seed",
        JSON.stringify({ kind: tab, value, at: Date.now() }),
      );
    } catch {
      // localStorage can fail in some incognito modes or if the
      // user has site-storage blocked — non-fatal for URL mode
      // (the ?url= query param is still passed). For BIZ mode the
      // visitor will land on /clients/new with an empty textarea
      // and need to re-paste; acceptable degradation.
    }
    setSubmitting(true);
    // Always pass intent=build so /clients/new auto-submits on mount.
    // For URL mode, also pass ?url=… so short URLs work even if
    // localStorage was blocked. For BIZ mode, only pass ?intent=build —
    // the biz payload lives in localStorage to keep the URL chain
    // short (Stripe's return_url cap is 2048 chars and a 3KB paste
    // blows past it through the double-URL-encoded redirect hops).
    const params = new URLSearchParams({ intent: "build" });
    if (tab === "url") {
      params.set("url", value);
    }
    // small delay so the overlay registers visually
    setTimeout(() => {
      router.push(`/signup?${params.toString()}`);
    }, 380);
  }, [tab, urlValue, bizValue, router]);

  // ⌘/Ctrl+Enter from anywhere on the page launches when valid
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (canSubmit) submit();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canSubmit, submit]);

  // initial focus
  useEffect(() => {
    const t = setTimeout(() => urlRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  const aurora = useMemo(() => prefersReducedMotion(), []);

  return (
    <section
      id="top"
      aria-label="SeldonFrame hero"
      className="sf-hero relative isolate flex min-h-[100svh] flex-col items-center justify-start overflow-hidden px-5 pb-20 pt-[60px] text-center md:px-8 md:pb-24 md:pt-[70px] lg:px-12 lg:pb-32 lg:pt-20"
    >
      {/* Aurora background */}
      <div className="sf-aurora" aria-hidden>
        <div className={`sf-aurora-orb sf-aurora-orb-a ${aurora ? "" : "is-anim"}`} />
        <div className={`sf-aurora-orb sf-aurora-orb-b ${aurora ? "" : "is-anim"}`} />
        <div className={`sf-aurora-orb sf-aurora-orb-c ${aurora ? "" : "is-anim"}`} />
      </div>
      <div className="sf-grid" aria-hidden />
      <div className="sf-grain" aria-hidden />

      <div className="relative flex w-full max-w-[920px] flex-col items-center gap-7">
        {/* Kicker */}
        <p className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/70 px-3 py-1.5 font-mono text-[11.5px] font-medium tracking-wide text-zinc-300">
          <span className="sf-blink-dot inline-block size-1.5 rounded-sm bg-[#2dd4bf]" aria-hidden />
          <span>For agencies reselling local SMB tooling</span>
        </p>

        {/* Headline */}
        <h1 className="m-0 text-balance font-display text-[clamp(40px,7vw,84px)] font-semibold leading-[1.0] tracking-[-0.034em] text-zinc-50">
          Spin up a client workspace
          <span className="mt-1.5 block font-medium text-zinc-300">
            in <span className="font-semibold text-[#5eead4]">60 seconds.</span>
          </span>
        </h1>

        {/* Subhead */}
        <p className="m-0 max-w-[640px] text-pretty text-[clamp(15px,1.5vw,18px)] leading-[1.55] text-zinc-400">
          Paste your client&apos;s website — or describe them — and we ship the CRM,
          booking page, intake form, and AI chatbot in one pass. You keep the
          recurring revenue.
        </p>

        {/* Dominant input */}
        <form
          ref={formRef}
          aria-label="Start a workspace"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="sf-prompt relative mt-2 w-full max-w-[760px] overflow-hidden rounded-[18px] border border-zinc-800 bg-gradient-to-b from-zinc-900/95 to-[#0f0f12]/95 shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_1px_rgba(45,212,191,0.06),0_0_60px_rgba(20,184,166,0.10),inset_0_1px_0_rgba(255,255,255,0.06)] transition-[border-color,box-shadow] duration-200 focus-within:border-[#2dd4bf]/60 focus-within:shadow-[0_24px_80px_rgba(0,0,0,0.55),0_0_0_3px_rgba(45,212,191,0.20),0_0_80px_rgba(20,184,166,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          {/* Tabs */}
          <div
            role="tablist"
            aria-label="Input mode"
            className="mx-2 mt-2 grid grid-cols-2 gap-1 rounded-[10px] border border-zinc-800 bg-[#09090b]/60 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "url"}
              onClick={() => handleTab("url")}
              className={`inline-flex h-[34px] items-center justify-center gap-2 rounded-[7px] px-3 text-[13px] transition-colors ${
                tab === "url"
                  ? "bg-zinc-800/80 font-semibold text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)]"
                  : "font-medium text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Globe size={14} aria-hidden />
              Paste website URL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "biz"}
              onClick={() => handleTab("biz")}
              className={`inline-flex h-[34px] items-center justify-center gap-2 rounded-[7px] px-3 text-[13px] transition-colors ${
                tab === "biz"
                  ? "bg-zinc-800/80 font-semibold text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.3)]"
                  : "font-medium text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileText size={14} aria-hidden />
              No website? Paste business info
            </button>
          </div>

          {/* URL pane */}
          <div className={`px-4 pt-3.5 ${tab === "url" ? "block" : "hidden"}`}>
            <input
              ref={urlRef}
              type="text"
              name="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) {
                  e.preventDefault();
                  submit();
                }
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://your-clients-hvac-company.com"
              aria-label="Paste your client's website URL"
              className="h-14 w-full border-0 bg-transparent font-mono text-base text-zinc-50 caret-[#2dd4bf] outline-none placeholder:text-zinc-500"
            />
          </div>

          {/* Biz pane */}
          <div className={`px-4 pt-3.5 ${tab === "biz" ? "block" : "hidden"}`}>
            <textarea
              ref={bizRef}
              name="biz"
              value={bizValue}
              onChange={(e) => setBizValue(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="Family-owned HVAC in Stockton, CA. 24/7 emergency service. Licensed C-20, bonded, insured. 4.8 stars on Google with 412 reviews."
              aria-label="Describe your client's business"
              className="block max-h-60 min-h-[120px] w-full resize-none border-0 bg-transparent font-display text-[15px] leading-[1.55] tracking-[-0.005em] text-zinc-50 caret-[#2dd4bf] outline-none placeholder:text-zinc-500"
            />
          </div>

          {/* Bottom action row */}
          <div className="flex items-center justify-between gap-3 px-3.5 pb-3.5 pt-3 text-zinc-500">
            <span className="inline-flex items-center gap-2.5 font-mono text-[11.5px] tracking-wide">
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] leading-none text-zinc-300">
                ⌘
              </span>
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] leading-none text-zinc-300">
                ↵
              </span>
              <small className="text-[11.5px] text-zinc-500">to launch</small>
            </span>
            <button
              type="submit"
              disabled={!canSubmit || submitting}
              aria-label="Build workspace"
              className="group inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#14b8a6] bg-[#14b8a6] px-3.5 text-sm font-semibold tracking-tight text-[#08332f] shadow-[0_8px_26px_rgba(20,184,166,0.34)] transition-all hover:border-[#2dd4bf] hover:bg-[#2dd4bf] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14b8a6]"
            >
              <span>Build workspace</span>
              <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </button>
          </div>
        </form>

        {/* Example chips */}
        <div className="mt-2 flex max-w-[760px] flex-wrap items-center justify-center gap-2">
          <span className="mr-1 self-center font-mono text-[11px] uppercase tracking-[0.10em] text-zinc-500">
            Try
          </span>
          {EXAMPLE_CHIPS.map((ex, i) => {
            const Icon = ex.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => handleExample(ex)}
                className="group inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/65 px-3 py-1.5 text-[12.5px] font-medium text-zinc-300 transition-all hover:-translate-y-px hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <Icon size={12} className="text-[#2dd4bf]" aria-hidden />
                {ex.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading overlay shown while we forward to /signup */}
      {submitting ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[#09090b]/85 backdrop-blur-md"
          aria-live="polite"
        >
          <div className="size-7 animate-spin rounded-full border-2 border-[#2dd4bf]/20 border-t-[#2dd4bf]" aria-hidden />
          <div className="font-mono text-xs uppercase tracking-[0.12em] text-zinc-400">
            Spinning up your workspace…
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .sf-blink-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #2dd4bf 22%, transparent);
          animation: sf-blink 2s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-blink-dot {
            animation: none;
          }
        }
        @keyframes sf-blink {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }
      `}</style>

      <style jsx>{`
        .sf-aurora {
          position: absolute;
          inset: 0;
          z-index: -2;
          pointer-events: none;
          overflow: hidden;
          background: #09090b;
        }
        .sf-aurora::before {
          content: "";
          position: absolute;
          left: 50%;
          bottom: -10%;
          transform: translateX(-50%);
          width: 130vw;
          height: 100vh;
          border-radius: 50%;
          background: radial-gradient(
            closest-side,
            rgba(45, 212, 191, 0.22) 0%,
            rgba(20, 184, 166, 0.1) 40%,
            transparent 75%
          );
          filter: blur(50px);
          animation: aurora-pulse 14s ease-in-out infinite;
          will-change: transform;
        }
        .sf-aurora::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            radial-gradient(
              ellipse 75% 50% at 50% 50%,
              transparent 30%,
              rgba(9, 9, 11, 0.55) 70%,
              rgba(9, 9, 11, 0.85) 100%
            ),
            linear-gradient(
              180deg,
              rgba(9, 9, 11, 0.85) 0%,
              rgba(9, 9, 11, 0.55) 25%,
              transparent 60%,
              rgba(9, 9, 11, 0.35) 100%
            );
          pointer-events: none;
        }
        .sf-aurora-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(90px);
          pointer-events: none;
        }
        .sf-aurora-orb.is-anim {
          animation: aurora-drift 22s ease-in-out infinite;
        }
        .sf-aurora-orb-a {
          width: 420px;
          height: 420px;
          left: 8%;
          top: 30%;
          background: rgba(45, 212, 191, 0.18);
        }
        .sf-aurora-orb-b {
          width: 380px;
          height: 380px;
          right: 6%;
          top: 18%;
          background: rgba(6, 182, 212, 0.14);
          animation-delay: -6s;
        }
        .sf-aurora-orb-c {
          width: 360px;
          height: 360px;
          left: 38%;
          bottom: -8%;
          background: rgba(94, 234, 212, 0.2);
          animation-delay: -12s;
        }
        @keyframes aurora-pulse {
          0%,
          100% {
            transform: translateX(-50%) scale(1);
          }
          50% {
            transform: translateX(-50%) scale(1.08);
          }
        }
        @keyframes aurora-drift {
          0%,
          100% {
            transform: translate(0, 0);
          }
          33% {
            transform: translate(40px, -30px);
          }
          66% {
            transform: translate(-30px, 40px);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-aurora::before,
          .sf-aurora-orb.is-anim {
            animation: none;
          }
        }

        .sf-grid {
          position: absolute;
          inset: 0;
          z-index: -1;
          background-image:
            linear-gradient(rgba(244, 244, 245, 0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(244, 244, 245, 0.045) 1px, transparent 1px);
          background-size: 48px 48px;
          -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 38%, black 30%, transparent 80%);
          mask-image: radial-gradient(ellipse 60% 50% at 50% 38%, black 30%, transparent 80%);
          pointer-events: none;
        }
        .sf-grain {
          position: absolute;
          inset: 0;
          z-index: -1;
          opacity: 0.05;
          pointer-events: none;
          mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.6'/></svg>");
        }
      `}</style>
    </section>
  );
}
