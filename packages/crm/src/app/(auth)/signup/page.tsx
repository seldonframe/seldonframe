import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-section-title text-foreground">Welcome to SeldonFrame</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">The operating system for your business.</p>
      </div>
      <SignupForm />
    </div>
  );
}
