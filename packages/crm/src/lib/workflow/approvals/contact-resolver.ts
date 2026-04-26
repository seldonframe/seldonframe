// Resolves approverUserId → approver email + name for the notifier.
// SLICE 10 PR 2 C1.
//
// Production binds to (db) via the helper below; tests pass an
// in-memory stub. The dispatcher in PR 1 already resolved the
// approver discriminator to a userId (operator → org.ownerId,
// client_owner → org.client_contact_user_id when present, etc.).
// This module just maps that userId → the email + name needed for
// the email envelope.
//
// Falls back gracefully when the user record is missing — returns
// null, and the runtime's applyAction logs + skips the notification
// (per L-22). The approval row is still persisted; admin dashboard
// + cron timeout + magic-link surface all still work without the
// email landing.

import { eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import { users } from "@/db/schema";

import type { ApproverContact } from "./notifier";

export type LoadApproverContactFn = (
  orgId: string,
  approverUserId: string | null,
) => Promise<ApproverContact | null>;

export function makeDrizzleApproverContactLoader(db: DbClient): LoadApproverContactFn {
  return async (_orgId, approverUserId) => {
    if (approverUserId === null) return null;
    const [row] = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, approverUserId))
      .limit(1);
    if (!row) return null;
    return {
      userId: row.id,
      email: row.email,
      name: row.name ?? row.email,
    };
  };
}
