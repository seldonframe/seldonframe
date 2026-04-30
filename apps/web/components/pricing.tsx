type PricingTier = {
  name: string;
  price: string;
  priceSuffix?: string;
  subtitle: string;
  cta: string;
  href: string;
  features: string[];
  popular?: boolean;
};

// April 30, 2026 — usage-based pricing migration. Tiers are Free /
// Growth / Scale + Self-host. The hosted tiers charge a flat base +
// metered overage; no per-workspace charge. The marketing copy mirrors
// the in-app /settings/billing page word-for-word so operators don't
// see two different stories.
const tiers: PricingTier[] = [
  {
    name: "Self-host",
    price: "Free",
    priceSuffix: "forever",
    subtitle: "MIT-licensed. Run on your own infra.",
    cta: "Get Started on GitHub →",
    href: "https://github.com/seldonframe/crm",
    features: [
      "All 6 blocks included",
      "All integrations",
      "Soul System + AI features",
      "Unlimited contacts, deals, bookings",
      "BYO Stripe / Resend / Twilio keys",
      "Community support · MIT licensed",
    ],
  },
  {
    name: "Free",
    price: "$0",
    priceSuffix: "free forever",
    subtitle: "Hosted. No setup. Upgrade when you grow.",
    cta: "Start for $0 →",
    href: "https://app.seldonframe.com/signup",
    features: [
      "1 workspace",
      "50 contacts",
      "100 agent runs / mo",
      "All core blocks (landing, booking, intake, CRM, pipeline, agents)",
      "BYO LLM keys",
      "Community support",
    ],
  },
  {
    name: "Growth",
    price: "$29/mo",
    priceSuffix: "+ usage",
    subtitle: "For operators with paying clients.",
    cta: "Upgrade to Growth →",
    href: "https://app.seldonframe.com/signup?plan=growth",
    popular: true,
    features: [
      "3 workspaces",
      "500 contacts included, then $0.02 / contact",
      "1,000 agent runs included, then $0.03 / run",
      "Custom domain",
      "Remove SeldonFrame branding",
      "Client portal · email support",
    ],
  },
  {
    name: "Scale",
    price: "$99/mo",
    priceSuffix: "+ usage",
    subtitle: "For agencies building for multiple clients.",
    cta: "Upgrade to Scale →",
    href: "https://app.seldonframe.com/signup?plan=scale",
    features: [
      "Unlimited workspaces",
      "Unlimited contacts",
      "Agent runs $0.02 each",
      "Full white-label",
      "Client portal with custom branding",
      "Brain Layer 2 · priority support",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="web-section">
      <div className="web-container">
        <p className="section-label text-center">Pricing</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">Start free. Scale when ready.</h2>
        <p className="mt-3 text-center text-[hsl(var(--color-text-secondary))]">
          Open source. Self-host for free. Hosted tiers scale with your usage — pay only for what you use.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
          {tiers.map((tier) => (
            <article
              key={tier.name}
              className={`glass-card relative rounded-2xl p-7 ${tier.popular ? "glow-teal scale-[1.02] border-primary/40" : ""}`}
              style={tier.popular ? { backgroundImage: "linear-gradient(to bottom, rgba(0,121,107,0.25), transparent 35%)" } : undefined}
            >
              {tier.popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary-foreground">
                  Recommended
                </span>
              ) : null}
              <p className="text-[18px] font-semibold">{tier.name}</p>
              <p className="mt-3 text-3xl font-bold tracking-[-0.02em]">
                {tier.price}
                {tier.priceSuffix ? (
                  <span className="ml-1 text-sm font-medium text-[hsl(var(--color-text-secondary))]">
                    {tier.priceSuffix}
                  </span>
                ) : null}
              </p>
              <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">{tier.subtitle}</p>
              <ul className="mt-6 space-y-3 text-sm text-[hsl(var(--color-text-secondary))]">
                {tier.features.map((feature) => (
                  <li key={feature}>• {feature}</li>
                ))}
              </ul>
              <a href={tier.href} className={`mt-8 inline-flex h-11 w-full items-center justify-center rounded-lg px-4 text-sm font-semibold transition ${tier.popular ? "bg-primary text-primary-foreground" : "border border-primary text-primary hover:bg-primary/10"}`}>
                {tier.cta}
              </a>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-[hsl(var(--color-text-secondary))]">
          Your first workspace is always free. Billed monthly · cancel anytime.
        </p>
      </div>
    </section>
  );
}
