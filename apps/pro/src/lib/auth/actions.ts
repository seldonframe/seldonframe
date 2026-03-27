"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { assertWritable } from "@/lib/pro/guards";
import { getProSessionCookieName, signProSession, verifyProSession } from "./session";

function getAdminEmail() {
  return process.env.PRO_ADMIN_EMAIL ?? "owner@seldonframe.local";
}

async function verifyAdminPassword(password: string) {
  const hash = process.env.PRO_ADMIN_PASSWORD_HASH;
  const plain = process.env.PRO_ADMIN_PASSWORD;

  if (hash) {
    return bcrypt.compare(password, hash);
  }

  if (plain) {
    return plain === password;
  }

  return false;
}

export async function loginProAction(formData: FormData) {
  assertWritable();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    throw new Error("Email and password are required");
  }

  const validEmail = email === getAdminEmail().toLowerCase();
  const validPassword = await verifyAdminPassword(password);

  if (!validEmail || !validPassword) {
    throw new Error("Invalid credentials");
  }

  const token = signProSession({
    email,
    role: "superadmin",
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  });

  const cookieStore = await cookies();
  cookieStore.set(getProSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  redirect("/dashboard");
}

export async function logoutProAction() {
  const cookieStore = await cookies();
  cookieStore.set(getProSessionCookieName(), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  redirect("/login");
}

export async function requireProAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getProSessionCookieName())?.value;
  const session = verifyProSession(token);

  if (!session) {
    redirect("/login");
  }

  return session;
}
