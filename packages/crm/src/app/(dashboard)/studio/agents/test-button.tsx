// ICP-3 (task 1.2) — a "Test" link styled as a button, launching the sandboxed
// chat test panel for a given template. Pure server-safe React (no hooks) so the
// template detail header can render it next to Deploy. The actual sandbox lives
// at /studio/agents/[id]/test.

import Link from "next/link";
import { FlaskConical } from "lucide-react";

export function TestButton({
  templateId,
  variant = "secondary",
}: {
  templateId: string;
  variant?: "primary" | "secondary";
}) {
  const base =
    variant === "primary" ? "crm-button-primary" : "crm-button-secondary";
  return (
    <Link
      href={`/studio/agents/${templateId}/test`}
      className={`${base} inline-flex h-9 items-center gap-1.5 px-4 text-sm`}
    >
      <FlaskConical className="size-4" />
      Test
    </Link>
  );
}
