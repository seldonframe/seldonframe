// v1.27.5 — agent test sandbox tab (with diagnostic pre-flight)
//
// Renders inside the /agents/[id] layout (header + tab nav already there).
// Agent must be in 'test' or 'live' for the turn endpoint to accept.
//
// Pre-flight checks BEFORE the operator types anything:
//   - Workspace has an Anthropic key configured (else chat will 100% error)
//   - Agent in 'test' or 'live' status
//
// (Daily-token-budget check removed in v1.27.9 — under BYOK there's no
// SF cost exposure to cap. Operators manage spend in their own Anthropic
// dashboard.)
//
// Each fail surfaces an actionable banner ABOVE the chat UI so operators
// don't waste a turn discovering the issue from a generic fallback message.

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/db";
import {
  agents,
  organizations,
  type AgentBlueprint,
} from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { TestSandboxClient } from "./test-client";

export const dynamic = "force-dynamic";

type Diagnostic = {
  level: "ok" | "warn" | "block";
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
};

export default async function AgentTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const orgId = await getOrgId();
  if (!orgId) notFound();

  const [row] = await db
    .select({
      id: agents.id,
      name: agents.name,
      slug: agents.slug,
      status: agents.status,
      blueprint: agents.blueprint,
      orgId: agents.orgId,
      orgSlug: organizations.slug,
      orgIntegrations: organizations.integrations,
    })
    .from(agents)
    .innerJoin(organizations, eq(organizations.id, agents.orgId))
    .where(eq(agents.id, id))
    .limit(1);

  if (!row || row.orgId !== orgId) notFound();

  const blueprint = (row.blueprint ?? {}) as AgentBlueprint;
  const greeting = blueprint.greeting ?? "Hi! How can I help you today?";
  const turnUrl = `/api/v1/public/agent/${row.orgSlug}--${row.slug}/turn`;
  const canChat = row.status === "test" || row.status === "live";

  // ─── pre-flight diagnostics ─────────────────────────────────────────────
  const diagnostics: Diagnostic[] = [];

  if (!canChat) {
    diagnostics.push({
      level: "block",
      title: `Agent is in ${row.status} status`,
      message:
        "Switch to test or live on the Overview tab to enable the sandbox.",
      actionHref: `/agents/${row.id}`,
      actionLabel: "Open Overview",
    });
  }

  const integrations = (row.orgIntegrations ?? {}) as Record<string, unknown>;
  const anthropicCfg = integrations.anthropic as
    | { apiKey?: string }
    | undefined;
  const hasAnthropicKey =
    typeof anthropicCfg?.apiKey === "string" && anthropicCfg.apiKey.length > 0;

  if (!hasAnthropicKey) {
    diagnostics.push({
      level: "block",
      title: "No Anthropic API key configured",
      message:
        "Without a key, every turn fails with an llm_not_configured error. " +
        "Add your key in Settings → Integrations → AI / LLM, or call " +
        "configure_llm_provider from Claude Code.",
      actionHref: "/settings/integrations/llm",
      actionLabel: "Add key",
    });
  }

  // v1.27.9 — daily-token-budget check removed (BYOK; SF has no cost
  // exposure to cap; operators manage spend in Anthropic dashboard).

  const hasBlocker = diagnostics.some((d) => d.level === "block");

  return (
    <div className="space-y-3">
      {diagnostics.length > 0 && (
        <div className="space-y-2">
          {diagnostics.map((d, i) => (
            <DiagnosticBanner key={i} diag={d} />
          ))}
        </div>
      )}
      {hasBlocker ? (
        <article className="rounded-xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">
            Resolve the blockers above to start chatting. The sandbox will
            light up automatically when ready.
          </p>
        </article>
      ) : (
        <TestSandboxClient
          agentName={row.name}
          turnUrl={turnUrl}
          greeting={greeting}
        />
      )}
    </div>
  );
}

function DiagnosticBanner({ diag }: { diag: Diagnostic }) {
  const tone =
    diag.level === "block"
      ? "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200"
      : diag.level === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200"
        : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200";
  const icon =
    diag.level === "block" ? "⛔" : diag.level === "warn" ? "⚠" : "✓";
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${tone}`}>
      <span aria-hidden className="text-base leading-none pt-0.5">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{diag.title}</p>
        <p className="mt-0.5 opacity-90">{diag.message}</p>
      </div>
      {diag.actionHref && diag.actionLabel && (
        <Link
          href={diag.actionHref}
          className="shrink-0 rounded-md border border-current/30 px-3 py-1 text-xs font-medium hover:bg-current/10"
        >
          {diag.actionLabel}
        </Link>
      )}
    </div>
  );
}
