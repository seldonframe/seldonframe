// v1.15.0 — GET /api/v1/workspace/v2/portal/preview?contact_id=...
//
// Render the workspace's portal template against a specific contact's
// data. Returns HTML + CSS for inspection. Use to verify a template
// looks right before customers see it.
//
// Auth: workspace bearer token. The contact_id MUST belong to this
// workspace (enforced inside fetchCustomerContact via the orgId+
// contactId scoped query — returns null if mismatched).
//
// Note: this is the OPERATOR-facing preview. The production customer-
// facing portal route (which renders to authenticated customers) is
// a separate concern, queued for v1.16. v1.15 ships the templates +
// renderer; v1.16 wires the customer-visible URL.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import {
  buildCustomerContext,
} from "@/lib/page-blocks/portal/customer-context";
import { loadPortalTemplateForRender } from "@/lib/page-blocks/portal/structure";
import {
  renderCompositeTree,
  COMPOSITE_CSS,
} from "@/lib/page-blocks/composite/render";
import type { CompositeRenderContext } from "@/lib/page-blocks/composite/render";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET(request: Request) {
  const guard = await guardApiRequest(request);
  if ("error" in guard) return guard.error;

  const url = new URL(request.url);
  const contactId = (url.searchParams.get("contact_id") ?? "").trim();
  if (!contactId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_field",
        required: ["contact_id (query string)"],
      },
      { status: 400 },
    );
  }

  // Build the workspace context (services, faq, hours, phone — same
  // shape composite landings use).
  const [orgRow] = await db
    .select({
      id: organizations.id,
      timezone: organizations.timezone,
    })
    .from(organizations)
    .where(eq(organizations.id, guard.orgId))
    .limit(1);
  if (!orgRow) {
    return NextResponse.json(
      { ok: false, error: "workspace_not_found" },
      { status: 404 },
    );
  }
  const workspaceTimezone = orgRow.timezone ?? "UTC";

  // Minimal workspace context — portal previews don't need the full
  // services/faq/etc. embeds to render. Customer.* embeds are the
  // primary surface here. For completeness we leave the workspace-
  // level fields empty (operators rarely use those refs in portal
  // sections).
  const workspaceContext: CompositeRenderContext = {
    workspace_phone: "",
    workspace_phone_display: "",
    services: [],
    faq: [],
    testimonials: [],
    hours_summary: "",
    book_url: "/book",
    intake_url: "/intake",
  };

  const customerContext = await buildCustomerContext({
    orgId: guard.orgId,
    contactId,
    workspaceContext,
    workspaceTimezone,
  });
  if (!customerContext) {
    return NextResponse.json(
      {
        ok: false,
        error: "contact_not_found",
        message: `No contact ${contactId} found in this workspace. Either the id is wrong or the contact belongs to a different workspace.`,
      },
      { status: 404 },
    );
  }

  const template = await loadPortalTemplateForRender(guard.orgId);
  if (template.length === 0) {
    logEvent(
      "v2_portal_preview_empty",
      { contact_id: contactId },
      { request, orgId: guard.orgId, status: 200 },
    );
    return NextResponse.json(
      {
        ok: true,
        html: "<!-- portal template is empty; add sections via add_portal_section -->",
        css: COMPOSITE_CSS,
        sections_rendered: 0,
        contact_id: contactId,
      },
      { status: 200 },
    );
  }

  const renderedSections = template.map((section) =>
    renderCompositeTree(section, customerContext),
  );

  logEvent(
    "v2_portal_preview_rendered",
    {
      contact_id: contactId,
      sections_rendered: renderedSections.length,
    },
    { request, orgId: guard.orgId, status: 200 },
  );

  return NextResponse.json(
    {
      ok: true,
      html: `<div class="sf-frame">${renderedSections.join("\n")}</div>`,
      css: COMPOSITE_CSS,
      sections_rendered: renderedSections.length,
      contact_id: contactId,
    },
    { status: 200 },
  );
}
