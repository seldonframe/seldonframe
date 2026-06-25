import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { agentTemplates } from "./agent-templates";
import type { BookingMode } from "@/lib/deployments/booking-providers";

// ─── deployments ──────────────────────────────────────────────────────────

export type DeploymentStatus = "draft" | "active" | "paused" | "canceled";
/** How a deployment is reached. `phone` (voice + SMS on the provisioned
 *  number), `embed` (web chat), `link` (hosted page); `sms` + `email` are the
 *  text surfaces routed through the multi-surface agent loop. A `phone`
 *  deployment already answers SMS too (the provisioned number's SMS webhook
 *  points at SeldonFrame), so `sms` here marks a text-only deployment. */
export type DeploymentSurface = "phone" | "embed" | "link" | "sms" | "email";

/** How a DEPLOYED agent books — re-exported from the pure registry so
 *  downstream imports (tools ctx, zod enum) have one stable source. Distinct
 *  from the conferencing `BookingProvider` in bookings/providers.ts. */
export type { BookingMode } from "@/lib/deployments/booking-providers";

export type DeploymentClientContact = {
  phone?: string;
  email?: string;
  address?: string;
};

export type DeploymentCalendarRef = {
  provider?: string;
  accountId?: string;
  calendarId?: string;
  /** The org holding the Composio API KEY this connection was made under — the
   *  AGENCY (deployment.builderOrgId). The runtime resolves the key from here so
   *  the deployed agent can re-open the session. Additive to the jsonb $type. */
  ownerOrgId?: string;
  /** The Composio ENTITY (user_id) the connected account lives under — the
   *  deployment id, so each client's calendar is isolated under one agency key. */
  entityUserId?: string;
};

/** A single service the CLIENT offers — name + optional one-line description.
 *  Mirrors the `{ name, description? }` shape composeVoicePersona reads from
 *  soul.services so the deployed agent can list the client's services. */
export type DeploymentClientService = {
  name: string;
  description?: string;
};

/** The CLIENT's business soul, captured at deploy time. A deliberately NARROW
 *  subset of the builder's SoulV4 — only the fields composeVoicePersona reads to
 *  make the voice agent speak AS the client. NO landing/pricing/intake config:
 *  this exists purely so the receptionist names the client, describes them, and
 *  lists their services. Every field is optional (blank capture → name-only). */
export type DeploymentClientSoul = {
  businessName?: string;
  businessDescription?: string;
  services?: DeploymentClientService[];
  /** Client business hours, snake_case to match the persona's business-facts
   *  reads. Free-form Record so we don't over-constrain the capture. */
  business_hours?: Record<string, unknown>;
  /** Voice/tone hint, e.g. { style: "warm, concise" }. */
  voice?: { style?: string };
};

/** Everything captured about the CLIENT's business at deploy time so the
 *  deployed agent speaks as them: a narrow soul + the client's own FAQ (which
 *  overrides the template blueprint's FAQ on the voice path). Persisted as the
 *  nullable `client_context` jsonb column; absent → today's name-only behavior. */
export type DeploymentClientContext = {
  soul?: DeploymentClientSoul;
  faq?: { q: string; a: string }[];
};

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").default(sql`gen_random_uuid()`).primaryKey(),
    builderOrgId: uuid("builder_org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentTemplateId: uuid("agent_template_id")
      .notNull()
      .references(() => agentTemplates.id, { onDelete: "restrict" }),
    clientName: text("client_name").notNull(),
    clientContact: jsonb("client_contact").$type<DeploymentClientContact>(),
    /** 'phone' | 'embed' | 'link' */
    surface: text("surface").notNull().default("phone"),
    /** E.164 phone number (nullable). */
    phoneNumber: text("phone_number"),
    /** Twilio PN… SID for the provisioned number. Required to attach the
     *  number to an Elastic SIP Trunk and to release it on cancellation. */
    phoneNumberSid: text("phone_number_sid"),
    /** How the phone number was acquired: 'provisioned' = SeldonFrame bought
     *  it in the builder's Twilio account (release on cancel); 'byo' = the
     *  builder brought their own number (never release). */
    numberOrigin: text("number_origin"),
    calendarRef: jsonb("calendar_ref").$type<DeploymentCalendarRef>(),
    /** How a DEPLOYED agent books (native | external_link | api_mcp | cal_com).
     *  Per-deployment menu; defaults to 'native' (the current booking chain).
     *  Distinct from the conferencing `bookings.provider`. */
    bookingMode: text("booking_mode").$type<BookingMode>().notNull().default("native"),
    /** The client's OWN booking page URL — only meaningful when
     *  bookingMode === 'external_link'; the deployed agent hands this off. */
    externalBookingUrl: text("external_booking_url"),
    /** Per-client booking rules (slot length / hours / buffer / lead time /
     *  required fields). Sparse override merged over the template default by
     *  resolveBookingPolicy; nullable — absent → template/system defaults. */
    bookingPolicy: jsonb("booking_policy").$type<Partial<import("@/lib/agents/booking/booking-policy").BookingPolicy>>(),
    /** Per-client persona overrides (greeting / TTS voice / business facts).
     *  Sparse override applied by resolveDeploymentPersona; nullable — absent →
     *  the template defaults (with placeholders filled from clientName). */
    customization: jsonb("customization").$type<Partial<import("@/lib/agents/persona/deployment-customization").DeploymentCustomization>>(),
    /** The CLIENT's business context (narrow soul + FAQ), captured at deploy
     *  time so the deployed agent speaks AS the client. Nullable — absent →
     *  the agent falls back to naming the client only (clientName). */
    clientContext: jsonb("client_context").$type<DeploymentClientContext>(),
    /** Monthly amount the SMB client pays the builder (in cents). */
    priceCents: integer("price_cents").notNull().default(0),
    stripeSubscriptionId: text("stripe_subscription_id"),
    stripeCustomerId: text("stripe_customer_id"),
    /** The auto-provisioned, agency-branded CLIENT workspace (org) this
     *  deployment owns — the full front office the deployed agent writes into
     *  (bookings/contacts/messages/transcripts retarget here). Set at
     *  activation by provisionClientWorkspaceForDeployment (idempotent +
     *  soft-fail); NULL for legacy deployments + before provisioning succeeds,
     *  in which case the agent falls back to writing the builder org. */
    clientOrgId: uuid("client_org_id").references(() => organizations.id),
    /** When the agency opted this client into portal access (magic-link sent).
     *  NULL = never invited. Re-invite updates the timestamp. */
    portalInvitedAt: timestamp("portal_invited_at", { withTimezone: true }),
    /** 'draft' | 'active' | 'paused' | 'canceled' */
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("deployments_builder_status_idx").on(table.builderOrgId, table.status),
    uniqueIndex("deployments_phone_number_uniq")
      .on(table.phoneNumber)
      .where(sql`${table.phoneNumber} IS NOT NULL`),
  ],
);

export type Deployment = typeof deployments.$inferSelect;
export type NewDeployment = typeof deployments.$inferInsert;
