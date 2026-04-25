// /technicians admin page — read-only roster sourced from
// org.soul.technicians (per gate G-9-1: technicians as Soul attribute,
// not block).
//
// SLICE 9 PR 1 C8 polish: composes existing primitives (PageShell +
// EntityTable + Zod schema). Operator updates technicians via Soul
// JSON edit (or future settings UI in a post-launch slice).

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { EntityTable } from "@/components/ui-composition/entity-table";
import { PageShell } from "@/components/ui-composition/page-shell";
import { getOrgId } from "@/lib/auth/helpers";
import { getTechnicians } from "@/lib/hvac/technicians";

export const dynamic = "force-dynamic";

const TechnicianRowSchema = z.object({
  name: z.string(),
  employeeId: z.string(),
  skill_level: z.string(),
  certifications: z.string(),
  service_area: z.string(),
  on_call_today: z.boolean(),
  current_assignment: z.string(),
});
type TechnicianRow = z.infer<typeof TechnicianRowSchema>;

export default async function TechniciansPage() {
  const orgId = await getOrgId();
  if (!orgId) redirect("/login");

  const [org] = await db
    .select({ soul: organizations.soul })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const techs = getTechnicians(org?.soul);

  // Project Technician → row shape with comma-joined arrays for table
  // rendering. EntityTable's Zod-derived columns handle the rest.
  const rows: TechnicianRow[] = techs.map((t) => ({
    name: t.name,
    employeeId: t.employeeId,
    skill_level: t.skill_level,
    certifications: t.certifications.length === 0 ? "—" : t.certifications.join(", "),
    service_area: t.service_area.length === 0 ? "—" : `${t.service_area.length} zips`,
    on_call_today: t.on_call_today,
    current_assignment: t.current_assignment ?? "—",
  }));

  return (
    <PageShell
      title="Technicians"
      description="14 field technicians + roster (read-only, sourced from workspace Soul). Edit via Soul JSON for v1."
    >
      <EntityTable
        schema={TechnicianRowSchema}
        rows={rows}
        emptyState="No technicians configured. Update workspace Soul to add."
        ariaLabel="Technicians roster"
      />
    </PageShell>
  );
}
