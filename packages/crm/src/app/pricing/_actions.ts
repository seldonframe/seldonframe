// packages/crm/src/app/pricing/_actions.ts
//
// Server Actions for the /pricing page. Pulled into a separate file so the
// Client Component (pricing-picker.tsx) can import them — Next.js requires
// Server Actions consumed by Client Components to live in a file with a
// top-level "use server" directive.

"use server";

import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { assertWritable } from "@/lib/demo/server";

/**
 * Pick the Free tier in one click. Stamps users.planId='free' on the
 * signed-in user (only if currently NULL) and redirects to /dashboard.
 *
 * Without this, the plain <Link href="/dashboard"> sent the user into an
 * infinite /dashboard ↔ /pricing loop because plan-gate.ts:74 sees
 * !planId and 307s back here.
 *
 * Commit 2 (post-smoke-test) replaces this with a Stripe SetupIntent
 * flow that ALSO attaches a card-on-file so future upgrades are
 * one-click. Until then, no card is collected for Free.
 */
export async function selectFreeTierAction() {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  await db
    .update(users)
    .set({ planId: "free", updatedAt: new Date() })
    .where(and(eq(users.id, session.user.id), isNull(users.planId)));

  redirect("/dashboard");
}
