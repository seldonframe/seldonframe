type PricingTier = {
  name: string;
  price: string;
  subtitle: string;
  cta: string;
  href: string;
  features: string[];
  popular?: boolean;
};

const tiers: PricingTier[] = [
  {
    name: "Open Source",
    price: "Free forever",
    subtitle: "Self-hosted. Full control.",
    cta: "Get Started on GitHub →",
    href: "https://github.com/seldonframe/crm",
    features: [
      "All 6 blocks included",
      "All integrations",
      "Soul System + AI features",
      "Unlimited contacts, deals, bookings",
      "Community support",
      "MIT licensed",
    ],
  },
  {
    name: "Cloud",
    price: "$49/mo",
    subtitle: "Zero setup. Just works.",
    cta: "Join Cloud Waitlist →",
    href: "https://github.com/seldonframe/crm/discussions",
    popular: true,
    features: [
      "Everything in Open Source",
      "No hosting to manage",
      "AI features included (no API key needed)",
      "Custom domain",
      "Email support",
      "Automatic updates",
    ],
  },
  {
    name: "Pro",
    price: "$149/mo",
    subtitle: "For builders who serve clients.",
    cta: "Join Pro Waitlist →",
    href: "https://github.com/seldonframe/crm/discussions",
    features: [
      "Everything in Cloud",
      "Multi-client dashboard",
      "One-click client provisioning",
      "White-label",
      "Template library",
      "Revenue tracking",
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
          Open source is genuinely complete. Cloud and Pro add convenience, not features.
        </p>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {[tiers[1], tiers[0], tiers[2]].map((tier) => (
            <article
              key={tier.name}
              className={`glass-card relative rounded-2xl p-7 ${tier.popular ? "glow-teal scale-[1.02] border-primary/40" : ""}`}
              style={tier.popular ? { backgroundImage: "linear-gradient(to bottom, rgba(0,121,107,0.25), transparent 35%)" } : undefined}
            >
              {tier.popular ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Most popular
                </span>
              ) : null}
              <p className="text-[18px] font-semibold">{tier.name}</p>
              <p className="mt-3 text-3xl font-bold tracking-[-0.02em]">{tier.price}</p>
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
          All plans include Stripe payments, Google Calendar sync, and email delivery.
        </p>
      </div>
    </section>
  );
}
