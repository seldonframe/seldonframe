import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { authConfig } from "@/lib/auth/config";

const authSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? (process.env.NODE_ENV === "development" ? "seldon-frame-dev-secret" : undefined);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  secret: authSecret,
  ...authConfig,
});
