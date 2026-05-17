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
import { resolveAgentKeyStatus } from "@/lib/ai/client";
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

  // v1.55 — key resolution now mirrors getAIClient: BYOK first, then the
  // platform env-var fallback. Previously this only checked BYOK and showed
  // "No key" even when production worked fine via the platform key.
  const keyStatus = await resolveAgentKeyStatus(row.orgId);

  if (keyStatus.mode === "none") {
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
  } else if (keyStatus.mode === "platform") {
    // Platform/Claude-Code key fallback is active — sandbox works, but the
    // operator should know they're on shared quota. Surface the recovery
    // path before they hit llm_credit_exhausted in front of a real prospect.
    diagnostics.push({
      level: "warn",
      title: "Using SeldonFrame's included Anthropic quota",
      message:
        "No BYOK key on this workspace — turns run on the included platform " +
        "key. If you hit llm_credit_exhausted, add your own Anthropic key in " +
        "Settings → Integrations → AI / LLM.",
      actionHref: "/settings/integrations/llm",
      actionLabel: "Add BYOK key",
    });
  }

  // v1.27.9 — daily-token-budget check removed (BYOK; SF has no cost
  // exposure to cap; operators manage spend in Anthropic dashboard).

  const hasBlocker = diagnostics.some((d) => d.level === "block");

  // 2026-05-17 — operator path mapping. The "4-step ladder" mirrors
  // how Claude Code operators ship a chatbot end-to-end. Each step is
  // either already done (LLM key configured) or has a one-click action.
  const steps: Array<{ n: number; title: string; body: string; done: boolean; cta?: { href: string; label: string } }> = [
    {
      n: 1,
      title: "Add your LLM key",
      body: keyStatus.mode === "byok"
        ? "Your Anthropic key is wired — every turn here bills to your account."
        : keyStatus.mode === "platform"
          ? "Running on SeldonFrame's included quota for now. Plug in your own Anthropic key before serving real clients."
          : "No key configured. Without one the sandbox can't run turns.",
      done: keyStatus.mode === "byok",
      cta: keyStatus.mode === "byok"
        ? undefined
        : { href: "/settings/integrations/llm", label: keyStatus.mode === "platform" ? "Add BYOK" : "Add key" },
    },
    {
      n: 2,
      title: "Test it",
      body: "Chat with the agent like a real customer. Ask edge cases — pricing, hours, emergency, unsupported services — to confirm it sounds right.",
      done: !hasBlocker,
    },
    {
      n: 3,
      title: "Run the eval suite",
      body: "8-scenario eval gates the live promotion. Needs ≥7/8 pass before you can flip status from `test` to `live`.",
      done: false,
      cta: { href: `/agents/${row.id}/evals`, label: "Open Evals" },
    },
    {
      n: 4,
      title: "Deploy to your client",
      body: "Promote to live, then paste the embed snippet into your client's existing site. The chatbot starts taking real conversations immediately.",
      done: row.status === "live",
      cta: { href: `/agents/${row.id}`, label: "Embed snippet" },
    },
  ];

  return (
    <div className="space-y-3">
      {diagnostics.length > 0 && (
        <div className="space-y-2">
          {diagnostics.map((d, i) => (
            <DiagnosticBanner key={i} diag={d} />
          ))}
        </div>
      )}

      {/* Sandbox + guidance side-by-side at desktop, stacked at mobile. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {hasBlocker ? (
            <article className="rounded-xl border bg-card p-6">
              <p className="text-sm text-muted-foreground">
                Resolve the blockers above to start chatting. The sandbox
                will light up automatically when ready.
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

        {/* 2026-05-17 — operator guidance panel. Lifts the 4-step ladder
            (key → test → eval → deploy) out of the docs so operators
            see it WHILE they're chatting with the agent, not after they
            wonder "what now?". */}
        <aside className="space-y-3">
          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Ship this chatbot in 4 steps
            </p>
            <ol className="mt-4 space-y-3">
              {steps.map((step) => (
                <li key={step.n} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      step.done
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {step.done ? "✓" : step.n}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {step.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {step.body}
                    </p>
                    {step.cta ? (
                      <Link
                        href={step.cta.href}
                        className="mt-1.5 inline-block text-[11px] font-medium text-primary underline underline-offset-2 hover:text-primary/80"
                      >
                        {step.cta.label} →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-border/70 bg-card/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Customize behavior
            </p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              This chatbot's persona, FAQs, and tools are defined in a
              Markdown skill. Edit it via the agent Settings or pull the
              source from GitHub to fork your own.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/agents/${row.id}/settings`}
                className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/15 px-2.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
              >
                Edit in Settings
              </Link>
              <a
                href="https://github.com/seldonframe/seldonframe/blob/main/packages/crm/src/agents/website-chatbot/SKILL.md"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background/40 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-background/80 hover:text-foreground"
              >
                View SKILL.md ↗
              </a>
            </div>
          </div>
        </aside>
      </div>
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
