import { Calendar, CreditCard, Layout, Mail, UserCircle, Users } from "lucide-react";
import { Reveal } from "@/components/reveal";

export function Blocks() {
  const items = [
    {
      icon: Users,
      title: "CRM",
      desc: "Track clients, deals, and your pipeline. AI scores leads and drafts follow-ups in your voice.",
    },
    {
      icon: Calendar,
      title: "Booking",
      desc: "Branded booking pages. Calendar sync. Stripe payments. Automated reminders via email and SMS.",
    },
    {
      icon: Layout,
      title: "Landing Pages",
      desc: "Build conversion-focused pages. A/B test. Capture leads that flow straight into your CRM.",
    },
    {
      icon: Mail,
      title: "Email",
      desc: "Sequences that trigger automatically. Welcome series, follow-ups, re-engagement — in your voice.",
    },
    {
      icon: CreditCard,
      title: "Payments",
      desc: "Stripe-powered. Accept payments on booking pages, landing pages, and invoices. Track revenue per client.",
    },
    {
      icon: UserCircle,
      title: "Client Portal",
      desc: "Your clients log in, see bookings, pay invoices, track progress, and message you. Branded as yours.",
    },
  ] as const;

  return (
    <section className="web-section">
      <div className="web-container">
        <p className="section-label text-center">Building Blocks</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">Everything you need. Nothing you don't.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Reveal key={item.title} delayMs={index * 80}>
              <article className="glass-card rounded-2xl p-6">
                <div className="mb-3 inline-flex rounded-lg border border-primary/30 p-2 text-primary">
                  <item.icon className="h-6 w-6" />
                </div>
                <p className="text-[18px] font-semibold">{item.title}</p>
                <p className="mt-2 text-sm text-[hsl(var(--color-text-secondary))]">{item.desc}</p>
              </article>
            </Reveal>
          ))}
        </div>

        <div className="glass-card mt-8 rounded-2xl border-primary/30 bg-primary/5 p-5">
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">
            Every block connects automatically. A lead on your landing page becomes a contact in your CRM, gets a welcome
            email, and receives a booking link — without you lifting a finger.
          </p>
        </div>
      </div>
    </section>
  );
}
