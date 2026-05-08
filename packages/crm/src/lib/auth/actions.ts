"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signIn, signOut } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import { OPERATOR_SESSION_COOKIE } from "@/lib/operator-portal/session";

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(2),
});

type AuthActionState = {
  error?: string;
  success?: boolean;
};

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 48);
}

async function createOrganizationWithUniqueSlug(orgName: string) {
  const baseSlug = slugify(orgName) || "workspace";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    const slug = `${baseSlug}-${suffix}`;

    try {
      let org: (typeof organizations.$inferSelect) | undefined;

      try {
        [org] = await db
          .insert(organizations)
          .values({
            name: orgName,
            slug,
            ownerId: "",
          })
          .returning();
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;

        if (code !== "42703") {
          throw error;
        }

        [org] = await db
          .insert(organizations)
          .values({
            name: orgName,
            slug,
          })
          .returning();
      }

      if (org) {
        return org;
      }
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;

      if (code === "23505") {
        continue;
      }

      throw error;
    }
  }

  return null;
}

export async function signupAction(_: AuthActionState, formData: FormData): Promise<AuthActionState> {
  try {
    assertWritable();
  } catch (error) {
    if (error instanceof Error) {
      return { error: error.message };
    }

    return { error: "Sign up is unavailable in demo mode." };
  }

  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    orgName: formData.get("orgName"),
  });

  if (!parsed.success) {
    return { error: "Please provide valid signup details." };
  }

  try {
    const existingUser = await db.select({ id: users.id }).from(users).where(eq(users.email, parsed.data.email)).limit(1);

    if (existingUser.length > 0) {
      return { error: "An account with this email already exists." };
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const org = await createOrganizationWithUniqueSlug(parsed.data.orgName);

    if (!org) {
      return { error: "Could not create organization. Please try again." };
    }

    const [owner] = await db
      .insert(users)
      .values({
        orgId: org.id,
        name: parsed.data.name,
        email: parsed.data.email,
        role: "owner",
        passwordHash,
      })
      .returning({ id: users.id });

    if (owner?.id) {
      try {
        await db.update(organizations).set({ ownerId: owner.id }).where(eq(organizations.id, org.id));
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;

        if (code !== "42703") {
          throw error;
        }
      }
    }

    try {
      await signIn("credentials", {
        email: parsed.data.email,
        password: parsed.data.password,
        redirect: false,
      });
    } catch {
      return { error: "Account created. Please sign in from the login page." };
    }

    return { success: true };
  } catch {
    return { error: "Could not create your account right now. Please try again." };
  }
}

// ─── unified signout ────────────────────────────────────────────────────
//
// v1.27.4 — fixes the "logged out but still in operator portal" bug.
//
// SF has THREE auth sources that can be active simultaneously:
//   1. NextAuth session (next-auth.session-token cookie)
//   2. Operator portal session (sf_operator_session cookie, v1.25.0+)
//   3. Admin token (Authorization: Bearer ... header — server-only)
//
// Pre-1.27.4, the topbar's "Log out" called next-auth's signOut() which
// only cleared #1. The operator portal cookie (#2) survived, so the
// next request resolved as the operator portal user (per v1.25.2's
// precedence order). Result: user appears stuck in operator-portal mode.
//
// v1.27.4 cleared #1 + #2.
// v1.35.7 — bug fix: when a user had ALSO touched a Claude Code MCP
// admin-token onboarding flow at any point, the `sf_admin_token`
// cookie (workspace bearer token, format `wst_*`) survived logout.
// proxy.ts line 196 treats hasAdminTokenCookie() as "authenticated",
// so /login → /dashboard redirect kept them stuck. Symptom: clicking
// "Log out" appears to do nothing — the page bounces back to the
// dashboard.
//
// signOutAllSessionsAction now clears all three cookies in one call:
// NextAuth session, operator-portal session, and admin-token. The
// `wst_*` token IS NOT revoked server-side here — it's still valid
// for MCP callers using it as a Bearer header. We just clear the
// COOKIE so this browser session stops being "authenticated."
// Server-side revocation requires a separate flow (delete the
// api_keys row); not the same operation as sign-out.

const ADMIN_TOKEN_COOKIE_NAME = "sf_admin_token";

export async function signOutAllSessionsAction(): Promise<void> {
  const cookieStore = await cookies();

  const cookieClearOpts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };

  // Clear operator portal cookie first — it precedes NextAuth in helpers.ts
  // resolution order, so leaving it would make signOut a no-op visually.
  cookieStore.set(OPERATOR_SESSION_COOKIE, "", cookieClearOpts);

  // v1.35.7 — also clear the admin-token cookie. proxy.ts treats this as
  // "authenticated"; without clearing it /login bounces back to /dashboard.
  cookieStore.set(ADMIN_TOKEN_COOKIE_NAME, "", cookieClearOpts);

  // Then clear NextAuth. signOut({ redirect: false }) clears the cookie
  // without redirecting; we control the redirect ourselves so the topbar
  // and any other caller can compose this with their own post-signout flow.
  try {
    await signOut({ redirect: false });
  } catch {
    // signOut throws if there's no NextAuth session to clear — that's fine,
    // we still want to clear the operator + admin-token cookies above and proceed.
  }

  redirect("/login");
}
