"use server";

import { z } from "zod";
import { signIn } from "@/auth";
import { assertWritable } from "@/lib/demo/server";

export type MagicLinkActionState = {
  error?: string;
  sent?: boolean;
  email?: string;
  inboxUrl?: string;
};

const emailSchema = z.object({
  email: z.string().email(),
});

function resolveInboxUrl(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://mail.google.com/mail/u/0/#search/from:noreply@seldonframe.com";
  }

  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return "https://outlook.live.com/mail/";
  }

  return null;
}

function isRedirectControlFlowError(error: unknown) {
  const digest = (error as { digest?: string } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export async function signInWithGoogleAction() {
  assertWritable();

  await signIn("google", { redirectTo: "/" });
}

export async function sendMagicLinkAction(_: MagicLinkActionState, formData: FormData): Promise<MagicLinkActionState> {
  try {
    assertWritable();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Sign in is unavailable in demo mode." };
  }

  const parsed = emailSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email address." };
  }

  const email = parsed.data.email.trim().toLowerCase();

  try {
    await signIn("resend", {
      email,
      redirect: false,
      redirectTo: "/",
    });

    return {
      sent: true,
      email,
      inboxUrl: resolveInboxUrl(email) ?? undefined,
    };
  } catch (error) {
    if (isRedirectControlFlowError(error)) {
      return {
        sent: true,
        email,
        inboxUrl: resolveInboxUrl(email) ?? undefined,
      };
    }

    return { error: "Could not send magic link right now. Please try again." };
  }
}
