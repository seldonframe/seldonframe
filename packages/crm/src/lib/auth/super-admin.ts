// v1.35.0 — Super-admin auth gate.
//
// SF platform admin (vs operator workspace admin). Anyone whose email
// matches the SF_SUPERADMIN_EMAILS env var allowlist can reach the
// /super-admin surfaces. Everyone else gets redirected to /dashboard.
//
// Why env-allowlist (not a `super_admin` boolean column on users):
//   - Pre-launch, the team is one person; over-engineering the
//     permission model adds complexity for zero payoff.
//   - Env vars are auditable through Vercel/deploy logs — easier to
//     review than a DB column edit nobody sees.
//   - When the team grows (>3 SF admins) or hire-onboarding becomes a
//     pattern, this graduates cleanly to a `users.is_super_admin`
//     column. The check function below is the only thing that changes.
//
// SF_SUPERADMIN_EMAILS format: comma-separated, whitespace-tolerant.
//   SF_SUPERADMIN_EMAILS="max@seldonframe.com, alice@seldonframe.com"
//
// If the env var is unset OR the user's email isn't in the list, the
// route redirects to /dashboard with no flash of admin content
// (decision happens server-side before render).

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { parseAdminAllowlist } from "@/lib/operator-portal/authorization";

function parseAllowlist(): Set<string> {
  // Single source of truth for the SF_SUPERADMIN_EMAILS format lives in
  // lib/operator-portal/authorization.ts (a pure, unit-tested module).
  return new Set(parseAdminAllowlist(process.env.SF_SUPERADMIN_EMAILS));
}

export async function isSuperAdminUser(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const allowlist = parseAllowlist();
  return allowlist.has(email.trim().toLowerCase());
}

/**
 * Server-side gate for /super-admin/* surfaces. Redirects to /dashboard
 * for anyone not on the SF_SUPERADMIN_EMAILS allowlist. Returns the
 * authenticated user when access is granted.
 */
export async function requireSuperAdmin() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    redirect("/login?redirectTo=/super-admin");
  }

  const allowed = await isSuperAdminUser(email);
  if (!allowed) {
    // Don't 403 — that's a info leak. Send to /dashboard like any
    // other authenticated user without admin rights.
    redirect("/dashboard");
  }

  return {
    userId: session.user.id as string,
    email,
    name: session.user.name ?? email,
  };
}
