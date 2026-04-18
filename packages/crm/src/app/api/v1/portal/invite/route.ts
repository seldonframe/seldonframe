import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { createPortalMagicLink } from "@/lib/portal/auth";
import {
  assertSelfServiceEnabled,
  requireManagedWorkspaceForUser,
  resolveAuthenticatedBuilderUserId,
} from "@/lib/openclaw/self-service";

type InviteBody = {
  workspaceId?: unknown;
  contactId?: unknown;
  email?: unknown;
};

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedBuilderUserId(request.headers);
    const body = (await request.json().catch(() => ({}))) as InviteBody;
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const contactId = typeof body.contactId === "string" ? body.contactId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!workspaceId || (!contactId && !email)) {
      return NextResponse.json({ error: "workspaceId and contactId or email are required." }, { status: 400 });
    }

    const workspace = await requireManagedWorkspaceForUser(workspaceId, userId);
    assertSelfServiceEnabled(workspace);

    const [contact] = contactId
      ? await db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.orgId, workspace.id), eq(contacts.id, contactId)))
          .limit(1)
      : await db
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.orgId, workspace.id), eq(contacts.email, email)))
          .limit(1);

    if (!contact?.id || !contact.email) {
      return NextResponse.json({ error: "Contact not found or missing email." }, { status: 404 });
    }

    const invite = await createPortalMagicLink({
      orgSlug: workspace.slug,
      contactId: contact.id,
      redirectTo: `/portal/${workspace.slug}?onboarding=1&self_service=1`,
    });

    return NextResponse.json({
      ok: true,
      end_client_mode: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      contact: invite.contact,
      invite_url: invite.inviteUrl,
      portal_token: invite.token,
      expires_at: invite.expiresAt,
      onboarding: {
        mode: "end_client_mode",
        title: "Self-service invite ready",
        summary: `Send ${contact.firstName || contact.email} this magic link to open their scoped customization assistant.`,
        steps: [
          "Open the magic link once to claim the self-service session.",
          "Describe the change in plain language.",
          "Review the result card and use Apply, Edit, Undo, or View live preview.",
        ],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create invite.";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Self-service") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
