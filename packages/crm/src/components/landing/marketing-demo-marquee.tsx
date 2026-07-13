// packages/crm/src/components/landing/marketing-demo-marquee.tsx
//
// Revamp 2026-06-18 — rotating live-demo marquee, ported from
// seldonstudio.com's SITES marquee. Sits below the hero chatbox.
//
// A horizontal auto-scrolling row of real workspace screenshots. The card
// set is DUPLICATED so the translateX(0 → -50%) loop is seamless; hovering
// the wrapper pauses the scroll; edge fade via mask-image. Honors
// prefers-reduced-motion (the keyframe is paused, leaving a calm static row
// the visitor can still scroll/tab through).
//
// Design tokens: card #FFFDFA, paper #F6F2EA, ink #221D17, muted #6E665A,
// faint #9A9183, accent green #00897B, border rgba(34,29,23,.10).

"use client";

// The 9 live demo workspaces (name, type, href). The slug is derived from the
// workspace href and matches the screenshot in /public/shots/<slug>.jpg.
export const LIVE_DEMOS = [
  { name: "J. Marin Heating & Air Conditioning", type: "HVAC", href: "https://j-marin-heating-air-conditioning-9599.app.seldonframe.com/" },
  { name: "Metro MedSpa", type: "Med spa", href: "https://app.seldonframe.com/w/metro-medspa-9d24" },
  { name: "The Cooling Specialists", type: "Air conditioning", href: "https://app.seldonframe.com/w/the-cooling-specialists" },
  { name: "Vive Ageless Weight Loss Center", type: "Weight loss", href: "https://app.seldonframe.com/w/vive-ageless-weight-loss-center" },
  { name: "Crown Plumbing", type: "Plumbing", href: "https://app.seldonframe.com/w/crown-plumbing" },
  { name: "GameDay Men's Health", type: "Men's health", href: "https://app.seldonframe.com/w/gameday-mens-health-west-palm-beach" },
  { name: "Rejuvenate MedSpa", type: "Med spa", href: "https://app.seldonframe.com/w/rejuvenate-medspa" },
  { name: "Clean Cut Landscape Co", type: "Landscaping", href: "https://app.seldonframe.com/w/clean-cut-landscape-co" },
  { name: "SKINNEY Medspa", type: "Med spa", href: "https://app.seldonframe.com/w/skinney-medspa" },
] as const;

type Demo = (typeof LIVE_DEMOS)[number];

// Derive the screenshot slug from either URL shape:
//   • path form   https://app.seldonframe.com/w/<slug>
//   • subdomain   https://<slug>.app.seldonframe.com/
// The subdomain form (used by workspaces on their own app subdomain) must not
// fall through to "" — that would point the card at /shots/.jpg (a broken image).
function slugOf(href: string): string {
  const afterW = href.split("/w/")[1];
  if (afterW) return afterW.split(/[/?#]/)[0];
  try {
    const m = new URL(href).host.match(/^([^.]+)\.app\.seldonframe\.com$/i);
    if (m) return m[1];
  } catch {
    /* malformed href — fall through to "" */
  }
  return "";
}

function hostOf(href: string): string {
  try {
    return new URL(href).host;
  } catch {
    return "app.seldonframe.com";
  }
}

function DemoCard({ demo }: { demo: Demo }) {
  const slug = slugOf(demo.href);
  return (
    <a
      href={demo.href}
      target="_blank"
      rel="noopener noreferrer"
      className="sf-demo-card group block w-[300px] shrink-0 overflow-hidden rounded-[16px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] shadow-[0_1px_2px_rgba(34,29,23,.05),0_10px_30px_rgba(34,29,23,.07)] transition-transform duration-200 hover:-translate-y-[5px]"
    >
      {/* Browser chrome bar */}
      <div className="flex items-center gap-2 border-b border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-3 py-2">
        <span className="flex items-center gap-1" aria-hidden>
          <span className="size-2 rounded-full bg-[rgba(34,29,23,.18)]" />
          <span className="size-2 rounded-full bg-[rgba(34,29,23,.14)]" />
          <span className="size-2 rounded-full bg-[rgba(34,29,23,.10)]" />
        </span>
        <span className="truncate font-mono text-[10.5px] text-[#9A9183]">{hostOf(demo.href)}</span>
      </div>

      {/* 16:10 screenshot */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#EFE9DD]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/shots/${slug}.jpg`}
          alt={`${demo.name} — live SeldonFrame workspace`}
          loading="lazy"
          decoding="async"
          className="size-full object-cover object-[center_top]"
        />
      </div>

      {/* Meta footer */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-[600] leading-tight text-[#221D17]">
            {demo.name}
          </span>
          <span className="block truncate text-[11px] leading-tight text-[#9A9183]">{demo.type}</span>
        </span>
        <span className="shrink-0 font-mono text-[11.5px] font-[600] text-[#00897B] transition-transform duration-200 group-hover:translate-x-0.5">
          Try it ↗
        </span>
      </div>
    </a>
  );
}

export function MarketingDemoMarquee() {
  // Duplicate the set so translateX(0 → -50%) wraps seamlessly.
  const loop = [...LIVE_DEMOS, ...LIVE_DEMOS];

  return (
    <div
      className="sf-demo-marquee mt-12 w-full max-w-[1120px]"
      aria-label="Live demo workspaces"
    >
      <div className="mb-3 flex items-center justify-center gap-2.5">
        <span className="sf-demo-dot inline-block size-1.5 rounded-full bg-[#00897B]" aria-hidden />
        <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-[#9A9183]">
          Live demos — built from a URL
        </span>
      </div>

      {/* Edge-faded viewport; pause-on-hover lives on this wrapper. */}
      <div className="sf-demo-viewport group relative overflow-hidden">
        <div className="sf-demo-track flex w-max gap-[18px] py-2">
          {loop.map((demo, i) => (
            <DemoCard key={`${demo.href}-${i}`} demo={demo} />
          ))}
        </div>
      </div>

      <style jsx>{`
        .sf-demo-viewport {
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
        }
        .sf-demo-track {
          animation: sf-demo-marquee 56s linear infinite;
          will-change: transform;
        }
        /* Pause the scroll while the visitor hovers the strip. */
        .sf-demo-viewport:hover .sf-demo-track {
          animation-play-state: paused;
        }
        .sf-demo-dot {
          box-shadow: 0 0 0 3px color-mix(in oklab, #00897b 22%, transparent);
        }
        @keyframes sf-demo-marquee {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .sf-demo-track {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
