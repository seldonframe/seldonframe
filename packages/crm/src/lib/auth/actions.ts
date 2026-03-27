"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { signIn } from "@/auth";
import { assertWritable } from "@/lib/demo/server";

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

  const existingUser = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);

  if (existingUser.length > 0) {
    return { error: "An account with this email already exists." };
  }

  const baseSlug = slugify(parsed.data.orgName) || "workspace";
  const slug = `${baseSlug}-${Math.floor(Math.random() * 10000)}`;
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const [org] = await db
    .insert(organizations)
    .values({
      name: parsed.data.orgName,
      slug,
    })
    .returning();

  if (!org) {
    return { error: "Could not create organization." };
  }

  await db.insert(users).values({
    orgId: org.id,
    name: parsed.data.name,
    email: parsed.data.email,
    role: "owner",
    passwordHash,
  });

  await signIn("credentials", {
    email: parsed.data.email,
    password: parsed.data.password,
    redirect: false,
  });

  return { success: true };
}
