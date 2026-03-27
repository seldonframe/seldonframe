import { CalendarCheck, CheckCircle2, CircleDollarSign, FormInput, LayoutTemplate, Link2, Mail, UserPlus } from "lucide-react";
import { Reveal } from "@/components/reveal";

const nodes = [
  { label: "Landing Page", icon: LayoutTemplate },
  { label: "Form Submitted", icon: FormInput },
  { label: "Contact Created", icon: UserPlus },
  { label: "Welcome Email Sent", icon: Mail },
  { label: "Booking Link", icon: Link2 },
  { label: "Payment Collected", icon: CircleDollarSign },
  { label: "Calendar Event", icon: CalendarCheck },
  { label: "Session Complete", icon: CheckCircle2 },
  { label: "Follow-up Email", icon: Mail },
  { label: "Portal Access", icon: Link2 },
] as const;

export function FullFlow() {
  return (
    <section className="web-section">
      <div className="web-container">
        <p className="section-label text-center">Full Flow</p>
        <h2 className="text-center text-[32px] font-semibold tracking-[-0.02em]">See how it all connects.</h2>

        <div className="mt-8 grid gap-3 md:grid-cols-5 lg:grid-cols-10">
          {nodes.map((node, index) => (
            <Reveal key={node.label} delayMs={index * 100}>
              <div className="relative">
                <article className="glass-card flex h-full min-h-[96px] flex-col items-center justify-center rounded-xl p-3 text-center">
                  <node.icon className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs font-medium leading-tight text-foreground">{node.label}</p>
                </article>
                {index < nodes.length - 1 ? <div className="flow-connector absolute -right-2 top-1/2 hidden w-4 lg:block" /> : null}
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-6 text-center text-[hsl(var(--color-text-secondary))]">
          Every step happens automatically. You set it up once. SeldonFrame runs it forever.
        </p>
      </div>
    </section>
  );
}
