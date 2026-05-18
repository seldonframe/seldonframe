// 2026-05-18 — Server actions for the outbound messaging editor (plan
// v2, slice 5). The Phase 6 agent-blueprint editor is the design
// reference: pre-fill with platform default, "Platform default /
// Customized" chip, "Reset to default" button, save "" when unchanged
// to keep the row clean.

"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { outboundMessageTriggers, type OutboundMessageTrigger } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { assertWritable } from "@/lib/demo/server";
import { getMessageSkill } from "./skills/registry";

export type TriggerRowView = {
  id: string;
  eventType: string;
  channel: "email" | "sms";
  skillId: string;
  skillLabel: string;
  enabled: boolean;
  delayMinutes: number;
  hasCustomSkillMd: boolean;
  customSkillMd: string;
  platformDefaultMd: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Load every outbound trigger configured for the active workspace +
 * shape it for the editor UI. Includes the platform default for each
 * trigger so the editor can render the "Reset to default" affordance
 * without an extra round-trip.
 */
export async function listOutboundTriggers(): Promise<TriggerRowView[]> {
  const orgId = await getOrgId();
  if (!orgId) return [];

  const rows = await db
    .select()
    .from(outboundMessageTriggers)
    .where(eq(outboundMessageTriggers.orgId, orgId));

  return rows.map(shapeTriggerRow);
}

/**
 * Toggle enabled state. Operators turn defaults off (e.g. "I don't
 * want SMS confirmations") without deleting the trigger row so we
 * keep the customSkillMd around for when they re-enable.
 */
export async function setOutboundTriggerEnabledAction(input: {
  triggerId: string;
  enabled: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  await db
    .update(outboundMessageTriggers)
    .set({ enabled: input.enabled, updatedAt: new Date() })
    .where(
      and(
        eq(outboundMessageTriggers.id, input.triggerId),
        eq(outboundMessageTriggers.orgId, orgId),
      ),
    );

  revalidatePath("/emails");
  return { ok: true };
}

/**
 * Save edits to the trigger's customSkillMd. If the operator's text
 * matches the platform default verbatim we store an empty string
 * instead — keeps the row clean and means future platform skill-pack
 * improvements flow through automatically (same pattern as Phase 6's
 * agent blueprint editor).
 *
 * 8000-char cap (~2k tokens) so a runaway operator can't blow up the
 * prompt budget at compose time.
 */
const CUSTOM_SKILL_MD_MAX = 8000;

export async function saveOutboundTriggerSkillAction(input: {
  triggerId: string;
  customSkillMd: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  assertWritable();
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const trimmed = (input.customSkillMd ?? "").trim();
  if (trimmed.length > CUSTOM_SKILL_MD_MAX) {
    return { ok: false, error: "over_length" };
  }

  // Look up the trigger so we can compare against the platform default.
  const [trigger] = await db
    .select()
    .from(outboundMessageTriggers)
    .where(
      and(
        eq(outboundMessageTriggers.id, input.triggerId),
        eq(outboundMessageTriggers.orgId, orgId),
      ),
    )
    .limit(1);
  if (!trigger) return { ok: false, error: "trigger_not_found" };

  const platformDefault = getMessageSkill(trigger.skillId)?.content?.trim() ?? "";
  const shouldStore = trimmed.length > 0 && trimmed !== platformDefault;

  await db
    .update(outboundMessageTriggers)
    .set({
      customSkillMd: shouldStore ? trimmed : null,
      updatedAt: new Date(),
    })
    .where(eq(outboundMessageTriggers.id, input.triggerId));

  revalidatePath("/emails");
  return { ok: true };
}

function shapeTriggerRow(row: OutboundMessageTrigger): TriggerRowView {
  const skill = getMessageSkill(row.skillId);
  const platformDefault = skill?.content?.trim() ?? "";
  const customSkillMd = (row.customSkillMd ?? "").trim();
  return {
    id: row.id,
    eventType: row.eventType,
    channel: (row.channel === "sms" ? "sms" : "email") as "email" | "sms",
    skillId: row.skillId,
    skillLabel: skill?.label ?? row.skillId,
    enabled: row.enabled,
    delayMinutes: row.delayMinutes,
    hasCustomSkillMd: customSkillMd.length > 0,
    customSkillMd,
    platformDefaultMd: platformDefault,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
