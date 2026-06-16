// packages/crm/src/app/start/_components/value-panel.tsx
// Fixed left panel shown on both Step 1 and Step 2 of the /start checkout.
// Shows what the prospect is getting and the current pricing config.
// Colors: dark-green bg (#1F2B24), parchment text (#F6F2EA), clay accent (#B26B49).
// Uses agency primary color when provided (agency-branded, not hardcoded).

import type { ServiceItem } from "../constants";

type ValuePanelProps = {
  agencyName: string;
  primaryColor?: string | null;
  /** Checked services to display. Defaults to all 7 when not provided. */
  selectedServices?: ServiceItem[];
  /** Monthly price in cents for display. Defaults to 39700 ($397) when not provided. */
  monthlyPriceCents?: number;
  /** One-time setup fee in cents (0 = not shown). */
  setupFeeCents?: number;
};

const DEFAULT_DELIVERABLES = [
  { id: "website",  label: "Website",                    detail: "Branded landing page on your domain"  },
  { id: "booking",  label: "Booking page",               detail: "Online appointments, any device"       },
  { id: "textback", label: "24/7 missed-call text-back", detail: "Never lose a lead again"               },
  { id: "chatbot",  label: "AI chatbot",                 detail: "Trained on your services & FAQs"       },
  { id: "reviews",  label: "Google review requester",    detail: "Auto-request after every job"          },
  { id: "intake",   label: "Intake form",                detail: "Capture lead details automatically"    },
  { id: "crm",      label: "CRM + deal pipeline",        detail: "Contacts, deals & follow-ups"         },
];

export function ValuePanel({
  agencyName,
  primaryColor,
  selectedServices,
  monthlyPriceCents = 39700,
  setupFeeCents = 0,
}: ValuePanelProps) {
  const accent = primaryColor ?? "#B26B49";

  const deliverables =
    selectedServices && selectedServices.length > 0
      ? selectedServices
      : DEFAULT_DELIVERABLES;

  const monthlyDollars = (monthlyPriceCents / 100).toFixed(0);

  return (
    <div
      className="flex flex-col justify-between px-8 py-10 text-[#F6F2EA] lg:min-h-screen"
      style={{ backgroundColor: "#1F2B24" }}
    >
      <div>
        <p className="text-sm font-semibold uppercase tracking-widest opacity-60 mb-2">
          {agencyName}
        </p>
        <h1 className="text-3xl font-bold leading-tight mb-2">
          Your business,<br />on autopilot.
        </h1>
        <p className="text-sm opacity-70 mb-8">
          Everything you need to run your front office — live in 60 seconds.
        </p>

        <ul className="space-y-4">
          {deliverables.map((item) => (
            <li key={item.id ?? item.label} className="flex items-start gap-3">
              <span
                className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                style={{ backgroundColor: accent }}
              >
                ✓
              </span>
              <div>
                <p className="font-semibold text-sm leading-tight">{item.label}</p>
                <p className="text-xs opacity-60 mt-0.5">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10 border-t border-white/10 pt-6 space-y-1">
        {setupFeeCents > 0 && (
          <p className="text-sm opacity-60">
            Setup fee:{" "}
            <span className="font-semibold text-[#F6F2EA]">
              ${(setupFeeCents / 100).toFixed(0)} one-time
            </span>
          </p>
        )}
        <p className="text-4xl font-extrabold">
          <span style={{ color: accent }}>${monthlyDollars}</span>
          <span className="text-lg font-medium opacity-70">/mo</span>
        </p>
        <p className="text-sm opacity-50">No contract · cancel anytime</p>
      </div>
    </div>
  );
}
