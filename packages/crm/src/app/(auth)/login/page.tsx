import { LoginForm } from "./login-form";
import Link from "next/link";
import { toInternalRedirectPath } from "@/lib/auth/signup-redirect";
import { isGoogleAuthEnabled } from "@/lib/auth/google-enabled";
import { isDemoReadonly } from "@/lib/demo/server";

export default async function LoginPage({
  searchParams,
}: {
  // The public marketplace buy box sends a logged-out buyer here as
  // /login?callbackUrl=<absolute app-origin listing URL> (buildListingSignInUrl).
  // We read it, collapse it to a SAFE same-origin relative path, and thread it
  // into the form's hidden `redirectTo` so the magic-link round trip returns the
  // buyer to the agent listing instead of the default /clients/new. NextAuth
  // also forwards its own ?callbackUrl on the /login verifyRequest page, so this
  // param shape is already part of the auth surface.
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const params = await searchParams;
  // null when absent/unsafe → form falls back to its own default redirect.
  const redirectTo = toInternalRedirectPath(params.callbackUrl);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="text-center">
          <h1 className="text-section-title text-foreground">Welcome to SeldonFrame</h1>
          <p className="mt-1 text-label text-[hsl(var(--color-text-secondary))]">
            The operating system for your business.
          </p>
        </div>
        <LoginForm
          redirectTo={redirectTo}
          googleEnabled={
            isGoogleAuthEnabled({
              GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
              GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
            }) && !isDemoReadonly()
          }
          // demo-readonly: hide Google — assertWritable would reject the action with a raw error boundary (review 2026-07-04)
        />
      </div>

      <footer className="border-t border-border pt-4 text-xs text-[hsl(var(--color-text-secondary))]">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="underline-offset-4 hover:underline">
            Terms of Service
          </Link>
          <span className="ml-auto">&copy; 2026 SeldonFrame</span>
        </div>
      </footer>
    </div>
  );
}
