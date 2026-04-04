import Link from "next/link";
import { getSoul } from "@/lib/soul/server";
import { CreateContactPageForm } from "@/components/contacts/create-contact-page-form";

function normalizeStage(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .replaceAll(/\s+/g, "-") || "lead";
}

export default async function NewContactPage() {
  const soul = await getSoul();
  const stageOptions = soul?.pipeline?.stages?.map((stage) => normalizeStage(stage.name)) ?? [];
  const uniqueStages = Array.from(new Set(stageOptions.filter(Boolean)));
  const fallbackStages = ["lead", "customer", "inactive"];

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight">Create Contact</h1>
        <Link href="/contacts" className="inline-flex h-10 items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
          Back to Contacts
        </Link>
      </div>

      <CreateContactPageForm stageOptions={uniqueStages.length > 0 ? uniqueStages : fallbackStages} />
    </main>
  );
}
