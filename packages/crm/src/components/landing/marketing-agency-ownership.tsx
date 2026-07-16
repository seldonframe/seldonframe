// packages/crm/src/components/landing/marketing-agency-ownership.tsx
//
// Added 2026-07-16 per docs/strategy/ghl-pain-messaging-plan-2026-07-16.md
// (§B — "/agencies — lead with ownership + the math story"). Two blocks:
//
// 1. Ownership block — the never-taxes/no-lock-in pitch, anchored to
//    GoHighLevel's own help-center article on website export (the
//    strongest verified pain: vendor's own docs, not a third-party claim).
// 2. The $99-vs-$497 comparison table — SF Agency Starter vs GHL SaaS
//    Mode + white-label mobile add-on + metered usage.
//
// Server component (no interactivity needed) — sibling to
// MarketingAgencyMath, reusing its warm paper section pattern (this one
// sits on the page's paper background rather than the dark forest block,
// so it reads as a distinct "proof" section right after the pitch+math).
//
// PHRASING GUARDS (do not relax — see plan doc "prohibited claims" list):
// - "no supported export" — never "zero data egress" or "resellers don't
//   own their data" (both refuted).
// - GHL's fees are PUBLISHED in its own docs — never "hidden fees".
// - The white-label mobile app cell must read as an honest gap ("web
//   portal, your domain"), never implied parity with a mobile app SF
//   does not have.

import Link from "next/link";

const GHL_EXPORT_HELP_URL =
  "https://help.gohighlevel.com/support/solutions/articles/155000007342";

export function MarketingAgencyOwnership() {
  return (
    <section
      aria-label="Ownership and pricing vs. GoHighLevel"
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Ownership block */}
        <div className="grid grid-cols-1 items-start gap-10 min-[900px]:grid-cols-[1.1fr_.9fr] min-[900px]:gap-14">
          <div>
            <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#059669]">
              <span className="h-px w-4 bg-[#059669]" aria-hidden />
              No lock-in
            </div>
            <h2 className="mt-3.5 text-[clamp(27px,4.2vw,40px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]">
              Own everything.{" "}
              <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[rgba(34,29,23,.6)]">
                Leave anytime.
              </em>
            </h2>
            <p className="mt-4 max-w-[54ch] text-[15.5px] leading-[1.55] text-[rgba(34,29,23,.72)]">
              SeldonFrame is open source (AGPL-3.0) — run it on our cloud or self-host it yourself.
              Every client site, agent, CRM record, and piece of content your agency builds exports
              any time: contacts and deals as JSON, agents as portable configs, sites as their own
              hosted pages. There&rsquo;s no claim step, no export request, no waiting on us. A public
              Docker image exists for the day you want to run it entirely on your own infrastructure.
            </p>
          </div>

          <blockquote className="rounded-[20px] border border-[rgba(34,29,23,.1)] bg-white px-7 py-6 shadow-[0_1px_2px_rgba(34,29,23,.04),0_20px_44px_rgba(34,29,23,.06)]">
            <p className="m-0 text-[15px] italic leading-[1.6] text-[#221D17]">
              GoHighLevel&rsquo;s own help center: HighLevel &ldquo;
              <Link
                href={GHL_EXPORT_HELP_URL}
                target="_blank"
                rel="nofollow noopener"
                className="not-italic underline decoration-[rgba(34,29,23,.3)] underline-offset-2 hover:decoration-[#221D17]"
              >
                does not support exporting websites in a way that allows them to be managed
              </Link>
              &rdquo; outside its platform — no supported export.
            </p>
            <p className="m-0 mt-3 text-[11.5px] uppercase tracking-[0.08em] text-[rgba(34,29,23,.45)]">
              GoHighLevel help center, accessed July 2026
            </p>
          </blockquote>
        </div>

        {/* $99-vs-$497 comparison table */}
        <div className="mt-16 md:mt-20">
          <div className="inline-flex items-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#059669]">
            <span className="h-px w-4 bg-[#059669]" aria-hidden />
            The math, side by side
          </div>
          <h3 className="mt-3.5 max-w-[36ch] text-[clamp(22px,3vw,30px)] font-[500] leading-[1.15] tracking-[-0.02em] text-[#221D17]">
            Reselling under your own brand, priced honestly
          </h3>
          <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.55] text-[rgba(34,29,23,.6)]">
            Per GoHighLevel&rsquo;s published pricing, July 2026.
          </p>

          <div className="mt-6 overflow-x-auto rounded-[18px] border border-[rgba(34,29,23,.1)] bg-white">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-[rgba(34,29,23,.1)]">
                  <th scope="col" className="px-5 py-4 font-[600] text-[rgba(34,29,23,.55)]">
                    &nbsp;
                  </th>
                  <th scope="col" className="px-5 py-4 font-[600] text-[#221D17]">
                    SeldonFrame Agency Starter
                  </th>
                  <th scope="col" className="px-5 py-4 font-[600] text-[#221D17]">
                    GoHighLevel
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[rgba(34,29,23,.08)]">
                  <th scope="row" className="px-5 py-4 font-[500] text-[rgba(34,29,23,.7)]">
                    Resell under your brand
                  </th>
                  <td className="px-5 py-4 font-[600] text-[#059669]">$99/mo (included)</td>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">
                    requires $497/mo Agency Pro (SaaS Mode)
                  </td>
                </tr>
                <tr className="border-b border-[rgba(34,29,23,.08)]">
                  <th scope="row" className="px-5 py-4 font-[500] text-[rgba(34,29,23,.7)]">
                    White-label client access
                  </th>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">web portal, your domain — included</td>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">white-label mobile app: +$497/mo add-on</td>
                </tr>
                <tr className="border-b border-[rgba(34,29,23,.08)]">
                  <th scope="row" className="px-5 py-4 font-[500] text-[rgba(34,29,23,.7)]">
                    Usage
                  </th>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">
                    flat — no per-email/SMS platform meter (BYOK / BYO-Twilio at provider cost)
                  </td>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">
                    metered per email ($0.675/1k) + per SMS segment + per voice minute
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-5 py-4 font-[500] text-[rgba(34,29,23,.7)]">
                    Cut of what you resell
                  </th>
                  <td className="px-5 py-4 font-[600] text-[#059669]">0% GMV on agency plans</td>
                  <td className="px-5 py-4 text-[rgba(34,29,23,.72)]">&mdash;</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3 max-w-[70ch] text-[12px] leading-[1.5] text-[rgba(34,29,23,.45)]">
            GoHighLevel&rsquo;s fees are published in its own pricing and support docs, not hidden —
            we&rsquo;re just laying them next to ours. It also offers mitigations at the $497 tier
            (bring-your-own SMTP, usage rebilling with markup) that narrow this gap; we&rsquo;re
            comparing what each plan includes at its own price, not claiming GoHighLevel is
            deceptive about it.
          </p>
        </div>
      </div>
    </section>
  );
}
