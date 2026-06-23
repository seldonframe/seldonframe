// Agency multi-client deploy — a "Deploy to clients" link styled as a button,
// launching the bulk-deploy panel for a given template. Pure server-safe React
// (no hooks) so the template header can render it. The flow lives at
// /studio/agents/[id]/deploy-to-clients.

import Link from "next/link";
import { Users } from "lucide-react";

export function DeployToClientsButton({
  templateId,
  variant = "secondary",
}: {
  templateId: string;
  variant?: "primary" | "secondary";
}) {
  const base = variant === "primary" ? "crm-button-primary" : "crm-button-secondary";
  return (
    <Link
      href={`/studio/agents/${templateId}/deploy-to-clients`}
      className={`${base} inline-flex h-9 items-center gap-1.5 px-4 text-sm`}
    >
      <Users className="size-4" />
      Deploy to clients
    </Link>
  );
}
