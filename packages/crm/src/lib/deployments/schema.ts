// ICP-3 — the Deploy-to-client action's input allow-list (a plain module).
//
// Lives OUTSIDE actions.ts (NOT "use server") so it can be imported by both
// actions.ts (which validates the stepper's submit) AND any test. A "use server"
// file may export only async functions, so this zod object cannot live in
// actions.ts (next build + scripts/check-use-server.sh both reject it) — same
// split agent-templates/schema.ts uses.
//
// .strict(): only the fields the deploy stepper legitimately sends. Provisioning
// and billing fields (phoneNumber, stripe*, calendarRef) are intentionally NOT
// accepted here — they're set by LATER, GATED steps, never by this flow.

import { z } from "zod";

const ClientContactSchema = z
  .object({
    phone: z.string().max(40).optional(),
    email: z.string().email().max(200).optional().or(z.literal("")),
    address: z.string().max(300).optional(),
  })
  .strict();

// ─── ClientContextSchema ─────────────────────────────────────────────────────
// The CLIENT's captured business context (narrow soul + FAQ) the deploy wizard
// assembles (optionally auto-filled by generateClientContextAction) and threads
// into createDeploymentAction. Mirrors DeploymentClientContext in
// db/schema/deployments.ts. .strict() at each level so only the persona-relevant
// fields are persisted — never the full SoulV4. Bounded lengths/counts so a
// hand-edited payload can't bloat the row.

const ClientServiceSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(400).optional(),
  })
  .strict();

const ClientSoulSchema = z
  .object({
    businessName: z.string().max(200).optional(),
    businessDescription: z.string().max(2000).optional(),
    services: z.array(ClientServiceSchema).max(50).optional(),
    business_hours: z.record(z.string(), z.unknown()).optional(),
    voice: z.object({ style: z.string().max(200).optional() }).strict().optional(),
  })
  .strict();

const ClientFaqEntrySchema = z
  .object({
    q: z.string().min(1).max(400),
    a: z.string().min(1).max(2000),
  })
  .strict();

export const ClientContextSchema = z
  .object({
    soul: ClientSoulSchema.optional(),
    faq: z.array(ClientFaqEntrySchema).max(50).optional(),
  })
  .strict();

export type ClientContextInput = z.infer<typeof ClientContextSchema>;

export const CreateDeploymentSchema = z
  .object({
    agentTemplateId: z.string().uuid(),
    clientName: z.string().min(2).max(200),
    clientContact: ClientContactSchema.optional(),
    // The CLIENT's captured business context (narrow soul + FAQ). Optional —
    // absent → today's name-only behavior on the voice path.
    clientContext: ClientContextSchema.optional(),
    // 'phone' | 'embed' | 'link' | 'sms' | 'email' — defaults to phone in the
    // store if omitted. sms/email are text-only deployments routed through the
    // multi-surface agent loop (the store + DB `surface` text column already
    // accept them via isDeploymentSurface); this widens the action allow-list so
    // a builder can deploy a text agent from the Studio.
    surface: z.enum(["phone", "embed", "link", "sms", "email"]).optional(),
    // What the SMB pays per month, in cents. Non-negative; capped at a sane
    // ceiling ($100k/mo) to reject obviously-bogus input.
    priceCents: z.number().int().min(0).max(10_000_000).optional(),
    // How the DEPLOYED agent books (ICP-3). Defaults to native. api_mcp/cal_com
    // are "coming soon" — accepted (so the row records the operator's intent) but
    // they behave as a capture-the-lead handoff until their adapters ship.
    bookingMode: z
      .enum(["native", "external_link", "api_mcp", "cal_com"])
      .default("native"),
    // The client's own booking page URL — required only for external_link (the
    // refinement below enforces that). Bounded so a row can't bloat.
    externalBookingUrl: z.string().url().max(2000).optional().nullable(),
    // ATTACH-TO-EXISTING-CLIENT (F3). When present, the new deployment attaches
    // to this EXISTING client workspace (org) instead of creating a fresh client
    // — fixing the duplicate-client bug (a 2nd agent no longer spawns a 2nd
    // "Acme Plumbing"). The action proves the id belongs to the builder's agency
    // (intersected against listClientOrgsForAgency) before it reaches the store.
    // Absent → "new client" (today's default). A UUID or absent — never "".
    existingClientOrgId: z.string().uuid().optional().nullable(),
    // R2 — the CLIENT's Google review link, captured at deploy time for a
    // review-requester agent and persisted onto the new deployment's
    // `customization.reviewUrl`. ONLY this persona field is accepted by the deploy
    // flow (greeting/voice/business-info are edited later on the client card via
    // setDeploymentCustomizationAction). Bounded like externalBookingUrl; not
    // .url() — operators paste GBP share links of varying shapes (the runtime only
    // trims). Absent/blank → no customization is written (→ the template default).
    reviewUrl: z.string().max(2000).optional(),
  })
  .strict()
  // external_link is only useful with a real URL to hand off; demand one. Other
  // modes ignore the URL (the store drops it). Attaching the error to the URL
  // field surfaces it inline in the wizard.
  .refine(
    (v) =>
      v.bookingMode !== "external_link" ||
      (typeof v.externalBookingUrl === "string" &&
        v.externalBookingUrl.trim().length > 0),
    {
      message: "Add the client's booking link to use 'their own booking link'.",
      path: ["externalBookingUrl"],
    },
  );

export type CreateDeploymentInputSchema = z.infer<typeof CreateDeploymentSchema>;

// ─── ActivateDeploymentSchema / PauseDeploymentSchema ────────────────────────
// Used by activateDeploymentAction and pauseDeploymentAction (actions.ts).
// Lives here (not in actions.ts) because "use server" files may only export
// async functions — same split as CreateDeploymentSchema above.

/** Validates the activate payload: a deployment id + an E.164 phone number. */
export const ActivateDeploymentSchema = z
  .object({
    deploymentId: z.string().uuid(),
    // E.164: '+' + 8–15 digits with non-zero leading digit.
    // Fine-grained isE164() check in the action catches edge cases.
    phoneNumber: z.string().min(8).max(20),
  })
  .strict();

export type ActivateDeploymentInput = z.infer<typeof ActivateDeploymentSchema>;

/** Validates the pause payload: just the deployment id. */
export const PauseDeploymentSchema = z
  .object({
    deploymentId: z.string().uuid(),
  })
  .strict();

export type PauseDeploymentInput = z.infer<typeof PauseDeploymentSchema>;

// ─── ProvisionDeploymentNumberSchema / CancelDeploymentSchema ─────────────────
// Used by provisionDeploymentNumberAction + cancelDeploymentAction (actions.ts).
// Same "use server" split rationale as the schemas above.

/** Validates the provision payload: a deployment id + a 3-digit NANP area code.
 *  Fine-grained isAreaCode() check in the action catches the 2–9 leading-digit
 *  rule; this just enforces the 3-digit shape. */
export const ProvisionDeploymentNumberSchema = z
  .object({
    deploymentId: z.string().uuid(),
    areaCode: z.string().regex(/^\d{3}$/, "area code must be 3 digits"),
  })
  .strict();

export type ProvisionDeploymentNumberInput = z.infer<
  typeof ProvisionDeploymentNumberSchema
>;

/** Validates the cancel payload: just the deployment id. */
export const CancelDeploymentSchema = z
  .object({
    deploymentId: z.string().uuid(),
  })
  .strict();

export type CancelDeploymentInput = z.infer<typeof CancelDeploymentSchema>;

// ─── SetBookingPolicySchema ──────────────────────────────────────────────────
// Used by setBookingPolicyAction (actions.ts). Validates the deployment id and
// the sparse per-client BookingPolicy override the agency edits on the client
// card. Every policy field is OPTIONAL (a Partial) and bounded; the booking
// engine (resolveBookingPolicy) re-clamps any out-of-range stored value at read
// time, so this layer only needs to keep the row from bloating / holding junk
// types. `null` clears the override (→ template/system defaults).
//
// Accepts BOTH the new per-day `hours` map AND the legacy uniform-window fields
// (`weekdays`/`startTime`/`endTime`) — the editor now writes `hours`, but stored
// rows + the resolver's backward-compat path still speak legacy, so both are
// allowed through and resolveBookingPolicy normalizes them.

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** One open day's window. The resolver re-checks end>start, so the schema only
 *  enforces the "HH:MM" shape (keeps this a loose allow-list, not the guard). */
const DayWindowSchema = z
  .object({
    start: z.string().regex(HHMM_RE),
    end: z.string().regex(HHMM_RE),
  })
  .strict();

const BookingPolicySchema = z
  .object({
    durationMinutes: z.number().int().min(1).max(1440).optional(),
    bufferMinutes: z.number().int().min(0).max(1440).optional(),
    maxPerDay: z.number().int().min(1).max(1000).nullable().optional(),
    leadTimeHours: z.number().min(0).max(8760).optional(),
    timezone: z.string().max(64).optional(),
    // Per-day windows keyed by weekday "0".."6" (JSON object keys are strings).
    hours: z.record(z.string().regex(/^[0-6]$/), DayWindowSchema).optional(),
    // Legacy uniform-window fields — still accepted for backward-compat.
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    startTime: z.string().regex(HHMM_RE).optional(),
    endTime: z.string().regex(HHMM_RE).optional(),
    requiredFields: z.array(z.string().min(1).max(60)).max(20).optional(),
  })
  .strict();

export const SetBookingPolicySchema = z
  .object({
    deploymentId: z.string().uuid(),
    policy: BookingPolicySchema.nullable(),
  })
  .strict();

export type SetBookingPolicyInput = z.infer<typeof SetBookingPolicySchema>;

// ─── SetDeploymentCustomizationSchema ────────────────────────────────────────
// Used by setDeploymentCustomizationAction (actions.ts). Validates the deployment
// id and the sparse per-client agent-persona override the agency edits on the
// client card: a greeting full-override, a TTS voice id, and the business-info
// facts that fill the template's `{placeholders}`. Every field is OPTIONAL (a
// Partial) and bounded so the row can't bloat / hold junk types; the persona
// resolver (resolveDeploymentPersona) tolerates any blank/absent field at read
// time. `null` clears the override (→ the template's defaults). Same "use server"
// split rationale as the schemas above (this zod object can't live in actions.ts).

const BusinessInfoSchema = z
  .object({
    name: z.string().max(200).optional(),
    hours: z.string().max(400).optional(),
    address: z.string().max(300).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(200).optional(),
  })
  .strict();

const DeploymentCustomizationSchema = z
  .object({
    greeting: z.string().max(2000).optional(),
    voiceId: z.string().max(60).optional(),
    businessInfo: BusinessInfoSchema.optional(),
    // The client's own Google review URL (review-requester agents). Nullable so a
    // caller can CLEAR just this field (→ fall back to the template's link) without
    // dropping the rest of the customization; absent leaves it untouched. Bounded
    // like externalBookingUrl so a row can't bloat. Not .url() — operators paste
    // GBP share links of varying shapes; the resolver only trims, never parses.
    reviewUrl: z.string().max(2000).nullable().optional(),
  })
  .strict();

export const SetDeploymentCustomizationSchema = z
  .object({
    deploymentId: z.string().uuid(),
    customization: DeploymentCustomizationSchema.nullable(),
  })
  .strict();

export type SetDeploymentCustomizationInput = z.infer<
  typeof SetDeploymentCustomizationSchema
>;
