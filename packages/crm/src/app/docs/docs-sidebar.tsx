"use client";

// v1.30.2 — Docs left sidebar (Linear-style).
//
// Categories collapse/expand. Bottom section has Docs / Developers /
// Learn / Contact links — distinct surfaces (Linear separates these
// for the same reason: developers want API ref + SDK; learners want
// video tutorials; everyone else wants product docs).
//
// v1.30.2 — every category item now resolves to a real article page
// at /docs/<category>/<slug> (no more anchor placeholders). Some
// articles are stubs that link to GitHub README / in-app surface;
// the routes still exist so nothing 404s.
//
// Category id matches the URL segment. Article slug is the segment
// after that. Active-state highlight uses startsWith so a deeper
// route still highlights its parent category.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ChevronRight,
  BookOpen,
  Code2,
  GraduationCap,
  MessageCircle,
} from "lucide-react";

type DocLink = { label: string; href: string };
type DocCategory = { id: string; label: string; items: DocLink[] };

const CATEGORIES: DocCategory[] = [
  {
    id: "getting-started",
    label: "Getting started",
    items: [
      { label: "What is SeldonFrame", href: "/docs/getting-started/what-is-seldonframe" },
      { label: "Build your first workspace", href: "/docs/getting-started/first-workspace" },
      { label: "Connect Claude Code", href: "/docs/getting-started/connect-claude-code" },
      { label: "The 3-minute demo", href: "/docs/getting-started/demo" },
    ],
  },
  {
    id: "your-business",
    label: "Your business",
    items: [
      { label: "Workspaces", href: "/docs/your-business/workspaces" },
      { label: "Custom domains", href: "/docs/your-business/custom-domains" },
      { label: "Branding & theme", href: "/docs/your-business/branding" },
      { label: "Team members", href: "/docs/your-business/team" },
    ],
  },
  {
    id: "customers",
    label: "Customers (CRM)",
    items: [
      { label: "Adding customers", href: "/docs/customers/contacts" },
      { label: "Pipeline & deals", href: "/docs/customers/deals" },
      { label: "Custom fields", href: "/docs/customers/custom-fields" },
      { label: "Customer Portal", href: "/docs/customers/customer-portal" },
    ],
  },
  {
    id: "agents",
    label: "AI Agents",
    items: [
      { label: "Build a chatbot", href: "/docs/agents/build-chatbot" },
      { label: "Eval gate (safety)", href: "/docs/agents/eval-gate" },
      { label: "Updating an agent", href: "/docs/agents/update-agent" },
      { label: "Embedding on your site", href: "/docs/agents/embed" },
      { label: "Voice + SMS (coming soon)", href: "/docs/agents/voice-sms" },
    ],
  },
  {
    id: "pages",
    label: "Pages & website",
    items: [
      { label: "Public pages", href: "/docs/pages/public-pages" },
      { label: "Forms & lead capture", href: "/docs/pages/forms" },
      { label: "Booking pages", href: "/docs/pages/booking" },
      { label: "Templates", href: "/docs/pages/templates" },
    ],
  },
  {
    id: "automation",
    label: "Email & Automation",
    items: [
      { label: "Send email", href: "/docs/automation/email" },
      { label: "Email templates", href: "/docs/automation/email-templates" },
      { label: "Automation rules", href: "/docs/automation/rules" },
      { label: "Post-booking reminders", href: "/docs/automation/reminders" },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      { label: "Anthropic / OpenAI", href: "/docs/integrations/llm" },
      { label: "Stripe (payments)", href: "/docs/integrations/stripe" },
      { label: "Twilio (SMS)", href: "/docs/integrations/twilio" },
      { label: "Resend (email)", href: "/docs/integrations/resend" },
      { label: "Google Calendar", href: "/docs/integrations/google-calendar" },
    ],
  },
  {
    id: "billing",
    label: "Billing & plans",
    items: [
      { label: "Pricing", href: "/docs/billing/pricing" },
      { label: "Plan tiers", href: "/docs/billing/tiers" },
      { label: "Invoices & receipts", href: "/docs/billing/invoices" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();

  // Open the category that matches the current route (so refreshing
  // on /docs/agents/build-chatbot keeps "AI Agents" expanded). Default
  // to Getting started + AI Agents for the index page.
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {
      "getting-started": true,
      "agents": true,
    };
    for (const cat of CATEGORIES) {
      if (pathname?.startsWith(`/docs/${cat.id}/`)) {
        initial[cat.id] = true;
      }
    }
    return initial;
  });

  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r bg-background/50 flex-col h-[calc(100vh-3.5rem)] sticky top-14">
      <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-0.5">
        {CATEGORIES.map((cat) => {
          const isOpen = open[cat.id] ?? false;
          return (
            <div key={cat.id}>
              <button
                type="button"
                onClick={() =>
                  setOpen((prev) => ({ ...prev, [cat.id]: !prev[cat.id] }))
                }
                className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                <span className="font-medium">{cat.label}</span>
                <ChevronRight
                  className={`size-3.5 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="mt-0.5 mb-2 ml-2 border-l border-border pl-2 space-y-px">
                  {cat.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`block px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                          active
                            ? "bg-accent text-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        }`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t px-3 py-4 space-y-px shrink-0">
        <FooterLink href="/docs" icon={<BookOpen className="size-4" />} label="Docs" active={pathname === "/docs"} />
        <FooterLink
          href="https://github.com/seldonframe/seldonframe"
          icon={<Code2 className="size-4" />}
          label="Developers"
          external
        />
        <FooterLink href="/docs/learn" icon={<GraduationCap className="size-4" />} label="Learn" active={pathname === "/docs/learn"} />
        <FooterLink
          href="https://discord.gg/sbVUu976NW"
          icon={<MessageCircle className="size-4" />}
          label="Contact support"
          external
        />
      </div>
    </aside>
  );
}

function FooterLink({
  href,
  icon,
  label,
  active,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  external?: boolean;
}) {
  const cls = `flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors ${
    active
      ? "bg-accent text-foreground font-medium"
      : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
  }`;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={cls}>
        {icon}
        <span>{label}</span>
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {icon}
      <span>{label}</span>
    </Link>
  );
}
