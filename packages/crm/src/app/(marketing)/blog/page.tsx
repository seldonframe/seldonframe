// /blog — placeholder for launch.
// Workstream 2 — exists so the nav + footer link doesn't 404.
// Replaced with a real blog index post-launch.

import type { Metadata } from "next";
import { MarketingShell } from "../marketing-shell";

export const metadata: Metadata = {
  title: "Blog — SeldonFrame",
  description: "Coming soon. Follow @seldonframe on X for updates.",
};

export default function BlogPage() {
  return (
    <MarketingShell>
      <article className="max-w-[640px] mx-auto px-5 md:px-12 py-20 md:py-28 text-center">
        <p className="text-[12px] uppercase tracking-[0.12em] text-[#71717a] font-mono mb-3">Blog</p>
        <h1 className="text-[clamp(28px,4vw,40px)] font-bold tracking-[-0.03em] text-[#fafafa] mb-4 leading-[1.15]">
          Coming soon.
        </h1>
        <p className="text-[16px] text-[#a1a1aa] leading-[1.7] mb-8">
          We&apos;re writing about how SeldonFrame is built, the discipline framework
          we use to ship slices, and worked examples of production agency deployments.
          First posts publish around launch.
        </p>
        <p className="text-[14px] text-[#a1a1aa]">
          Follow{" "}
          <a
            href="https://x.com/seldonframe"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1FAE85] hover:underline font-semibold"
          >
            @seldonframe on 𝕏
          </a>{" "}
          for updates, or join the{" "}
          <a
            href="https://discord.gg/sbVUu976NW"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#1FAE85] hover:underline font-semibold"
          >
            Discord
          </a>{" "}
          to talk to the team.
        </p>
      </article>
    </MarketingShell>
  );
}
