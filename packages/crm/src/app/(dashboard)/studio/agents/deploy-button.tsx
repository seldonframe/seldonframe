// ICP-3 — a "Deploy" link styled as a button, launching the deploy-to-client
// stepper for a given template. Pure server-safe React (no hooks) so both the
// template list rows and the template detail header can render it. The actual
// flow (4-step stepper) lives at /studio/agents/[id]/deploy.

import Link from "next/link";
import { Rocket } from "lucide-react";

export function DeployButton({
  templateId,
  variant = "secondary",
}: {
  templateId: string;
  variant?: "primary" | "secondary";
}) {
  const base =
    variant === "primary"
      ? "crm-button-primary"
      : "crm-button-secondary";
  return (
    <Link
      href={`/studio/agents/${templateId}/deploy`}
      className={`${base} inline-flex h-9 items-center gap-1.5 px-4 text-sm`}
    >
      <Rocket className="size-4" />
      Deploy
    </Link>
  );
}
