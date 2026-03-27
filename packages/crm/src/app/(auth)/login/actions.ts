"use server";

import { signIn } from "@/auth";

type LoginActionState = {
  error?: string;
  success?: boolean;
};

export async function loginAction(_: LoginActionState, formData: FormData): Promise<LoginActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });

    return { success: true };
  } catch {
    return { error: "Invalid credentials." };
  }
}
