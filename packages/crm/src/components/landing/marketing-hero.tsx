// packages/crm/src/components/landing/marketing-hero.tsx
//
// Redesign 2026-06-18 — warm light aesthetic (seldonstudio.com style).
// Shopify-homepage redesign (2026-07-06): one promise, ONE CTA — the
// "For agencies →" secondary CTA is gone (that pitch now lives on
// /agencies). The build-proof video panel (HeroBuildProof) is removed
// entirely and the two-column split collapses to a single centered
// column so the chatbox/form is the clear focal point.
//   Primary: "Build it free →" → /signup (SMB self-serve; free ungated build,
//   no trial countdown — the $29/mo charge only happens at the domain moment)
//
// Design tokens used:
//   --paper:    #F6F2EA  (warm off-white background)
//   --ink:      #221D17  (warm near-black)
//   --ink-soft: #6E665A  (softer body text)
//   --green:    #1F2B24  (deep green — dark blocks, nav pill bg)
//   --sf-green: #00897B  (SeldonFrame brand green — accent dots, CTAs)
//   Font: Hanken Grotesk (body/UI) + Newsreader italic (display accents)
//
// Functional input (URL/biz paste) is preserved — the hero's main job
// is still to let the user start a workspace immediately. The copy +
// visual treatment shifts from dark/teal to light/warm.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, FileText, Globe } from "lucide-react";

import { MarketingDemoMarquee } from "@/components/landing/marketing-demo-marquee";
import { heroSubmitTarget } from "@/components/landing/hero-submit-target";
import { HeroModeSwitch } from "@/components/landing/landing-mode";
import { BorderBeam } from "@/components/ui/border-beam";

// Re-exported for callers that only need the pure routing decision (e.g.
// tests) without pulling in this "use client" component.
export { heroSubmitTarget };

const URL_EXAMPLES = [
  "https://your-clients-hvac-company.com",
  "https://your-clients-dental-practice.com",
  "https://your-clients-medspa.com",
  "https://your-clients-roofing-business.com",
  "https://your-clients-law-firm.com",
];
const BIZ_EXAMPLES = [
  "Family-owned HVAC in Stockton, CA. 24/7 emergency service. Licensed C-20, bonded, insured. 4.8 stars on Google with 412 reviews.",
  "Dental practice in Auburn, CA. Two board-certified DDS + a periodontist. In-network with 28 PPO carriers.",
  "Medspa on Montana Avenue. Discreet, physician-led, by appointment only. AAD Fellow on staff.",
  "Heritage roofer in the Hudson Valley. Slate, copper, cedar. Family-owned since 1962.",
];

type TabKind = "url" | "biz";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  return reduced;
}

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
        node.setAttribute("placeholder", target.slice(0, pos) || " ");
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

export function MarketingHero({
  ungatedBuildEnabled = false,
}: {
  /** Task 8: when the web-ungated-build flag is on, route paste-and-go to
   *  /try instead of /signup. Computed server-side (env is not readable
   *  from this client component) and passed down by the page. */
  ungatedBuildEnabled?: boolean;
} = {}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKind>("url");
  const [urlValue, setUrlValue] = useState("");
  const [bizValue, setBizValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const reducedMotion = useReducedMotion();

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

  const submit = useCallback(() => {
    const value = (tab === "url" ? urlValue : bizValue).trim();
    if (value.length < 3) return;
    try {
      localStorage.setItem(
        "sf-workspace-seed",
        JSON.stringify({ kind: tab, value, at: Date.now() }),
      );
    } catch {
      // non-fatal — URL mode still passes ?url=
    }
    setSubmitting(true);
    setTimeout(() => {
      router.push(heroSubmitTarget(tab, value, ungatedBuildEnabled));
    }, 380);
  }, [tab, urlValue, bizValue, router, ungatedBuildEnabled]);

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

  useEffect(() => {
    const t = setTimeout(() => urlRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, []);

  return (
    <section
      id="top"
      aria-label="SeldonFrame hero"
      className="relative flex flex-col items-center justify-center overflow-hidden px-5 pb-24 pt-[100px] text-center md:px-8 md:pb-32 md:pt-[120px] lg:px-12"
    >
      {/* Single centered column (video panel removed — the chatbox/form is
          the focal point). */}
      <div className="flex w-full max-w-[860px] flex-col items-center">
      <div className="flex w-full flex-col items-center text-center">
      {/* Eyebrow */}
      <p className="inline-flex items-center gap-2.5 font-sans text-[12.5px] tracking-[0.04em] text-[#6E665A]">
        <span className="inline-block h-px w-4 bg-[#9A9183]" aria-hidden />
        <span className="sf-blink-dot inline-block size-1.5 rounded-full bg-[#00897B]" aria-hidden />
        Built in 3 minutes — No coding
      </p>

      {/* Headline */}
      <h1 className="mt-3 max-w-[20ch] text-balance font-sans text-[clamp(34px,4.8vw,56px)] font-[500] leading-[1.04] tracking-[-0.025em] text-[#221D17]">
        Start a service business{" "}
        <em className="font-[Newsreader,Georgia,serif] font-normal not-italic tracking-[-0.01em]">
          for free
        </em>
      </h1>

      {/* Subhead */}
      <p className="mx-auto mt-4 max-w-[62ch] text-pretty text-[clamp(15.5px,1.6vw,17.5px)] leading-[1.55] text-[#6E665A]">
        SeldonFrame is the all-in-one platform to{" "}
        <strong className="font-[500] text-[#221D17]">build, run, and grow</strong>{" "}
        your online business with agents. Start free, then $29/mo.
      </p>

      {/* Primary CTA */}
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/signup"
          className="inline-flex items-center gap-2.5 rounded-full bg-[#1F2B24] px-6 py-3.5 text-[15px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),0_18px_40px_rgba(34,29,23,.06),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-[1.5px] hover:shadow-[0_2px_4px_rgba(34,29,23,.12),0_12px_26px_rgba(34,29,23,.14),inset_0_1.5px_0_rgba(255,255,255,.14)] active:translate-y-px"
        >
          <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_4px_rgba(0,137,123,.22)]" aria-hidden />
          Build it free →
        </a>
      </div>

      {/* Trust line under the CTA */}
      <p className="mt-4 max-w-[60ch] text-pretty text-[13.5px] leading-[1.5] text-[#6E665A]">
        unlimited workspaces · works with your ChatGPT, Claude, or Gemini key
      </p>

      {/* Input form */}
      <form
        ref={formRef}
        id="hero-form"
        aria-label="Start a workspace"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="sf-prompt relative mt-10 w-full max-w-[720px] overflow-hidden rounded-[18px] border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08)] transition-[border-color,box-shadow] duration-200 focus-within:border-[#00897B]/50 focus-within:shadow-[0_1px_2px_rgba(34,29,23,.06),0_10px_30px_rgba(34,29,23,.08),0_0_0_3px_rgba(0,137,123,.12)]"
      >
        {/* Task 13: Live-state accent BorderBeam. Only render when reduced-motion is off. */}
        {!reducedMotion && (
          <BorderBeam
            size={40}
            duration={6}
            colorFrom="#00897B"
            colorTo="#00897B"
            delay={0}
            borderWidth={1}
          />
        )}
        {/* Mode switch: build vs record (Task 9). Null when the flag is
            off — the form is byte-identical to today. */}
        <div className="mx-2 mt-2">
          <HeroModeSwitch />
        </div>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="Input mode"
          className="mx-2 mt-2 grid grid-cols-2 gap-1 rounded-[10px] border border-[rgba(34,29,23,.08)] bg-[#F6F2EA] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "url"}
            onClick={() => handleTab("url")}
            className={`inline-flex h-[34px] items-center justify-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors sm:gap-2 sm:px-3 sm:text-[13px] ${
              tab === "url"
                ? "bg-[#FFFDFA] font-[600] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.10)]"
                : "font-[500] text-[#6E665A] hover:text-[#221D17]"
            }`}
          >
            <Globe size={13} className="shrink-0" aria-hidden />
            Paste a URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "biz"}
            onClick={() => handleTab("biz")}
            className={`inline-flex h-[34px] items-center justify-center gap-1.5 rounded-[7px] px-2 text-[12px] transition-colors sm:gap-2 sm:px-3 sm:text-[13px] ${
              tab === "biz"
                ? "bg-[#FFFDFA] font-[600] text-[#221D17] shadow-[0_1px_3px_rgba(34,29,23,.10)]"
                : "font-[500] text-[#6E665A] hover:text-[#221D17]"
            }`}
          >
            <FileText size={13} className="shrink-0" aria-hidden />
            Describe the business
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
              if (e.key === "Enter" && canSubmit) { e.preventDefault(); submit(); }
            }}
            autoComplete="off"
            spellCheck={false}
            placeholder="https://your-hvac-company.com"
            aria-label="Paste your website URL"
            className="h-14 w-full border-0 bg-transparent font-mono text-[15px] text-[#221D17] caret-[#00897B] outline-none placeholder:text-[#9A9183]"
          />
        </div>

        {/* Biz pane */}
        <div className={`px-4 pt-3.5 ${tab === "biz" ? "block" : "hidden"}`}>
          <textarea
            ref={bizRef}
            name="biz"
            value={bizValue}
            onChange={(e) => setBizValue(e.target.value)}
            rows={4}
            spellCheck={false}
            placeholder="Family-owned HVAC in Stockton, CA. 24/7 emergency service. Licensed C-20, bonded, insured. 4.8 stars on Google with 412 reviews."
            aria-label="Describe your business"
            className="block max-h-60 min-h-[110px] w-full resize-none border-0 bg-transparent font-sans text-[15px] leading-[1.55] tracking-[-0.005em] text-[#221D17] caret-[#00897B] outline-none placeholder:text-[#9A9183]"
          />
        </div>

        {/* Bottom action row */}
        <div className="flex items-center justify-between gap-3 px-3.5 pb-3.5 pt-3 text-[#9A9183]">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] tracking-wide">
            <span className="inline-flex items-center rounded-md border border-[rgba(34,29,23,.12)] bg-[#F6F2EA] px-1.5 py-0.5 text-[10.5px] leading-none text-[#6E665A]">⌘</span>
            <span className="inline-flex items-center rounded-md border border-[rgba(34,29,23,.12)] bg-[#F6F2EA] px-1.5 py-0.5 text-[10.5px] leading-none text-[#6E665A]">↵</span>
            <small className="text-[11px] text-[#9A9183]">to launch</small>
          </span>
          <button
            type="submit"
            disabled={!canSubmit || submitting}
            aria-label="Build workspace"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#00897B] px-4 text-[13.5px] font-[600] text-[#FFFDFA] shadow-[0_6px_20px_rgba(0,137,123,.28)] transition-all hover:-translate-y-px hover:bg-[#00796B] hover:shadow-[0_8px_24px_rgba(0,137,123,.34)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
          >
            <span>Build workspace</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
          </button>
        </div>
      </form>
      </div>
      </div>

      {/* Proof checklist */}
      <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {["Build it free", "Live in 3 minutes", "$29/mo flat", "Cancel anytime"].map((item) => (
          <li key={item} className="flex items-center gap-2 text-[13.5px] text-[#6E665A]">
            <span className="flex size-[17px] items-center justify-center rounded-full bg-[rgba(0,137,123,.12)] text-[10px] font-[700] text-[#00897B]" aria-hidden>✓</span>
            {item}
          </li>
        ))}
      </ul>

      {/* Rotating live-demo marquee (anchor target for "#demos") */}
      <div id="demos" className="w-full scroll-mt-24">
        <MarketingDemoMarquee />
      </div>

      {/* Loading overlay */}
      {submitting ? (
        <div
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-[#F6F2EA]/85 backdrop-blur-md"
          aria-live="polite"
        >
          <div className="size-7 animate-spin rounded-full border-2 border-[#00897B]/20 border-t-[#00897B]" aria-hidden />
          <div className="font-sans text-xs uppercase tracking-[0.12em] text-[#6E665A]">
            Spinning up your workspace…
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .sf-blink-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #00897B 22%, transparent);
          animation: sf-blink 2.4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-blink-dot { animation: none; }
        }
        @keyframes sf-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </section>
  );
}
