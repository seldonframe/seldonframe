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
