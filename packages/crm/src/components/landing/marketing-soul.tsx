// packages/crm/src/components/landing/marketing-soul.tsx
//
// 2026-05-22 — Port of HTML §7 SOUL. Central animated SVG showing
// the workspace soul radiating outward to the four module pills
// (CRM / Booking / Intake / Chatbot). The SVG <animate> tags pulse
// the connecting lines and the soul core. Marked aria-hidden — the
// visual is decorative; the section copy above carries the meaning.

import { MarketingHeadlineMuted, MarketingSectionHead } from "./marketing-section-head";

export function MarketingSoul() {
  return (
    <section
      id="soul"
      aria-label="Workspace soul"
      className="relative isolate px-5 py-24 md:px-8 md:py-32 lg:px-12 lg:py-36"
    >
      <div className="mx-auto max-w-[1200px]">
        <MarketingSectionHead
          eyebrow="The soul of the workspace"
          headline={
            <>
              One source of truth. <MarketingHeadlineMuted>Every module reads from it.</MarketingHeadlineMuted>
            </>
          }
          sub="Paste a URL. We compile a workspace soul — services, hours, voice, prices, license numbers. Then the modules radiate outward. Change the soul once; every surface updates."
        />

        <div className="relative flex min-h-[420px] items-center justify-center" aria-hidden="true">
          <svg
            viewBox="-400 -240 800 480"
            className="block h-auto w-full max-w-[720px]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="0" cy="0" r="220" fill="none" stroke="rgba(244,244,245,0.04)" strokeWidth="1" strokeDasharray="3 5" />
            <circle cx="0" cy="0" r="150" fill="none" stroke="rgba(244,244,245,0.06)" strokeWidth="1" strokeDasharray="3 5" />

            <g stroke="#1F2B24" strokeWidth="1.2" fill="none" opacity="0.55">
              <line x1="0" y1="0" x2="-200" y2="-100">
                <animate attributeName="stroke-opacity" values="0.2;0.9;0.2" dur="3s" repeatCount="indefinite" />
              </line>
              <line x1="0" y1="0" x2="200" y2="-100">
                <animate attributeName="stroke-opacity" values="0.9;0.2;0.9" dur="3s" repeatCount="indefinite" />
              </line>
              <line x1="0" y1="0" x2="-200" y2="100">
                <animate attributeName="stroke-opacity" values="0.2;0.9;0.2" dur="3.6s" repeatCount="indefinite" />
              </line>
              <line x1="0" y1="0" x2="200" y2="100">
                <animate attributeName="stroke-opacity" values="0.9;0.2;0.9" dur="3.6s" repeatCount="indefinite" />
              </line>
            </g>

            <g>
              <circle cx="0" cy="0" r="62" fill="#0c0c0e" stroke="#1F2B24" strokeWidth="1.4" />
              <circle cx="0" cy="0" r="62" fill="none" stroke="#1F2B24" strokeWidth="2" opacity="0.4">
                <animate attributeName="r" values="62;78;62" dur="3.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="3.6s" repeatCount="indefinite" />
              </circle>
              <text x="0" y="-4" textAnchor="middle" fill="#5eead4" fontFamily="var(--font-geist-mono), monospace" fontSize="9" letterSpacing="2">
                SOUL
              </text>
              <text x="0" y="14" textAnchor="middle" fill="#a1a1aa" fontFamily="var(--font-geist-sans), sans-serif" fontSize="10">
                workspace.toml
              </text>
            </g>

            <g>
              <g transform="translate(-200, -100)">
                <rect x="-62" y="-22" width="124" height="44" rx="10" fill="#18181b" stroke="#27272a" />
                <text x="0" y="-2" textAnchor="middle" fill="#fafafa" fontFamily="var(--font-geist-sans), sans-serif" fontSize="13" fontWeight="600">
                  CRM
                </text>
                <text x="0" y="14" textAnchor="middle" fill="#71717a" fontFamily="var(--font-geist-mono), monospace" fontSize="9" letterSpacing="2">
                  LEADS · DEALS
                </text>
              </g>
              <g transform="translate(200, -100)">
                <rect x="-62" y="-22" width="124" height="44" rx="10" fill="#18181b" stroke="#27272a" />
                <text x="0" y="-2" textAnchor="middle" fill="#fafafa" fontFamily="var(--font-geist-sans), sans-serif" fontSize="13" fontWeight="600">
                  Booking
                </text>
                <text x="0" y="14" textAnchor="middle" fill="#71717a" fontFamily="var(--font-geist-mono), monospace" fontSize="9" letterSpacing="2">
                  CALENDAR
                </text>
              </g>
              <g transform="translate(-200, 100)">
                <rect x="-62" y="-22" width="124" height="44" rx="10" fill="#18181b" stroke="#27272a" />
                <text x="0" y="-2" textAnchor="middle" fill="#fafafa" fontFamily="var(--font-geist-sans), sans-serif" fontSize="13" fontWeight="600">
                  Intake
                </text>
                <text x="0" y="14" textAnchor="middle" fill="#71717a" fontFamily="var(--font-geist-mono), monospace" fontSize="9" letterSpacing="2">
                  FORMS
                </text>
              </g>
              <g transform="translate(200, 100)">
                <rect x="-62" y="-22" width="124" height="44" rx="10" fill="#18181b" stroke="#27272a" />
                <text x="0" y="-2" textAnchor="middle" fill="#fafafa" fontFamily="var(--font-geist-sans), sans-serif" fontSize="13" fontWeight="600">
                  Chatbot
                </text>
                <text x="0" y="14" textAnchor="middle" fill="#71717a" fontFamily="var(--font-geist-mono), monospace" fontSize="9" letterSpacing="2">
                  AI · BOOKING
                </text>
              </g>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}
