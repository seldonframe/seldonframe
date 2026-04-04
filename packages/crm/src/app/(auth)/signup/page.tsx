import { SignupForm } from "./signup-form";
import Link from "next/link";

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
        <h1 className="text-section-title text-foreground">Welcome to SeldonFrame</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">One Soul powering every block in your business.</p>
        </div>
        <SignupForm />
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
