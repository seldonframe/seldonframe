// NOT "use server" — called from lib modules, not Next.js server actions.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * Returns true when the workspace's A2P campaign has been approved and
 * the operator has been cleared to send outbound SMS. Defaults to false
 * so the UI stays dark until the flag is explicitly flipped.
 */
export async function getOutboundSmsEnabled(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return false;

  return org.integrations?.twilio?.outboundSmsEnabled === true;
}

/**
 * Sets outboundSmsEnabled on the workspace's twilio integration object.
 * Used by Settings and (future) the A2P compliance webhook.
 */
export async function setOutboundSmsEnabled(orgId: string, enabled: boolean): Promise<void> {
  const [org] = await db
    .select({ integrations: organizations.integrations })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  if (!org) return;

  const integrations = org.integrations ?? {};
  const twilio = integrations.twilio;

  await db
    .update(organizations)
    .set({
      integrations: {
        ...integrations,
        ...(twilio
          ? { twilio: { ...twilio, outboundSmsEnabled: enabled } }
          : {}),
      },
    })
    .where(eq(organizations.id, orgId));
}
