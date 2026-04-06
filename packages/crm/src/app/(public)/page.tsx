import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BookOpen,
  Check,
  GitFork,
  Link2,
  LayoutGrid,
  Sparkles,
  Star,
  Zap,
} from "lucide-react";
import { auth } from "@/auth";
import { UrlAnalyzer } from "@/components/landing/url-analyzer";
import { BackgroundBeams } from "@/components/marketing/background-beams";
import { LandingPricingSection } from "@/components/marketing/landing-pricing-section";
import { SeldonItDemo } from "@/components/marketing/seldon-it-demo";
import { SpotlightHeading } from "@/components/marketing/spotlight-heading";
import { TextReveal } from "@/components/marketing/text-reveal";
import { BorderBeam } from "@/components/ui/border-beam";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Particles } from "@/components/ui/particles";

export const metadata: Metadata = {
  title: "SeldonFrame — The Operating System for Your Business",
  description:
    "SeldonFrame is a business identity operating system. One brain. Every block. If it doesn't exist — Seldon it into existence. Free and open source.",
  openGraph: {
    title: "SeldonFrame",
    description: "The operating system for your business. One brain. Every block.",
    type: "website",
    url: "https://app.seldonframe.com",
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="bg-[#050d0f] font-[family-name:var(--font-geist-sans)] text-foreground">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#050d0f]/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/logo.svg" alt="SeldonFrame" width={28} height={36} className="h-9 w-auto" priority />
            <span className="text-base font-semibold">SeldonFrame</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-[#9fb2b8] md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <Link href="/soul-marketplace" className="transition-colors hover:text-foreground">
              Marketplace
            </Link>
            <Link href="/docs" className="transition-colors hover:text-foreground">
              Docs
            </Link>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-foreground"
            >
              GitHub ↗
            </Link>
          </nav>
          <Link
            href="/signup"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#15b8b0] px-5 text-sm font-semibold text-[#032826] transition-colors hover:bg-[#1ac8bf]"
          >
            Get Started →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="relative overflow-hidden py-20 md:py-28">
          <Particles className="absolute inset-0" quantity={90} color="#36d1c9" size={1.1} ease={140} staticity={42} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(21,184,176,0.22),rgba(5,13,15,0)_60%)]" />
          <TextReveal
            lines={["Paste your website.", "Get your business system.", "Go live in minutes."]}
            className="relative max-w-4xl text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl"
          />
          <p className="relative mt-7 max-w-2xl text-base leading-relaxed text-[#9fb2b8] md:text-lg">
            One URL. Seldon reads your site, learns your business, and builds your CRM, booking page, quiz funnel,
            and email sequences with your actual voice.
          </p>

          <div className="relative mt-10">
            <UrlAnalyzer />
          </div>

          <div className="relative mt-6 text-center">
            <p className="text-sm text-[#7f959d]">Try an example:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {[
                "https://jamesclear.com",
                "https://seths.blog",
                "https://tim.blog",
              ].map((example) => (
                <span key={example} className="rounded-full border border-white/15 px-3 py-1 text-xs text-[#9ec0c6]">
                  {example}
                </span>
              ))}
            </div>
          </div>

          <div className="relative mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#081418] p-2 shadow-[0_20px_80px_rgba(0,0,0,0.55)]">
            <Image
              src="/images/dashboard-preview.png"
              alt="SeldonFrame dashboard preview"
              width={1400}
              height={860}
              className="h-auto w-full rounded-xl"
              priority
            />
          </div>

          <div className="relative mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-[#0a171b]/80 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-[#8ca3a9]">Automations run</p>
              <p className="mt-2 text-2xl font-semibold text-[#e7fbf8]">
                <NumberTicker value={1248} className="text-[#e7fbf8]" />+
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0a171b]/80 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-[#8ca3a9]">Contacts synced</p>
              <p className="mt-2 text-2xl font-semibold text-[#e7fbf8]">
                <NumberTicker value={3278} className="text-[#e7fbf8]" />
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0a171b]/80 p-4">
              <p className="text-xs uppercase tracking-[0.1em] text-[#8ca3a9]">Hours saved</p>
              <p className="mt-2 text-2xl font-semibold text-[#e7fbf8]">
                <NumberTicker value={86} className="text-[#e7fbf8]" />/mo
              </p>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 md:py-28">
          <SpotlightHeading
            title="Software that knows who you are."
            description="Most tools don&apos;t talk to each other. Your CRM doesn&apos;t know about your calendar. Your email doesn&apos;t know about your pipeline. You glue them together and pray nothing breaks. SeldonFrame is different: every block reads from one soul, and when your soul updates, everything updates."
          />

          <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="space-y-4">
              {[
                { name: "CRM", pulse: "animate-pulse" },
                { name: "Booking", pulse: "animate-pulse" },
                { name: "Forms", pulse: "animate-pulse" },
              ].map((item) => (
                <div key={item.name} className="rounded-xl border border-white/10 bg-[#09161a] px-4 py-3 text-sm font-medium text-[#d3e9ea]">
                  {item.name}
                </div>
              ))}
            </div>

            <div className="relative mx-auto grid h-48 w-48 place-items-center rounded-full border border-[#2dd6cf]/40 bg-[#0a1f23] text-xl font-semibold text-[#cbfaf6]">
              <span>SOUL</span>
              <span className="absolute -left-12 top-1/2 h-px w-12 -translate-y-1/2 bg-linear-to-r from-[#2dd6cf]/70 to-transparent" />
              <span className="absolute -right-12 top-1/2 h-px w-12 -translate-y-1/2 bg-linear-to-l from-[#2dd6cf]/70 to-transparent" />
              <span className="absolute left-1/2 -top-12 h-12 w-px -translate-x-1/2 bg-linear-to-t from-[#2dd6cf]/70 to-transparent" />
              <span className="absolute left-1/2 -bottom-12 h-12 w-px -translate-x-1/2 bg-linear-to-b from-[#2dd6cf]/70 to-transparent" />
            </div>

            <div className="space-y-4">
              {["Email", "Pages", "Automations"].map((name) => (
                <div key={name} className="rounded-xl border border-white/10 bg-[#09161a] px-4 py-3 text-sm font-medium text-[#d3e9ea]">
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 md:py-28">
          <SpotlightHeading title="How it works" description="From framework to flywheel in four focused steps." />

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "Pick a framework",
                description: "Coaching, Agency, SaaS, or custom. Pre-built with what you need.",
                Icon: LayoutGrid,
              },
              {
                title: "Make it yours",
                description: "Tell Seldon to customize any block for your edge case in seconds.",
                Icon: Sparkles,
              },
              {
                title: "Connect your tools",
                description: "Stripe, Kit, Google Calendar, or use built-in integrations.",
                Icon: Link2,
              },
              {
                title: "Runs itself",
                description: "Follow-ups, reminders, and nurture automations run from your soul.",
                Icon: Zap,
              },
            ].map(({ title, description, Icon }, index) => (
              <article
                key={title}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#081519] p-6 transition-colors hover:border-[#2ad7cf]/40"
              >
                {index === 0 ? (
                  <BorderBeam size={90} duration={7} colorFrom="#18b9b1" colorTo="#77fff5" borderWidth={1.5} />
                ) : null}
                <Icon className="h-6 w-6 text-[#6de7e0]" />
                <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#98b0b6]">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-20 md:py-28">
          <SpotlightHeading title="Replace 6 tools with one." description="Everything connected. Everything customizable. If it doesn&apos;t exist, Seldon it." />

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#081519] p-6">
              <p className="text-xs uppercase tracking-[0.1em] text-[#8aa2a8]">Before</p>
              <div className="mt-4 space-y-3">
                {[
                  ["Calendly", "$15/mo"],
                  ["Mailchimp", "$20/mo"],
                  ["HubSpot", "$50/mo"],
                  ["Typeform", "$29/mo"],
                  ["Carrd", "$19/mo"],
                  ["Zapier", "$20/mo"],
                ].map(([tool, price]) => (
                  <div key={tool} className="rounded-xl border border-dashed border-white/20 px-4 py-3">
                    <div className="flex items-center justify-between text-sm text-[#d3e8ea]">
                      <span>{tool}</span>
                      <span>{price}</span>
                    </div>
                  </div>
                ))}
                <p className="pt-2 text-sm font-medium text-[#c2d7da]">Total: $153/mo</p>
                <p className="text-sm text-[#8ea5ab]">Nothing talks to each other.</p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1bc7bf]/35 bg-[#071b1f] p-6">
              <p className="text-xs uppercase tracking-[0.1em] text-[#8aa2a8]">After</p>
              <div className="mt-6 flex items-center gap-4">
                <Image src="/logo.svg" alt="SeldonFrame" width={40} height={50} className="h-12 w-auto" />
                <div>
                  <p className="text-lg font-semibold text-[#d9fffb]">SeldonFrame</p>
                  <p className="text-sm text-[#86aeb3]">Free (self-host) or $49/mo (cloud)</p>
                </div>
              </div>
              <div className="mt-6 space-y-2 text-sm text-[#b8d5d8]">
                <p>Everything connected.</p>
                <p>Everything customizable.</p>
                <p>If it doesn&apos;t exist, Seldon it.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 md:py-28">
          <SpotlightHeading
            title="Built for people who build for others."
            description="SeldonFrame Pro gives you one dashboard for multiple client businesses. Each with its own soul, blocks, domain, and automations."
          />

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            <div className="rounded-2xl border border-white/10 bg-[#081519] p-6">
              <p className="text-sm text-[#d2e9eb]">
                <span className="mr-3 rounded-lg border border-[#2ad7cf]/45 px-3 py-1 text-xs font-semibold text-[#79f2ea]">YOU (Pro)</span>
                → Client 1: Sarah&apos;s Coaching
              </p>
              <p className="mt-2 text-sm text-[#d2e9eb]">→ Client 2: BrightPath Agency</p>
              <p className="mt-2 text-sm text-[#d2e9eb]">→ Client 3: ClearDrain Plumbing</p>
            </div>

            <ul className="rounded-2xl border border-white/10 bg-[#081519] p-6 text-sm text-[#c1dde0]">
              {[
                "Unlimited Seldon It (AI built in, no API key)",
                "AI Framework Generator (describe a niche → deploy)",
                "Custom domains per client",
                "White-label branding",
                "Your first client pays for the subscription",
              ].map((item) => (
                <li key={item} className="mb-2 flex items-start gap-2 last:mb-0">
                  <Check className="mt-0.5 h-4 w-4 text-[#5fe8e0]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <Link href="#pricing" className="mt-6 inline-flex text-sm font-semibold text-[#74eee6] hover:text-[#9df8f2]">
            See Pro Plans →
          </Link>
        </section>

        <section className="py-20 md:py-28">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#071216] p-8 md:p-10">
            <BackgroundBeams />
            <h2 className="relative text-3xl font-bold tracking-tight">If it doesn&apos;t exist, Seldon it.</h2>
            <p className="relative mt-3 max-w-3xl text-base leading-relaxed text-[#95b0b6]">
              Built in 12 seconds. Connected to your soul.
            </p>

            <div className="relative mt-6">
              <SeldonItDemo />
            </div>

            <Link href="/signup" className="relative mt-6 inline-flex text-sm font-semibold text-[#7ff1ea] hover:text-[#affbf6]">
              Try Seldon It — Free →
            </Link>
          </div>
        </section>

        <LandingPricingSection />

        <section className="py-20 md:py-28">
          <SpotlightHeading
            title="Open source. MIT licensed. Forever."
            description="SeldonFrame is fully open source. Self-host for free. Inspect every line. Contribute frameworks. Build blocks. No vendor lock-in. Your data is yours."
          />

          <div className="mt-8 rounded-2xl border border-white/10 bg-[#081519] p-6">
            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href="https://github.com/seldonframe/crm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[#daf7f4] hover:border-[#31d8d0]/60"
              >
                <Star className="h-4 w-4" /> Star on GitHub
              </Link>
              <Link
                href="https://github.com/seldonframe/crm/fork"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[#daf7f4] hover:border-[#31d8d0]/60"
              >
                <GitFork className="h-4 w-4" /> Fork
              </Link>
              <Link
                href="https://github.com/seldonframe/crm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[#daf7f4] hover:border-[#31d8d0]/60"
              >
                <BookOpen className="h-4 w-4" /> Documentation
              </Link>
            </div>

            <p className="mt-6 text-sm text-[#8ca7ad]">github.com/seldonframe/crm</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-[#051014] py-12">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 md:grid-cols-4">
          <div>
            <p className="text-base font-semibold">SeldonFrame</p>
            <p className="mt-2 text-sm text-[#8ea8ad]">The operating system for your business.</p>
          </div>

          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-[#8ea8ad]">
              <li>
                <a href="#features" className="hover:text-foreground">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <Link href="/soul-marketplace" className="hover:text-foreground">Marketplace</Link>
              </li>
              <li>
                <Link href="https://github.com/seldonframe/crm" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Docs</Link>
              </li>
              <li>
                <span>Changelog</span>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold">Community</p>
            <ul className="mt-3 space-y-2 text-sm text-[#8ea8ad]">
              <li>
                <Link href="https://github.com/seldonframe/crm" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</Link>
              </li>
              <li>
                <span>Discord</span>
              </li>
              <li>
                <span>Twitter/X</span>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold">Company & Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-[#8ea8ad]">
              <li>About</li>
              <li>Blog</li>
              <li>Contact</li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              </li>
              <li>Contact</li>
              <li>
                <Link href="/terms" className="hover:text-foreground">Terms</Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-8 w-full max-w-6xl border-t border-white/10 px-6 pt-4 text-xs text-[#7f989e]">
          © 2026 SeldonFrame. Open source under MIT.
        </div>
      </footer>
    </div>
  );
}
