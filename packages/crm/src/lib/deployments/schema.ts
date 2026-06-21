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

export const CreateDeploymentSchema = z
  .object({
    agentTemplateId: z.string().uuid(),
    clientName: z.string().min(2).max(200),
    clientContact: ClientContactSchema.optional(),
    // 'phone' | 'embed' | 'link' — defaults to phone in the store if omitted.
    surface: z.enum(["phone", "embed", "link"]).optional(),
    // What the SMB pays per month, in cents. Non-negative; capped at a sane
    // ceiling ($100k/mo) to reject obviously-bogus input.
    priceCents: z.number().int().min(0).max(10_000_000).optional(),
  })
  .strict();

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
