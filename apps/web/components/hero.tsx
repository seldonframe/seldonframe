import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Reveal } from "@/components/reveal";

export function Hero() {
  return (
    <section className="web-section pt-10 md:pt-16">
      <div className="web-container">
        <div className="mb-10 flex items-center justify-between gap-4">
          <Image src="/logo-full.svg" alt="SeldonFrame" width={180} height={34} className="h-8 w-auto" priority />
          <div className="flex items-center gap-3">
            <a href="https://app.seldonframe.com/login" className="text-sm text-[hsl(var(--color-text-secondary))] transition hover:text-foreground">
              Log in
            </a>
            <a href="https://app.seldonframe.com/signup" className="glow-teal inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:-translate-y-px">
              Start Free <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <Reveal>
            <div>
              <h1 className="max-w-[700px] text-[40px] font-bold leading-[1.03] tracking-[-0.03em] text-foreground sm:text-[48px]">
                Your business system <span className="text-[#00897B]">builds itself.</span>
              </h1>
              <p className="mt-6 max-w-[560px] text-lg text-[hsl(var(--color-text-secondary))]">
                Built for coaches, consultants, agencies, and service professionals who manage client relationships. Tell
                SeldonFrame about your practice — it configures your CRM, booking, email, landing pages, payments, and
                client portal in 5 minutes.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a href="https://app.seldonframe.com/signup" className="glow-teal inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground transition hover:-translate-y-px">
                  Start Free <ArrowRight className="h-4 w-4" />
                </a>
                <a href="https://github.com/seldonframe/crm" className="inline-flex h-12 items-center gap-2 rounded-lg border border-primary px-6 text-sm font-semibold text-primary transition hover:bg-primary/10">
                  View on GitHub <ArrowRight className="h-4 w-4" />
                </a>
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[hsl(var(--color-text-secondary))]">
                <span className="glass-card inline-flex items-center rounded-full px-2 py-1">GitHub ★</span>
                <span>No credit card required</span>
                <span>MIT Licensed</span>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={160}>
            <div className="relative">
              <div className="absolute -inset-4 -z-10 rounded-3xl bg-[radial-gradient(circle_at_30%_20%,rgba(0,121,107,0.15),transparent_60%)] blur-2xl" />
              <div className="glass-card overflow-hidden rounded-2xl p-3 shadow-modal">
                <div className="mb-2 flex items-center gap-1.5 rounded-md bg-[hsl(var(--color-surface-raised))]/60 px-2 py-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/20" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500/20" />
                </div>
                <div className="relative overflow-hidden rounded-xl border border-white/10">
                  <Image
                    src="/demo/dashboard-coaching.png"
                    alt="SeldonFrame CRM dashboard with coaching data"
                    width={1200}
                    height={675}
                    className="h-auto w-full"
                    priority
                  />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
