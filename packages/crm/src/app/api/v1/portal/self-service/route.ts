import { NextResponse } from "next/server";
import { runSeldonItAction } from "@/lib/ai/seldon-actions";
import { SELDON_CALM_PROGRESS_MESSAGES, SELDON_PROGRESS_INTERVAL_MS } from "@/lib/ai/progress-messages";
import { getPortalSessionForToken } from "@/lib/portal/auth";
import { toOpenClawCards } from "@/lib/openclaw/self-service";
import { guardEndClientDescription } from "@/lib/openclaw/scope-guard";
import { writeEvent } from "@/lib/brain";

type SelfServiceBody = {
  orgSlug?: unknown;
  description?: unknown;
  sessionId?: unknown;
  portalToken?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as SelfServiceBody;
  const orgSlug = typeof body.orgSlug === "string" ? body.orgSlug.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
  const portalToken = typeof body.portalToken === "string" ? body.portalToken.trim() : "";

  if (!orgSlug || !description || !portalToken) {
    return NextResponse.json({ error: "orgSlug, description, and portalToken are required." }, { status: 400 });
  }

  const session = await getPortalSessionForToken(orgSlug, portalToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid or expired portal token." }, { status: 401 });
  }

  const guard = guardEndClientDescription(description);
  if (!guard.allowed) {
    void writeEvent(session.orgId, "openclaw_scope_denied", {
      mode: "end_client",
      client_id: session.contact.id,
      category: guard.reason.category,
      matched: guard.matched,
      description_preview: description.slice(0, 200),
    });

    return NextResponse.json(
      {
        ok: false,
        end_client_mode: true,
        blocked: true,
        blocked_category: guard.reason.category,
        error: guard.reason.message,
      },
      { status: 422 }
    );
  }

  const formData = new FormData();
  formData.set("orgSlug", orgSlug);
  formData.set("description", description);
  formData.set("end_client_mode", "true");
  formData.set("portalToken", portalToken);
  if (sessionId) {
    formData.set("sessionId", sessionId);
  }

  const result = await runSeldonItAction({ ok: false }, formData);

  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      end_client_mode: true,
      error: result.error ?? "Self-service customization failed.",
    }, { status: result.error === "Unauthorized" ? 401 : 500 });
  }

  return NextResponse.json({
    ok: true,
    end_client_mode: true,
    sessionId: result.sessionId,
    message: result.message,
    suggestions: result.suggestions ?? [],
    plan: result.plan ?? null,
    results: result.results ?? [],
    cards: toOpenClawCards(result.results ?? []),
    progress: {
      interval_ms: SELDON_PROGRESS_INTERVAL_MS,
      messages: [...SELDON_CALM_PROGRESS_MESSAGES],
    },
    contact: {
      id: session.contact.id,
      firstName: session.contact.firstName,
      lastName: session.contact.lastName,
      email: session.contact.email,
    },
  });
}
