"use client";

import { AnimatedList } from "@/components/ui/animated-list";
import { TypingAnimation } from "@/components/ui/typing-animation";

const STEPS = [
  "✓ Created: Lead Qualification Quiz",
  "• 5-question quiz with branching logic",
  "• 3 pipeline routing rules",
  "• Embeddable on your landing page",
  "• Connected to your CRM automatically",
];

export function SeldonItDemo() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#071216] p-6 md:p-8">
      <div className="rounded-xl border border-white/10 bg-black/25 p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-[#86a2a7]">User</p>
        <TypingAnimation
          as="p"
          duration={28}
          className="mt-2 text-sm leading-relaxed text-[#d6e6e9] md:text-base"
          startOnView
          showCursor
        >
          Build a quiz funnel that qualifies leads based on 5 questions and sends them to different pipeline stages
        </TypingAnimation>
      </div>

      <div className="mt-5 rounded-xl border border-[#15b8b0]/25 bg-[#0b1c22] p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-[#7ce7e0]">Seldon</p>
        <AnimatedList className="mt-3 items-start gap-2" delay={520}>
          {STEPS.map((step) => (
            <div key={step} className="w-full rounded-lg border border-white/10 bg-white/3 px-3 py-2 text-sm text-[#d6ecef]">
              {step}
            </div>
          ))}
        </AnimatedList>
      </div>
    </div>
  );
}
