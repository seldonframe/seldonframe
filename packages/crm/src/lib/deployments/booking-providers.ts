// packages/crm/src/lib/deployments/booking-providers.ts
//
// The calendar-backend a DEPLOYED agent books through. Distinct from the
// conferencing `BookingProvider` in src/lib/bookings/providers.ts.
//
// native        — book directly into SeldonFrame's own booking (current chain).
// external_link — the client already has a booking page; the agent hands off
//                 its URL and captures the lead (no slot lookup, no DB write).
// api_mcp       — (coming soon) book via the client's own booking API/MCP.
// cal_com       — (coming soon) managed Cal.com per-client calendar.

export type BookingMode = "native" | "external_link" | "api_mcp" | "cal_com";

/** How the deployed agent's tools behave for this mode. */
export type AgentBookingBehavior =
  | "book_native" // run the existing availability + booking chain
  | "handoff_link" // share externalBookingUrl + capture the lead
  | "handoff_followup"; // capture the lead; scheduling follows out of band

export type BookingProviderInfo = {
  id: BookingMode;
  label: string;
  description: string;
  status: "available" | "coming_soon";
  agentBehavior: AgentBookingBehavior;
  /** UI: this mode needs the operator to supply a booking URL. */
  requiresUrl: boolean;
};

export const BOOKING_PROVIDERS: readonly BookingProviderInfo[] = [
  {
    id: "native",
    label: "SeldonFrame booking",
    description:
      "Zero setup. The agent checks availability and books straight into this workspace's calendar.",
    status: "available",
    agentBehavior: "book_native",
    requiresUrl: false,
  },
  {
    id: "external_link",
    label: "Their own booking link",
    description:
      "The client already has a booking page (Calendly, Cal.com, Acuity…). The agent captures the caller and shares their link.",
    status: "available",
    agentBehavior: "handoff_link",
    requiresUrl: true,
  },
  {
    id: "api_mcp",
    label: "Connect via API / MCP",
    description:
      "Bind the agent to the client's own calendar or booking tool over API/MCP. Coming with the connector directory.",
    status: "coming_soon",
    agentBehavior: "handoff_followup",
    requiresUrl: false,
  },
  {
    id: "cal_com",
    label: "Cal.com (managed)",
    description:
      "Real Google/Outlook/Apple sync via Cal.com Platform. Per-booking pricing applies. Coming soon.",
    status: "coming_soon",
    agentBehavior: "handoff_followup",
    requiresUrl: false,
  },
] as const;

const BY_ID = new Map<BookingMode, BookingProviderInfo>(
  BOOKING_PROVIDERS.map((p) => [p.id, p]),
);

export function getBookingProvider(id: BookingMode): BookingProviderInfo {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`unknown booking mode: ${id}`);
  return found;
}

/** Coerce any stored value to a known mode, defaulting to native. */
export function resolveBookingMode(value: string | null | undefined): BookingMode {
  if (value && BY_ID.has(value as BookingMode)) return value as BookingMode;
  return "native";
}
