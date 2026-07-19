// Event-agent "Send test" — the server action.
//
// Lets an operator fire a REAL review-request / speed-to-lead message to their
// OWN number (or email) on demand, with NO booking/lead required. This is the
// "make the phone fire a review request via SMS" affordance: the operator types
// their number, hits "Send test", and the live outbound seam (sendSmsFromApi /
// sendEmailFromApi) actually delivers a "[TEST] "-prefixed message.
//
// It is a THIN wrapper. All the WORDS come from the tested pure helper
// (composeTestEventAgentMessage → composeReviewRequest / composeSpeedToLead), and
// all the I/O is the EXISTING outbound seam the live event-agent path uses. The
// action's own logic is just: auth-gate → resolve the agent's skill + the
// effective review link (deployment-wins, exactly like the runtime via
// resolveReviewUrl) → compose → send.
//
// DELIBERATE bypasses — this is an EXPLICIT operator action, not an automated
// fire, so it SKIPS the throttle (one-per-contact), the L3 guardrails (quiet
// hours / daily cap / frequency cap), and the L2 verify gate. The operator asked
// for this exact send to this exact number; the gates exist to protect customers
// from runaway automation, not to block a deliberate self-test. A review test
// with no review link set is NOT blocked either: the template is a marketplace
// product the builder is testing/publishing, and the Google review link is a
// per-buyer, deploy-time customization (each client sets their own when they
// deploy) — so the composer falls back to a clearly-fake placeholder link and
// the result carries `usedPlaceholder:true` for the UI to note, non-blocking.
//
// "use server" — ONLY async function exports here. Types live in the imported
// modules (run-event-agent.ts / test-message.ts); the skillForEventType +
// channel resolution helpers are module-private (not exported), so this file
// stays valid under scripts/check-use-server.sh.

"use server";

import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getAgentTemplate } from "@/lib/agent-templates/store";
import { sendSmsFromApi } from "@/lib/sms/api";
import { sendEmailFromApi } from "@/lib/emails/api";
import { loadDeploymentCustomizationForOrgTemplate } from "@/lib/deployments/store";
import { resolveReviewUrl } from "@/lib/agents/persona/deployment-customization";
import { resolveAgentTrigger } from "@/lib/agents/triggers/agent-trigger";
import { composeTestEventAgentMessage } from "@/lib/agents/triggers/test-message";
import type { EventAgentSkill } from "@/lib/agents/triggers/run-event-agent";

export type SendTestEventAgentInput = {
  /** The agent TEMPLATE to test. Ownership is checked against the caller's org. */
  agentTemplateId: string;
  /** Optional deployment (client) whose per-client review link should win. When
   *  omitted, the action falls back to the agency-org's most-relevant deployment
   *  for this template (loadDeploymentCustomizationForOrgTemplate), then the
   *  template's blueprint.reviewUrl default. */
  deploymentId?: string | null;
  /** The destination phone (channel=sms) — typically the operator's own number. */
  toPhone?: string | null;
  /** The destination email (channel=email). */
  toEmail?: string | null;
};

export type SendTestEventAgentResult =
  | { ok: true; to: string; preview: string; usedPlaceholder?: boolean }
  | { ok: false; error: string };

/** Minimal template shape the action needs (loaded + ownership-checked). */
type TestTemplate = {
  builderOrgId: string;
  type: string;
  blueprint: { trigger?: unknown; reviewUrl?: string } | null;
};

/** A sent-or-suppressed result from the injected outbound seam. */
type TestSendOutcome = { suppressed: false } | { suppressed: true; reason: string };

/**
 * Injectable side-effects for sendTestEventAgentAction. Mirrors the DI seam on
 * deployments/actions.ts (setBookingPolicyAction's `_deps`): defaults wire the
 * real session/DB/outbound seam; unit tests inject fakes so the guard + bypass
 * logic runs with NO DB / NO Twilio / NO Next session. All optional — an omitted
 * dep falls back to its production default.
 */
export type SendTestEventAgentDeps = {
  getOrgId: () => Promise<string | null>;
  /** Load the template by id (null when missing). */
  findTemplateById: (id: string) => Promise<TestTemplate | null>;
  /** The per-client customization for the (org, template) — review link source. */
  loadCustomization: (
    orgId: string,
    templateId: string,
  ) => Promise<{ reviewUrl?: string | null } | null>;
  /** The business name for the persona sign-off (soul businessName ?? org name). */
  resolveBusinessName: (orgId: string) => Promise<string | null>;
  /** Send an SMS via the outbound seam; returns whether it was suppressed. */
  sendSms: (args: {
    orgId: string;
    toNumber: string;
    body: string;
    source: string;
  }) => Promise<TestSendOutcome>;
  /** Send an email via the outbound seam; returns whether it was suppressed. */
  sendEmail: (args: {
    orgId: string;
    toEmail: string;
    subject: string;
    body: string;
    source: string;
  }) => Promise<TestSendOutcome>;
};

/** Map a fired event-type slug to the outbound skill an agent runs for it.
 *  Mirrors run-event-agent-deps.ts `skillForEvent`. Module-private so this
 *  "use server" file exports only async functions. */
function skillForEventType(eventType: string): EventAgentSkill | null {
  switch (eventType) {
    case "booking.completed":
      return "review-requester";
    case "lead.created":
      return "speed-to-lead";
    default:
      return null;
  }
}

/** The production deps — the real session, DB loaders, and outbound seam. */
function buildDefaultSendTestDeps(): SendTestEventAgentDeps {
  return {
    getOrgId,
    findTemplateById: async (id) => {
      const t = await getAgentTemplate(id);
      if (!t) return null;
      return {
        builderOrgId: t.builderOrgId,
        type: t.type,
        blueprint: (t.blueprint ?? null) as TestTemplate["blueprint"],
      };
    },
    loadCustomization: (orgId, templateId) =>
      loadDeploymentCustomizationForOrgTemplate(orgId, templateId),
    resolveBusinessName: resolveBusinessNameForOrg,
    sendSms: async ({ orgId, toNumber, body, source }) => {
      const res = await sendSmsFromApi({
        orgId,
        userId: null,
        contactId: null,
        toNumber,
        body,
        metadata: { source },
      });
      return res.suppressed
        ? { suppressed: true, reason: res.reason }
        : { suppressed: false };
    },
    sendEmail: async ({ orgId, toEmail, subject, body, source }) => {
      const res = await sendEmailFromApi({
        orgId,
        userId: null,
        contactId: null,
        toEmail,
        subject,
        body,
        metadata: { source },
      });
      return res.suppressed
        ? { suppressed: true, reason: res.reason }
        : { suppressed: false };
    },
  };
}

/**
 * Send a REAL test of an event (outbound) agent's message to a number/email NOW.
 *
 * Steps: assertWritable → getOrgId → load + ownership-check the template →
 * resolve its trigger (must be `kind:"event"` with a known skill) → resolve the
 * effective review link (deployment-wins via resolveReviewUrl) → compose the
 * "[TEST] "-prefixed body via the pure helper → send via the existing outbound
 * seam tagged `metadata.source = "agent:<skill>:test"`.
 *
 * Returns `{ ok:true, to, preview }` (preview = the first line of the sent body,
 * for the inline confirmation) or `{ ok:false, error }` with a clear message.
 * The throttle / guardrails / verify gates are intentionally bypassed (explicit
 * operator action); the review-link requirement is the one preserved guard.
 */
export async function sendTestEventAgentAction(
  input: SendTestEventAgentInput,
  _deps?: Partial<SendTestEventAgentDeps>,
): Promise<SendTestEventAgentResult> {
  assertWritable();

  const defaults = buildDefaultSendTestDeps();
  const deps: SendTestEventAgentDeps = { ...defaults, ..._deps };

  const orgId = await deps.getOrgId();
  if (!orgId) return { ok: false, error: "Not signed in." };

  const templateId = (input.agentTemplateId ?? "").trim();
  if (!templateId) return { ok: false, error: "Missing agent." };

  // Ownership guard: only the builder that owns the template can test it.
  const template = await deps.findTemplateById(templateId);
  if (!template || template.builderOrgId !== orgId) {
    return { ok: false, error: "Agent not found." };
  }

  const blueprint = (template.blueprint ?? {}) as {
    trigger?: unknown;
    reviewUrl?: string;
  };
  const trigger = resolveAgentTrigger(
    blueprint.trigger as Parameters<typeof resolveAgentTrigger>[0],
    template.type,
  );

  // Send-test only applies to OUTBOUND (event) agents — the inbound receptionist
  // path has its own sandbox (Test), and a schedule agent isn't a 1:1 send.
  if (trigger.kind !== "event") {
    return {
      ok: false,
      error: "Send test is only available for event-triggered (outbound) agents.",
    };
  }

  const skill = skillForEventType(trigger.event);
  if (!skill) {
    return {
      ok: false,
      error: "This event doesn't have a testable outbound message yet.",
    };
  }

  const channel = trigger.channel; // "sms" | "email" (validated by the resolver)

  // Resolve the destination for the channel. We trim + require the matching one.
  const toPhone = (input.toPhone ?? "").trim();
  const toEmail = (input.toEmail ?? "").trim();
  if (channel === "sms" && !toPhone) {
    return { ok: false, error: "Enter a phone number to send the test to." };
  }
  if (channel === "email" && !toEmail) {
    return { ok: false, error: "Enter an email address to send the test to." };
  }

  // Effective review link (review-requester only): the CLIENT's deployment link
  // wins over the template default — exactly the runtime's precedence. We read
  // the deployment customization for this org+template (the agency-org match is
  // fine for a test; the operator is the builder), then resolveReviewUrl folds
  // in the template fallback. Soft-fail the lookup so a DB hiccup degrades to the
  // template link rather than blocking the test.
  let reviewUrl: string | null = null;
  if (skill === "review-requester") {
    const templateReviewUrl =
      typeof blueprint.reviewUrl === "string" ? blueprint.reviewUrl : null;
    let customization: { reviewUrl?: string | null } | null = null;
    try {
      customization = await deps.loadCustomization(orgId, templateId);
    } catch {
      customization = null;
    }
    reviewUrl = resolveReviewUrl({ customization, templateReviewUrl });
  }

  // Business name for the sign-off — the SAME source the runtime uses in
  // findEventAgents: the org soul's businessName, else the org name. Best-effort
  // (the skills degrade to a generic "our team" sign-off when it's absent), so a
  // lookup miss never blocks the test.
  let businessName: string | null = null;
  try {
    businessName = await deps.resolveBusinessName(orgId);
  } catch {
    businessName = null;
  }

  // Compose the "[TEST] "-prefixed body via the tested pure helper. This is where
  // the review-link requirement is enforced (review skill + no link → error).
  const composed = composeTestEventAgentMessage({
    skill,
    channel,
    businessName,
    // No real contact — it's a self-test. The skills greet generically.
    contactName: null,
    reviewUrl,
    leadSummary: null,
  });
  if (!composed.ok) {
    return { ok: false, error: "Could not compose the test message." };
  }

  // Send NOW via the injected outbound seam. Tag the row
  // metadata.source = "agent:<skill>:test" so it's distinguishable from a real
  // automated send (the throttle probe matches "agent:<skill>" exactly, so the
  // ":test" suffix means a test never trips the live one-per-contact throttle).
  const source = `agent:${skill}:test`;
  try {
    if (channel === "sms") {
      const res = await deps.sendSms({
        orgId,
        toNumber: toPhone,
        body: composed.body,
        source,
      });
      if (res.suppressed) {
        return {
          ok: false,
          error: `That number is suppressed (${res.reason}) — pick another.`,
        };
      }
      return {
        ok: true,
        to: toPhone,
        preview: previewOf(composed.body),
        ...(composed.usedPlaceholder ? { usedPlaceholder: true } : {}),
      };
    }

    const res = await deps.sendEmail({
      orgId,
      toEmail,
      subject: composed.subject || "A quick note (test)",
      body: composed.body,
      source,
    });
    if (res.suppressed) {
      return {
        ok: false,
        error: `That email is suppressed (${res.reason}) — pick another.`,
      };
    }
    return {
      ok: true,
      to: toEmail,
      preview: previewOf(composed.body),
      ...(composed.usedPlaceholder ? { usedPlaceholder: true } : {}),
    };
  } catch (err) {
    // Surface a clean, actionable message — the common case is "Twilio/Resend
    // not configured for this workspace" (the seam throws that verbatim).
    const message = err instanceof Error ? err.message : "Send failed.";
    return { ok: false, error: message };
  }
}

/** First line of the body, trimmed — the inline "we sent: …" confirmation. */
function previewOf(body: string): string {
  const firstLine = body.split("\n")[0]?.trim() ?? "";
  return firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine;
}

/** The business name for the persona sign-off: the org soul's businessName, else
 *  the org name, else null. Mirrors run-event-agent-deps.ts. Best-effort — any
 *  miss/throw returns null (the skills sign off generically). Module-private. */
async function resolveBusinessNameForOrg(orgId: string): Promise<string | null> {
  try {
    const { db } = await import("@/db");
    const { organizations } = await import("@/db/schema/organizations");
    const { eq } = await import("drizzle-orm");
    const [org] = await db
      .select({ soul: organizations.soul, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    const fromSoul =
      org?.soul && typeof org.soul === "object"
        ? (org.soul as { businessName?: string }).businessName
        : null;
    const name = fromSoul || org?.name || null;
    return typeof name === "string" && name.trim().length > 0 ? name.trim() : null;
  } catch {
    return null;
  }
}
