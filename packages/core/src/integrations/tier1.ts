import { claudeAdapter } from "./ai/claude";
import { googleCalendarAdapter } from "./calendar/google";
import { microsoftGraphAdapter } from "./calendar/microsoft";
import { postmarkAdapter } from "./email/postmark";
import { resendAdapter } from "./email/resend";
import { sendGridAdapter } from "./email/sendgrid";
import { stripeAdapter } from "./stripe";
import type { AdapterDescriptor } from "./types";

export const tier1Adapters: AdapterDescriptor[] = [
  { id: "stripe", tier: "tier1", adapter: stripeAdapter },
  { id: "resend", tier: "tier1", adapter: resendAdapter },
  { id: "sendgrid", tier: "tier1", adapter: sendGridAdapter },
  { id: "postmark", tier: "tier1", adapter: postmarkAdapter },
  { id: "google-calendar", tier: "tier1", adapter: googleCalendarAdapter },
  { id: "microsoft-graph", tier: "tier1", adapter: microsoftGraphAdapter },
  { id: "claude", tier: "tier1", adapter: claudeAdapter },
];
