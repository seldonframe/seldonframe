// packages/crm/src/app/(dashboard)/clients/[slug]/landing/edit/page.tsx
//
// Server component — loads workspace + current payload + version history,
// then renders the client-side edit shell.

import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db";
import {
  landingPages,
  landingPayloadVersions,
  organizations,
  orgMembers,
} from "@/db/schema";
import { EditShell } from "./edit-shell";

export const dynamic = "force-dynamic";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

type EditPageProps = {
  params: Promise<{ slug: string }>;
};

export default async function LandingEditPage({ params }: EditPageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    const { slug } = await params;
    redirect(`/login?callbackUrl=/clients/${slug}/landing/edit`);
  }

  const { slug } = await params;
  if (!slug) redirect("/clients");

  // Resolve workspace + verify access.
  const [workspace] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      ownerId: organizations.ownerId,
      parentUserId: organizations.parentUserId,
    })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!workspace) redirect("/clients");

  const isOwner = workspace.ownerId === session.user.id;
  const isParent = workspace.parentUserId === session.user.id;
  if (!isOwner && !isParent) {
    const [member] = await db
      .select({ userId: orgMembers.userId })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, workspace.id),
          eq(orgMembers.userId, session.user.id),
        ),
      )
      .limit(1);
    if (!member) redirect("/clients");
  }

  // Load the R1 landing page row.
  const [r1Row] = await db
    .select({ id: landingPages.id, blueprintJson: landingPages.blueprintJson })
    .from(landingPages)
    .where(
      and(
        eq(landingPages.orgId, workspace.id),
        eq(landingPages.slug, "r1"),
        eq(landingPages.status, "published"),
      ),
    )
    .limit(1);

  const hasLanding = Boolean(
    r1Row?.blueprintJson &&
      (r1Row.blueprintJson as Record<string, unknown>)["_r1"] === true,
  );

  // Load recent version history (newest first, max 20).
  const versions = hasLanding
    ? await db
        .select({
          id: landingPayloadVersions.id,
          instruction: landingPayloadVersions.instruction,
          summary: landingPayloadVersions.summary,
          createdAt: landingPayloadVersions.createdAt,
        })
        .from(landingPayloadVersions)
        .where(eq(landingPayloadVersions.workspaceId, workspace.id))
        .orderBy(landingPayloadVersions.createdAt)
        .limit(20)
    : [];

  // Newest first for display.
  const versionList = [...versions].reverse().map((v) => ({
    id: v.id,
    instruction: v.instruction ?? null,
    summary: v.summary ?? null,
    createdAt: v.createdAt.toISOString(),
  }));

  const previewUrl = `https://${WORKSPACE_BASE_DOMAIN}/w/${workspace.slug}`;

  return (
    <EditShell
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      workspaceSlug={workspace.slug}
      hasLanding={hasLanding}
      previewUrl={previewUrl}
      initialVersions={versionList}
    />
  );
}
