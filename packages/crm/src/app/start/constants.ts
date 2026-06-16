// packages/crm/src/app/start/constants.ts
// Shared constants for the /start live-sell checkout.
// Kept in a separate (non-"use server") file so they can be imported
// on both server and client without Next.js rejecting the export.

/** $397/mo in cents */
export const LIVE_SELL_MONTHLY_PRICE_CENTS = 39700;

/** Seldon Studio's canonical agency org id */
export const SELDON_STUDIO_ORG_ID = "e1b16f47-d90a-4f3f-adb5-484b639ff0ed";

/** Default services shown in the live-sell checkout scope config. */
export type ServiceItem = {
  id: string;
  label: string;
  detail: string;
  /** Suggested monthly contribution (cents) — used for auto-suggest only. */
  suggestedCents: number;
};

export const DEFAULT_SERVICES: ServiceItem[] = [
  { id: "website",       label: "Website",                      detail: "Branded landing page on your domain",  suggestedCents: 8000  },
  { id: "booking",       label: "Booking page",                 detail: "Online appointments, any device",       suggestedCents: 4900  },
  { id: "textback",      label: "24/7 missed-call text-back",   detail: "Never lose a lead again",               suggestedCents: 9700  },
  { id: "chatbot",       label: "AI chatbot",                   detail: "Trained on your services & FAQs",       suggestedCents: 7900  },
  { id: "reviews",       label: "Google review requester",      detail: "Auto-request after every job",          suggestedCents: 4900  },
  { id: "intake",        label: "Intake form",                  detail: "Capture lead details automatically",    suggestedCents: 3700  },
  { id: "crm",           label: "CRM + deal pipeline",          detail: "Contacts, deals & follow-ups",          suggestedCents: 5700  },
];
