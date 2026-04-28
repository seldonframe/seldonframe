import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Blocks, BrainCircuit, KeyRound, ShieldCheck, Sparkles, TerminalSquare, Workflow } from "lucide-react";
import { ApiDocsCodeBlock } from "@/components/docs/api-docs-code-block";

export const metadata: Metadata = {
  title: "SeldonFrame API Docs",
  description: "Public API reference for workspaces, secrets, blocks, Seldon It, Brain, and OpenClaw self-service.",
};

const liveExamples = [
  {
    title: "Create a workspace from one prompt",
    label: "curl",
    code: `curl -X POST https://app.seldonframe.com/api/v1/workspace/create \\
  -H "Content-Type: application/json" \\
  -H "x-seldon-api-key: $SELDONFRAME_API_KEY" \\
  -H "x-claude-api-key: $CLAUDE_API_KEY" \\
  -d '{
    "description": "AI coaching business for engineering leaders with booking, intake, and payment flows"
  }'`,
  },
  {
    title: "List managed workspaces",
    label: "typescript",
    code: `const response = await fetch("https://app.seldonframe.com/api/v1/workspaces", {
  headers: {
    "x-seldon-api-key": process.env.SELDONFRAME_API_KEY!,
  },
});

const payload = await response.json();
console.log(payload.workspaces);`,
  },
  {
    title: "Check Brain health",
    label: "curl",
    code: `curl https://app.seldonframe.com/api/v1/brain/health \\
  -H "x-seldon-api-key: $SELDONFRAME_API_KEY"`,
  },
  {
    title: "Invite an end-client into self-service",
    label: "curl",
    code: `curl -X POST https://app.seldonframe.com/api/v1/portal/invite \\
  -H "Content-Type: application/json" \\
  -H "x-seldon-api-key: $SELDONFRAME_API_KEY" \\
  -d '{
    "workspaceId": "ws_123",
    "contactId": "contact_456"
  }'`,
  },
] as const;

const sections = [
  {
    id: "authentication",
    eyebrow: "Access",
    title: "Authentication",
    description:
      "Seldon exposes two auth layers: builder-scoped APIs for workspace creation and orchestration, and workspace-scoped APIs for operational data access.",
    bullets: [
      "Use `x-seldon-api-key` for builder-level routes like workspace creation, managed workspace listing, self-service invites, and Brain health.",
      "Use `x-api-key` plus `x-org-id` for workspace-scoped APIs like contacts, deals, forms, submissions, and webhooks.",
      "Create personal API keys from Settings → API, and store third-party provider credentials through the secure secret flow instead of normal chat.",
    ],
    cards: [
      {
        title: "Builder key",
        meta: "Header: x-seldon-api-key",
        body: "Used for orchestration routes that operate across managed workspaces.",
      },
      {
        title: "Workspace key",
        meta: "Headers: x-org-id + x-api-key",
        body: "Used for per-workspace CRUD against contacts, deals, submissions, pages, and webhooks.",
      },
      {
        title: "Secure secret flow",
        meta: "Masked capture only",
        body: "Never paste provider secrets into chat history. Seldon stores them with envelope encryption and audit fields.",
      },
    ],
  },
  {
    id: "workspaces",
    eyebrow: "Provisioning",
    title: "Workspaces",
    description:
      "Create, enumerate, and inspect managed workspaces from a builder context. This is the fastest path from one prompt to a deployed business OS.",
    bullets: [
      "`POST /api/v1/workspace/create` accepts either a `description` or `url` plus a Claude BYOK header.",
      "`GET /api/v1/workspaces` returns the managed workspace list for the current builder.",
      "`GET /api/v1/workspace/:id` returns a normalized workspace record for one managed workspace.",
    ],
    cards: [
      {
        title: "POST /api/v1/workspace/create",
        meta: "One-text creation",
        body: "Returns `ready`, `split_required`, or `error` with dashboard and subdomain URLs when successful.",
      },
      {
        title: "GET /api/v1/workspaces",
        meta: "Managed list",
        body: "Use this to populate admin tooling, onboarding flows, or external orchestration runtimes.",
      },
      {
        title: "GET /api/v1/workspace/:id",
        meta: "Workspace detail",
        body: "Returns name, slug, subdomain, created timestamp, contact count, and ownership metadata.",
      },
    ],
  },
  {
    id: "secrets",
    eyebrow: "Security",
    title: "Secrets",
    description:
      "Secrets are managed through Seldon-hosted secure capture flows. They are never requested in normal chat, never logged in plaintext, and stored encrypted at rest.",
    bullets: [
      "`store_secret` opens a dedicated masked capture flow and stores an encrypted workspace-scoped secret.",
      "`list_secrets` returns metadata only: service name, fingerprint, key version, timestamps, and audit state.",
      "`rotate_secret` invalidates the prior value and triggers a fresh secure capture flow.",
    ],
    cards: [
      {
        title: "store_secret",
        meta: "Secure input only",
        body: "Use for provider keys like Resend, Stripe, OpenAI, Anthropic, Twilio, and newsletter integrations.",
      },
      {
        title: "list_secrets",
        meta: "Metadata only",
        body: "Safe to surface inside Claude Code or OpenClaw because plaintext values never leave secure storage.",
      },
      {
        title: "rotate_secret",
        meta: "Operational hygiene",
        body: "Rotate credentials without exposing history and keep clear auditability for production workspaces.",
      },
    ],
  },
  {
    id: "blocks",
    eyebrow: "Composable product surface",
    title: "Blocks & Skills",
    description:
      "Seldon treats pages, marketplace packages, and workflow blocks as composable primitives. You can list marketplace listings, publish new packages, and update page blocks over HTTP.",
    bullets: [
      "`GET /api/v1/marketplace/listings` lists the current workspace's creator listings.",
      "`POST /api/v1/marketplace/listings` creates a new listing package from a soul package payload.",
      "`GET /api/v1/pages/:pageId` and `PUT /api/v1/pages/:pageId` let you inspect or update rendered landing/page blocks.",
    ],
    cards: [
      {
        title: "GET /api/v1/marketplace/listings",
        meta: "List blocks",
        body: "Use this in builder tooling to show what skills or packages already exist for the current organization.",
      },
      {
        title: "POST /api/v1/marketplace/listings",
        meta: "Create block package",
        body: "Accepts listing metadata plus a soul package payload for marketplace-ready packaging.",
      },
      {
        title: "PUT /api/v1/pages/:pageId",
        meta: "Update page block",
        body: "Apply edits to a concrete page resource while keeping the surrounding CRM shell intact.",
      },
    ],
  },
  {
    id: "seldon-it",
    eyebrow: "Natural language orchestration",
    title: "Seldon It",
    description:
      "Seldon It is the natural-language control plane for scoped changes. In HTTP flows, the end-client self-service route is the public natural-language endpoint; builder-mode orchestration is also available inside Claude Code and the dashboard.",
    bullets: [
      "`POST /api/v1/portal/self-service` accepts `orgSlug`, `description`, `portalToken`, and an optional `sessionId`.",
      "Responses include `message`, `results`, `cards`, `suggestions`, and calm progress guidance for agentic clients.",
      "Result cards standardize actions like Apply, Edit, Undo, and View live preview.",
    ],
    cards: [
      {
        title: "POST /api/v1/portal/self-service",
        meta: "Scoped natural language",
        body: "Send plain English and receive structured cards plus a persisted session id for follow-up requests.",
      },
      {
        title: "Cards response",
        meta: "Agent friendly",
        body: "Each response card includes a summary, preview URL, and deterministic actions for UI or bot rendering.",
      },
      {
        title: "Progress cadence",
        meta: "15–20 seconds",
        body: "Long-running clients like OpenClaw should surface one calm update roughly every 18 seconds.",
      },
    ],
  },
  {
    id: "brain",
    eyebrow: "Context and system intelligence",
    title: "Brain",
    description:
      "Brain endpoints let you pull workspace intelligence and operational health without exposing internal-only ops routes.",
    bullets: [
      "`GET /api/v1/brain/health` returns the current compiled Brain health summary for authenticated builders.",
      "`GET /api/v1/soul/wiki` returns current workspace Brain/wiki articles.",
      "`POST /api/v1/soul/wiki` recompiles the workspace wiki so external workflows can refresh insights on demand.",
    ],
    cards: [
      {
        title: "GET /api/v1/brain/health",
        meta: "Health summary",
        body: "Use this for dashboards, monitors, and reliability checks around the Brain compilation system.",
      },
      {
        title: "GET /api/v1/soul/wiki",
        meta: "Query insights",
        body: "Pull the current workspace's compiled articles and memory-like summaries.",
      },
      {
        title: "POST /api/v1/soul/wiki",
        meta: "Refresh context",
        body: "Trigger a recompile when your workflow needs fresh knowledge before automation or generation.",
      },
    ],
  },
  {
    id: "openclaw",
    eyebrow: "Agent-native customer ops",
    title: "OpenClaw Self-Service",
    description:
      "The Operator and Agency tiers unlock end-client onboarding via OpenClaw using signed portal magic links and fully scoped `end_client_mode: true` execution.",
    bullets: [
      "Enable the self-service tier for a workspace, then call `POST /api/v1/portal/invite` with a managed workspace and contact.",
      "Share the returned `invite_url` with the client. The route issues a signed magic link and a scoped `portal_token`.",
      "Pass that token into `POST /api/v1/portal/self-service` to keep every request client-scoped.",
    ],
    cards: [
      {
        title: "POST /api/v1/portal/invite",
        meta: "Magic-link onboarding",
        body: "Returns invite URL, portal token, expiry time, and onboarding metadata for end-client setup.",
      },
      {
        title: "end_client_mode: true",
        meta: "Always scoped",
        body: "Client actions are isolated to the invited workspace and contact context. No cross-client bleed.",
      },
      {
        title: "OpenClaw cards",
        meta: "Premium UX",
        body: "Return structured cards plus calm progress messages so mobile/agent flows feel deterministic and polished.",
      },
    ],
  },
] as const;

function SectionCard({ title, meta, body }: { title: string; meta: string; body: string }) {
  return (
    <article className="rounded-2xl border border-zinc-800/90 bg-zinc-950/65 p-4 shadow-(--shadow-xs)">
      <p className="text-sm font-medium text-zinc-100">{title}</p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-teal-300/80">{meta}</p>
      <p className="mt-3 text-sm leading-6 text-zinc-400">{body}</p>
    </article>
  );
}

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="overflow-hidden rounded-[28px] border border-zinc-800/90 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.14),transparent_24%),linear-gradient(180deg,rgba(24,24,27,0.92),rgba(10,10,10,0.96))] shadow-(--shadow-card)">
          <div className="flex flex-col gap-6 px-6 py-8 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:px-10 lg:py-10">
            <div className="max-w-3xl space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-500/20 bg-teal-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-200">
                <TerminalSquare className="size-3.5" />
                Public API Reference
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl lg:text-[2.8rem]">
                  SeldonFrame for developers, agents, and infrastructure teams.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
                  Provision workspaces, manage encrypted secrets, ship blocks, query Brain context, and enable OpenClaw self-service from a clean, server-rendered API surface.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/65 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Auth</p>
                  <p className="mt-2 text-sm text-zinc-200">Builder keys, workspace keys, and secure secret capture.</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/65 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Natural language</p>
                  <p className="mt-2 text-sm text-zinc-200">Seldon It responses return structured cards with deterministic actions.</p>
                </div>
                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/65 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Secure by default</p>
                  <p className="mt-2 text-sm text-zinc-200">Secrets are envelope encrypted and never requested in normal chat history.</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/login" className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 text-sm font-medium text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-900">
                Open dashboard
              </Link>
              <Link href="/pricing" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-500 px-4 text-sm font-medium text-black transition hover:bg-teal-400">
                View pricing
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800/90 bg-[#0a0a0a] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-300/80">Heads up</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Builder routes use `x-seldon-api-key`. Workspace CRUD routes typically use `x-org-id` and `x-api-key`.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr),360px]">
          <section className="min-w-0 space-y-5">
            <div className="grid gap-3 md:hidden">
              {liveExamples.map((example) => (
                <ApiDocsCodeBlock key={example.title} title={example.title} label={example.label} code={example.code} />
              ))}
            </div>

            {sections.map((section) => (
              <article key={section.id} id={section.id} className="scroll-mt-24 rounded-[28px] border border-zinc-800/90 bg-zinc-950/70 p-6 shadow-(--shadow-xs) sm:p-7">
                <div className="flex flex-col gap-4 border-b border-zinc-800/80 pb-5">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                    {section.id === "authentication" ? <KeyRound className="size-3.5 text-teal-300" /> : null}
                    {section.id === "workspaces" ? <Workflow className="size-3.5 text-teal-300" /> : null}
                    {section.id === "secrets" ? <ShieldCheck className="size-3.5 text-teal-300" /> : null}
                    {section.id === "blocks" ? <Blocks className="size-3.5 text-teal-300" /> : null}
                    {section.id === "seldon-it" ? <Sparkles className="size-3.5 text-teal-300" /> : null}
                    {section.id === "brain" ? <BrainCircuit className="size-3.5 text-teal-300" /> : null}
                    {section.id === "openclaw" ? <TerminalSquare className="size-3.5 text-teal-300" /> : null}
                    {section.eyebrow}
                  </div>
                  <div className="space-y-3">
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">{section.title}</h2>
                    <p className="max-w-3xl text-sm leading-7 text-zinc-400 sm:text-base">{section.description}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1fr),320px]">
                  <div className="space-y-4">
                    <ul className="space-y-3">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-3 text-sm leading-7 text-zinc-300">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-300" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-2xl border border-zinc-800/90 bg-[#0a0a0a] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Why it matters</p>
                    <p className="mt-3 text-sm leading-7 text-zinc-400">
                      This section is designed for direct agent, Zapier, Make, and custom app integrations without losing SeldonFrame&apos;s premium UX or workspace isolation model.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {section.cards.map((card) => (
                    <SectionCard key={card.title} title={card.title} meta={card.meta} body={card.body} />
                  ))}
                </div>
              </article>
            ))}
          </section>

          <aside className="hidden xl:block">
            <div className="sticky top-6 max-h-[calc(100vh-3rem)] space-y-4 overflow-y-auto pr-1">
              {liveExamples.map((example) => (
                <ApiDocsCodeBlock key={example.title} title={example.title} label={example.label} code={example.code} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
