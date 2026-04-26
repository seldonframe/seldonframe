// /demo — placeholder for the HVAC demo video.
// Workstream 2 — "Watch the demo" / "Watch the walkthrough" CTAs land
// here. Replaced with embedded video post-recording.

import type { Metadata } from "next";
import { MarketingShell } from "../marketing-shell";

export const metadata: Metadata = {
  title: "Demo — SeldonFrame (Desert Cool HVAC walkthrough)",
  description:
    "End-to-end walkthrough of building a complete agency-deployed Business OS in SeldonFrame. Demo video coming soon.",
};

export default function DemoPage() {
  return (
    <MarketingShell>
      <article className="max-w-[760px] mx-auto px-5 md:px-12 py-12 md:py-20">
        <header className="mb-10 text-center">
          <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">Demo · HVAC walkthrough</p>
          <h1 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.03em] text-[#fafafa] mb-4 leading-[1.15]">
            Desert Cool HVAC, end-to-end
          </h1>
          <p className="text-[16px] text-[#a1a1aa] leading-[1.7]">
            Phoenix, AZ. 14 technicians. ~1,800 customers. Four production agent
            flows. Branded portal. Built in SeldonFrame from clean repo to working
            product.
          </p>
        </header>

        <div className="bg-[#111113] border border-white/5 rounded-[12px] aspect-video flex items-center justify-center mb-10">
          <div className="text-center px-8">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#1FAE85]/10 flex items-center justify-center">
              <span className="text-[28px]">🎬</span>
            </div>
            <p className="text-[15px] text-[#fafafa] font-semibold mb-1">Demo video coming soon</p>
            <p className="text-[13px] text-[#71717a]">
              Recording in progress. Subscribe on{" "}
              <a
                href="https://x.com/seldonframe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1FAE85] hover:underline"
              >
                𝕏
              </a>{" "}
              or{" "}
              <a
                href="https://discord.gg/seldonframe"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1FAE85] hover:underline"
              >
                Discord
              </a>{" "}
              for launch notification.
            </p>
          </div>
        </div>

        <section className="bg-[#111113] border border-white/5 rounded-[12px] p-6 md:p-8">
          <h2 className="text-[16px] font-semibold mb-3 text-[#fafafa]">In the meantime</h2>
          <p className="text-[14px] text-[#a1a1aa] leading-[1.7] mb-4">
            The full Desert Cool HVAC build is documented as a worked example in
            the repo. It walks through workspace init, block scaffolding, archetype
            composition, and the customer-portal surface — each step annotated
            with the natural-language prompt that produced it.
          </p>
          <ul className="space-y-2 text-[14px]">
            <li>
              <a href="/docs/quickstart" className="text-[#1FAE85] hover:underline">
                Quickstart &rarr;
              </a>
              <span className="text-[#71717a]"> — three commands to run the same flow yourself</span>
            </li>
            <li>
              <a
                href="https://github.com/seldonframe/crm/tree/main/tasks/launch-content"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1FAE85] hover:underline"
              >
                Read the worked-example walkthrough &rarr;
              </a>
              <span className="text-[#71717a]"> — markdown source in the repo</span>
            </li>
          </ul>
        </section>
      </article>
    </MarketingShell>
  );
}
