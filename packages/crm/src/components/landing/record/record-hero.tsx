// packages/crm/src/components/landing/record/record-hero.tsx
//
// Dark hero for record mode (spec §4.1): the hero card IS the working
// recorder — zero friction, mirroring the paste-URL ethos. Hero copy
// moved here from record-client.tsx (Task 5 extraction).

"use client";

import dynamic from "next/dynamic";
import { HeroModeSwitch } from "@/components/landing/landing-mode";

// Code-split: the recorder bundle (state machine, service worker,
// upload pipeline) loads when record mode mounts — never on the
// default build-mode homepage.
const RecordSurface = dynamic(
  () => import("@/app/(public)/record/record-client").then((m) => m.RecordClient),
  {
    loading: () => (
      <div className="flex h-40 items-center justify-center text-[14px] text-[var(--lp-muted)]">
        Loading the recorder…
      </div>
    ),
  },
);

export function RecordHero({
  claimedSessionId,
  claimed,
  isAuthed,
  sharedFlag,
}: {
  claimedSessionId: string | null;
  claimed: boolean;
  isAuthed: boolean;
  sharedFlag?: "1" | "miss" | null;
}) {
  return (
    <section
      id="record-top"
      aria-label="Record how you work"
      className="relative flex flex-col items-center px-5 pb-16 pt-[100px] md:px-8 md:pb-20 md:pt-[120px]"
    >
      <div className="flex w-full max-w-[860px] flex-col items-center text-center">
        <p className="inline-flex items-center gap-2.5 font-sans text-[13.5px] tracking-[0.04em] text-[var(--lp-muted)]">
          <span className="inline-block size-1.5 rounded-full bg-[var(--lp-accent)]" aria-hidden />
          No signup to start
        </p>
        <h1 className="mt-3 max-w-[20ch] text-balance font-sans text-[clamp(34px,4.8vw,56px)] font-[500] leading-[1.04] tracking-[-0.025em] text-[var(--lp-ink)]">
          Show Seldon how you work.{" "}
          <em className="font-[Newsreader,Georgia,serif] font-normal not-italic tracking-[-0.01em]">
            It builds the agent.
          </em>
        </h1>
        <p className="mx-auto mt-4 max-w-[62ch] text-pretty text-[16px] leading-[1.55] text-[var(--lp-body)]">
          Screen-record yourself doing the job once — talking out loud, narration is half the
          signal. Seldon watches, asks about what it didn&apos;t understand, and compiles a
          working agent.
        </p>

        {/* The hero card: mode switch on top, live recorder inside. */}
        <div className="mt-10 w-full max-w-[860px] rounded-[18px] border border-[var(--lp-border)] bg-[var(--lp-card)] p-2 text-left shadow-[0_1px_2px_rgba(0,0,0,.2),0_10px_30px_rgba(0,0,0,.25)]">
          <HeroModeSwitch />
          <div className="px-3 pb-3 pt-4 md:px-4">
            <RecordSurface
              claimedSessionId={claimedSessionId}
              claimed={claimed}
              isAuthed={isAuthed}
              sharedFlag={sharedFlag}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
