// Cut C Phase 5 — Open-source / GitHub-proof section.
//
// Sits below the pricing comparison table to defuse the three concrete
// agency-buyer fears the pricing matrix raises: (1) lock-in (will
// SeldonFrame jack up prices?), (2) data ownership / GDPR, (3) switch-
// out cost. The section reframes "we are open source" from a passive
// fact into a promise the buyer can collect on.
//
// Copy refined by design:ux-copy (Phase 5 Task 5.3, May 2026). H2
// addresses the lock-in fear head-on; subtitle and Pillar 3 carry the
// data-ownership reassurance; the GitHub stars badge sits between
// subtitle and pillar grid as the proof anchor.
//
// License string is AGPL-3.0 (verified against repo LICENSE file, not
// MIT as the plan draft suggested). The footer (Phase 7) already says
// MIT — Phase 7 fixes that to AGPL-3.0 for consistency.

import { Code2, Terminal, Database } from "lucide-react";
import { GitHubStarsBadge, fetchStarCount } from "@/components/landing/github-stars-badge";

type Pillar = {
  icon: typeof Code2;
  label: string;
  body: string;
};

const PILLARS: readonly Pillar[] = [
  {
    icon: Code2,
    label: "AGPL-3.0 licensed",
    body: "Run the whole stack on your own hardware, free. No license fees, no per-seat charge.",
  },
  {
    icon: Terminal,
    label: "Claude Code first",
    body: "Spin up a client workspace from your terminal. The web app is the same backend.",
  },
  {
    icon: Database,
    label: "Your data, your DB",
    body: "Export every workspace as Postgres dumps. Walk away anytime, no extract fees.",
  },
];

export async function LandingOpenSourceSection() {
  const stars = await fetchStarCount();

  return (
    <section
      id="open-source"
      aria-labelledby="open-source-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          Open source
        </p>
        <h2
          id="open-source-heading"
          className="text-3xl font-bold text-zinc-100 md:text-4xl"
        >
          If we ever get weird about pricing, fork us.
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-zinc-400">
          AGPL-3.0. Self-host with one command, or let SeldonFrame Cloud run it for you. The
          data&apos;s yours either way.
        </p>
        <div className="mt-6 flex justify-center">
          <GitHubStarsBadge stars={stars} />
        </div>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => {
          const Icon = pillar.icon;
          return (
            <article
              key={pillar.label}
              data-pillar={pillar.label}
              className="flex flex-col items-start rounded-xl border border-zinc-800 bg-zinc-900 p-5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#14b8a6]/10 text-[#14b8a6]">
                <Icon size={20} aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-zinc-100">{pillar.label}</h3>
              <p className="mt-1 text-sm leading-relaxed text-zinc-400">{pillar.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
