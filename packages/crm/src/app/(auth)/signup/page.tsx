import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-section-title text-foreground">Create your workspace</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Set up your organization and owner account.</p>
      </div>
      <SignupForm />
    </div>
  );
}
