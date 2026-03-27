import Link from "next/link";
import { DEMO_DEPLOY_URL, DEMO_REPO_URL } from "@/lib/demo/constants";

export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_READONLY !== "true") {
    return null;
  }

  return (
    <div className="crm-card flex flex-wrap items-center justify-between gap-3 border-yellow-300/70 bg-yellow-50/70 p-3 text-sm">
      <p className="text-[hsl(var(--color-text-secondary))]">You&apos;re viewing a live demo</p>
      <div className="flex items-center gap-2">
        <Link href={DEMO_REPO_URL} target="_blank" rel="noreferrer" className="rounded-md border px-3 py-1.5 text-xs font-medium">
          Fork on GitHub
        </Link>
        <Link href={DEMO_DEPLOY_URL} target="_blank" rel="noreferrer" className="crm-button-primary h-8 px-3 text-xs">
          Deploy Your Own
        </Link>
      </div>
    </div>
  );
}
