import type { Metadata } from "next";
import Link from "next/link";
import {
  Brain,
  Calendar,
  ClipboardList,
  CreditCard,
  Globe,
  LayoutGrid,
  Mail,
  Receipt,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

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

export default function PublicHomePage() {
  return (
    <div className="bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-8 w-8 grid-cols-2 gap-0.5 rounded-md bg-[#142E22] p-1.5">
              <span className="rounded-sm bg-[#E8E1D5]" />
              <span className="rounded-sm bg-[#8A9A8F]" />
              <span className="rounded-sm bg-[#F59E0B]" />
              <span className="rounded-sm bg-[#E8E1D5]" />
            </span>
            <span className="text-base font-semibold">SeldonFrame</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
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
            className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Get Started →
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6">
        <section className="py-20 md:py-28">
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
            The operating system
            <br />
            for your <span className="italic text-[#F59E0B]">business</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            One brain. Every block.
            <br />
            If it doesn&apos;t exist — Seldon it into existence.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-medium text-primary-foreground"
            >
              Get Started — Free
            </Link>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-full border border-border px-6 py-3 text-sm font-medium"
            >
              Star on GitHub ↗
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">Free forever. Self-host or Cloud.</p>
        </section>

        <section id="features" className="py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight">Software that adapts to you</h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
            SeldonFrame is a business operating system that configures itself from a conversation, then keeps every
            block aligned with your business identity.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <article className="rounded-2xl border border-border bg-card p-8">
              <Brain className="mb-4 h-10 w-10 text-primary" />
              <h3 className="mb-2 text-lg font-semibold">The Soul is the OS</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                One conversation defines your business identity — your name, your voice, your process, your goals.
                Every feature reads from it. Configure once. The system knows forever.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-8">
              <LayoutGrid className="mb-4 h-10 w-10 text-primary" />
              <h3 className="mb-2 text-lg font-semibold">Blocks are the Apps</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                CRM, booking, email, landing pages, payments — each is a modular block that self-configures because it
                reads your soul. Add blocks. Remove blocks. Nothing breaks.
              </p>
            </article>
            <article className="rounded-2xl border border-border bg-card p-8">
              <Sparkles className="mb-4 h-10 w-10 text-primary" />
              <h3 className="mb-2 text-lg font-semibold">Seldon It into Existence</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Need a feature that doesn&apos;t exist? Describe it in one sentence. AI builds it in 2 minutes —
                connected to your data, in your voice, from one sentence.
              </p>
            </article>
          </div>
        </section>

        <section className="py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight">From zero to running business in 90 seconds</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            {[
              {
                title: "Pick your Framework",
                description:
                  "Choose Coaching, Therapy, Fitness, Consulting — or start from scratch. Each Framework encodes years of niche-specific wisdom.",
              },
              {
                title: "Answer 5 questions",
                description:
                  "Your business name, what you call clients, your pipeline, your voice. The soul configures everything.",
              },
              {
                title: "Your business runs itself",
                description:
                  "CRM, booking, email, landing page, payments — all connected, all automated, all in your voice.",
              },
            ].map((step, index) => (
              <article key={step.title} className="rounded-2xl border border-border bg-card p-8">
                <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {index + 1}
                </div>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight">Everything you need. Nothing you don&apos;t.</h2>
          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: "CRM", Icon: Users },
              { label: "Booking", Icon: Calendar },
              { label: "Email", Icon: Mail },
              { label: "Landing Pages", Icon: Globe },
              { label: "Payments", Icon: CreditCard },
              { label: "Forms", Icon: ClipboardList },
              { label: "Invoicing", Icon: Receipt },
              { label: "Automations", Icon: Zap },
            ].map(({ label, Icon }) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="h-5 w-5 text-primary" />
                <p className="mt-3 text-sm font-medium">{label}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm italic text-muted-foreground">And if you need more — Seldon it.</p>
        </section>

        <section id="pricing" className="py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h2>
          <p className="mt-3 text-base text-muted-foreground">Free forever to self-host. Cloud starts at $49/month.</p>
          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <article className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-semibold">Self-Hosted</h3>
              <p className="mt-4 text-3xl font-bold">Free</p>
              <p className="mt-1 text-sm text-muted-foreground">Forever. No limits.</p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>All blocks included</li>
                <li>Unlimited contacts</li>
                <li>Full Seldon It (BYOK)</li>
                <li>Community support</li>
              </ul>
              <Link
                href="https://github.com/seldonframe/crm"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-medium"
              >
                Clone on GitHub →
              </Link>
            </article>

            <article className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-semibold">Cloud Starter</h3>
              <p className="mt-4 text-3xl font-bold">$49/month</p>
              <p className="mt-1 text-sm text-muted-foreground">Your business on autopilot.</p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>All blocks included</li>
                <li>500 contacts</li>
                <li>Custom domain</li>
                <li>Email support</li>
              </ul>
              <Link href="/signup" className="mt-8 inline-flex rounded-full border border-border px-5 py-2.5 text-sm font-medium">
                Get Started
              </Link>
            </article>

            <article className="rounded-2xl border-2 border-primary bg-card p-8 ring-1 ring-primary/20">
              <span className="inline-flex rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                Most Popular
              </span>
              <h3 className="mt-4 text-lg font-semibold">Cloud Pro</h3>
              <p className="mt-4 text-3xl font-bold">$99/month</p>
              <p className="mt-1 text-sm text-muted-foreground">Seldon it. Sell it. Earn from it.</p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>Everything in Starter</li>
                <li>Unlimited contacts</li>
                <li>Seldon It (10/month included)</li>
                <li>Marketplace access (buy + sell)</li>
                <li>30% affiliate commissions</li>
              </ul>
              <Link href="/signup" className="mt-8 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
                Get Started
              </Link>
            </article>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">All plans include 14-day free trial. Cancel anytime.</p>
        </section>

        <section className="py-20 md:py-28">
          <div className="rounded-2xl border border-border bg-card p-8 md:p-10">
            <h2 className="text-3xl font-bold tracking-tight">Open source. Open code.</h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
              SeldonFrame is open source under the Business Source License. Self-host forever. Contribute on GitHub.
              Your data, your control.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="https://github.com/seldonframe/crm"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
              >
                View on GitHub →
              </Link>
              <span className="rounded-full border border-border px-4 py-2 text-xs text-muted-foreground">GitHub Repository</span>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t bg-card/20 py-12">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-6 md:grid-cols-3">
          <div>
            <p className="text-base font-semibold">SeldonFrame</p>
            <p className="mt-2 text-sm text-muted-foreground">The operating system for your business.</p>
            <p className="mt-6 text-xs text-muted-foreground">&copy; 2026 SeldonFrame</p>
            <p className="mt-1 text-xs text-muted-foreground">Built by Max Thule</p>
          </div>

          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
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
                <Link href="https://github.com/seldonframe/crm" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  GitHub
                </Link>
              </li>
              <li>
                <Link href="https://github.com/seldonframe/crm" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                  Docs
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold">Legal</p>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-foreground">
                  Terms of Service
                </Link>
              </li>
              <li>Contact</li>
              <li>
                <a href="mailto:support@seldonframe.com" className="hover:text-foreground">
                  support@seldonframe.com
                </a>
              </li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
