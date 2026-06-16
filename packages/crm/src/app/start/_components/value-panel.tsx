// packages/crm/src/app/start/_components/value-panel.tsx
// Fixed left panel shown on both Step 1 and Step 2 of the /start checkout.
// Shows what the prospect is getting for $397/mo.
// Colors: dark-green bg (#1F2B24), parchment text (#F6F2EA), clay accent (#B26B49).
// Uses agency primary color when provided (agency-branded, not hardcoded).

type ValuePanelProps = {
  agencyName: string;
  primaryColor?: string | null;
};

const DELIVERABLES = [
  { label: "Website", detail: "Branded landing page on your domain" },
  { label: "Booking page", detail: "Online appointments, any device" },
  { label: "24/7 missed-call text-back", detail: "Never lose a lead again" },
  { label: "AI chatbot", detail: "Trained on your services & FAQs" },
  { label: "Google review requester", detail: "Auto-request after every job" },
  { label: "Intake form", detail: "Capture lead details automatically" },
  { label: "CRM + deal pipeline", detail: "Contacts, deals & follow-ups" },
];

export function ValuePanel({ agencyName, primaryColor }: ValuePanelProps) {
  const accent = primaryColor ?? "#B26B49";

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
          {DELIVERABLES.map((item) => (
            <li key={item.label} className="flex items-start gap-3">
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

      <div className="mt-10 border-t border-white/10 pt-6">
        <p className="text-4xl font-extrabold">
          <span style={{ color: accent }}>$397</span>
          <span className="text-lg font-medium opacity-70">/mo</span>
        </p>
        <p className="text-sm opacity-50 mt-1">No contract · cancel anytime</p>
      </div>
    </div>
  );
}
