"use client";

// ICP-3 — the Deploy-to-client stepper (client).
//
// 4 steps:
//   1. Confirm the agent — a single card for the route's [id] (the one the
//      builder clicked Deploy on). To deploy a different agent, go back to the
//      Studio; step 1 is confirm-only, not a roster picker.
//   2. Client details — name (required) + contact. "Connect their calendar" and
//      "Phone number" are shown as captured INTENT only, labeled "SeldonFrame
//      provisions on activation". We do NOT call cal.diy or Twilio here.
//   3. Surface (phone | embed | link) + price ($/mo) + a LIVE margin readout
//      (computeDeploymentMargin — display estimate, nothing billed).
//   4. Review → "Deploy" → createDeploymentAction writes a DRAFT row → an honest
//      success state ("provisioning + billing activate when you connect Twilio +
//      Stripe") with a link to the Clients screen.
//
// All money math is the pure helpers in lib/deployments/margin.ts. No live LLM,
// no Twilio, no Stripe.

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  CalendarClock,
  Phone,
  Code2,
  LinkIcon,
  Rocket,
  Sparkles,
  Plus,
  X,
  ChevronDown,
  MessageSquare,
  Mail,
  Building2,
  UserPlus,
} from "lucide-react";
import {
  createDeploymentAction,
  generateClientContextAction,
} from "@/lib/deployments/actions";
import type { DeploymentClientContext } from "@/db/schema/deployments";
import {
  BOOKING_PROVIDERS,
  type BookingMode,
} from "@/lib/deployments/booking-providers";
import {
  computeDeploymentMargin,
  formatCentsMonthly,
  DEFAULT_SELDONFRAME_FEE_PCT,
  DEFAULT_TELEPHONY_CENTS,
  DEFAULT_LLM_CENTS,
} from "@/lib/deployments/margin";
import { formatTemplateType } from "../../status-badge";

type TemplateOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type Surface = "phone" | "embed" | "link" | "sms" | "email";

/** An EXISTING client the builder can attach this new agent to (F3) — instead of
 *  creating a fresh client (which used to spawn a duplicate "Acme Plumbing" on a
 *  2nd deploy). Derived server-side from the builder's deployments, grouped by
 *  clientOrgId, so each carries the client's existing line + the agents on it. */
type ExistingClient = {
  clientOrgId: string;
  clientName: string;
  phoneNumber: string | null;
  agentNames: string[];
};

/** Editable row shapes for the optional "Client's business" capture. Kept as
 *  flat strings so the inputs are trivially controlled; assembled into the
 *  typed DeploymentClientContext (dropping blanks) only at submit time. */
type ServiceRow = { name: string; description: string };
type FaqRow = { q: string; a: string };

type Props = {
  templates: TemplateOption[];
  initialTemplateId: string;
  /** The agency's existing clients (attach targets). Empty → only "New client"
   *  is offered (no existing clients to attach to yet). */
  existingClients?: ExistingClient[];
};

/** Assemble the editable rows into a DeploymentClientContext, dropping blank
 *  entries. Returns undefined when nothing usable was entered (so the deploy
 *  call omits clientContext and the agent falls back to name-only). Pure. */
function assembleClientContext(input: {
  description: string;
  services: ServiceRow[];
  faq: FaqRow[];
}): DeploymentClientContext | undefined {
  const soul: NonNullable<DeploymentClientContext["soul"]> = {};
  const description = input.description.trim();
  if (description) soul.businessDescription = description;

  const services = input.services
    .map((s) => {
      const name = s.name.trim();
      if (!name) return null;
      const d = s.description.trim();
      return d ? { name, description: d } : { name };
    })
    .filter((s): s is { name: string; description?: string } => s !== null);
  if (services.length > 0) soul.services = services;

  const faq = input.faq
    .map((f) => {
      const q = f.q.trim();
      const a = f.a.trim();
      return q && a ? { q, a } : null;
    })
    .filter((f): f is { q: string; a: string } => f !== null);

  const out: DeploymentClientContext = {};
  if (Object.keys(soul).length > 0) out.soul = soul;
  if (faq.length > 0) out.faq = faq;
  return Object.keys(out).length > 0 ? out : undefined;
}

const STEPS = [
  { id: 1, label: "Agent" },
  { id: 2, label: "Client" },
  { id: 3, label: "Pricing" },
  { id: 4, label: "Review" },
] as const;

const SURFACES: Array<{
  id: Surface;
  label: string;
  hint: string;
  icon: typeof Phone;
}> = [
  { id: "phone", label: "Phone", hint: "A dedicated phone number answers calls.", icon: Phone },
  { id: "embed", label: "Embed", hint: "A chat widget on the client's website.", icon: Code2 },
  { id: "link", label: "Link", hint: "A shareable hosted chat link.", icon: LinkIcon },
  // Text surfaces (#1) — routed through the multi-surface agent loop. These carry
  // the template's MCP connectors on the deployed agent (voice does not).
  { id: "sms", label: "SMS", hint: "Texts to the agent's number, answered by chat.", icon: MessageSquare },
  { id: "email", label: "Email", hint: "Inbound email, answered by the same agent.", icon: Mail },
];

export function DeployFlowClient({
  templates,
  initialTemplateId,
  existingClients = [],
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — agent. Fixed to the route's [id]: you're deploying the agent you
  // clicked Deploy on, so step 1 just confirms it (no roster, no switcher).
  const templateId = initialTemplateId;

  // Step 2 — NEW client vs. ATTACH to an existing one (F3). Defaults to "new"
  // (today's behavior). "existing" reveals the client picker and attaches the new
  // agent to that client's workspace — no duplicate client, no second number.
  const hasExistingClients = existingClients.length > 0;
  const [clientMode, setClientMode] = useState<"new" | "existing">("new");
  const [existingClientOrgId, setExistingClientOrgId] = useState<string>(
    existingClients[0]?.clientOrgId ?? "",
  );
  const selectedExistingClient = useMemo(
    () => existingClients.find((c) => c.clientOrgId === existingClientOrgId) ?? null,
    [existingClients, existingClientOrgId],
  );

  // Step 2 — client details
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // Step 2 — the CLIENT's business context (optional). Lets the deployed agent
  // speak AS the client (their services + FAQ), not just name them. Entirely
  // optional: left blank → today's name-only behavior.
  const [bizOpen, setBizOpen] = useState(false);
  const [bizSource, setBizSource] = useState(""); // pasted website text / description
  const [bizDescription, setBizDescription] = useState("");
  const [bizServices, setBizServices] = useState<ServiceRow[]>([]);
  const [bizFaq, setBizFaq] = useState<FaqRow[]>([]);
  const [isAutofilling, startAutofill] = useTransition();
  const [autofillError, setAutofillError] = useState<string | null>(null);

  // Step 3 — surface + price
  const [surface, setSurface] = useState<Surface>("phone");
  // Price the SMB pays, as a dollars string for the input. Default $99/mo.
  const [priceDollars, setPriceDollars] = useState("99");

  // Step 3 — how the deployed agent books (ICP-3). Default 'native' (zero setup).
  // 'external_link' reveals a required URL; the coming-soon modes aren't selectable.
  const [bookingMode, setBookingMode] = useState<BookingMode>("native");
  const [externalBookingUrl, setExternalBookingUrl] = useState("");

  // Step 4 — submit
  const [isDeploying, startDeploy] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deployedId, setDeployedId] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  const priceCents = useMemo(() => {
    const n = Number.parseFloat(priceDollars);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
  }, [priceDollars]);

  const margin = useMemo(() => computeDeploymentMargin({ priceCents }), [priceCents]);

  // external_link is the only mode that needs a URL — and it must look like one.
  const externalUrlValid = useMemo(() => {
    const v = externalBookingUrl.trim();
    if (!v) return false;
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [externalBookingUrl]);

  const bookingValid = bookingMode !== "external_link" || externalUrlValid;

  // Attaching to an existing client (F3): valid once a client is selected — no
  // typed name needed (we reuse the existing client's name + workspace).
  const attaching = clientMode === "existing" && hasExistingClients;
  // The name the deploy sends: a NEW client uses the typed field; an ATTACH reuses
  // the selected client's existing name (the store still requires ≥2 chars).
  const effectiveClientName = attaching
    ? (selectedExistingClient?.clientName.trim() ?? "")
    : clientName.trim();
  // Step 2 is satisfied by EITHER a typed new-client name OR a selected client.
  const clientStepValid = attaching
    ? !!selectedExistingClient
    : clientName.trim().length >= 2;

  const canSubmit =
    clientStepValid && effectiveClientName.length >= 2 && !!templateId && bookingValid;

  // Auto-fill the client's business from pasted website text / a description.
  // Compiles it server-side, then PRE-FILLS the editable rows (the builder can
  // still hand-edit everything before deploying).
  const runAutofill = () => {
    setAutofillError(null);
    startAutofill(async () => {
      const result = await generateClientContextAction({ description: bizSource });
      if (!result.ok) {
        setAutofillError(
          result.error === "empty"
            ? "Paste a few sentences about the client first."
            : result.error === "no_key"
              ? "Connect your Claude API key in Settings to auto-fill."
              : "Couldn't read that — add the services and FAQ by hand below.",
        );
        return;
      }
      const ctx = result.clientContext;
      if (ctx.soul?.businessDescription) setBizDescription(ctx.soul.businessDescription);
      setBizServices(
        (ctx.soul?.services ?? []).map((s) => ({
          name: s.name,
          description: s.description ?? "",
        })),
      );
      setBizFaq((ctx.faq ?? []).map((f) => ({ q: f.q, a: f.a })));
    });
  };

  const deploy = () => {
    setError(null);
    startDeploy(async () => {
      const clientContext = assembleClientContext({
        description: bizDescription,
        services: bizServices,
        faq: bizFaq,
      });
      const result = await createDeploymentAction({
        agentTemplateId: templateId,
        // ATTACH reuses the selected client's name; NEW uses the typed field.
        clientName: effectiveClientName,
        // Contact is only captured for a NEW client — an existing client already
        // has its contact + soul on its workspace (we don't overwrite them).
        clientContact: attaching
          ? undefined
          : {
              phone: clientPhone.trim() || undefined,
              email: clientEmail.trim() || undefined,
            },
        clientContext,
        surface,
        priceCents,
        bookingMode,
        // Only send the URL for external_link; other modes ignore it (the
        // store/schema also drop a stray URL, this just keeps the payload clean).
        externalBookingUrl:
          bookingMode === "external_link" ? externalBookingUrl.trim() : undefined,
        // F3 — attach this agent to the chosen EXISTING client (its workspace /
        // soul / number are reused; no duplicate client, no second number bought).
        existingClientOrgId: attaching ? existingClientOrgId : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeployedId(result.id);
    });
  };

  // ── success state ──────────────────────────────────────────────────
  if (deployedId) {
    return (
      <article className="rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto max-w-md space-y-4">
          <span
            className="mx-auto inline-flex size-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            aria-hidden
          >
            <Check className="size-6" />
          </span>
          <h2 className="text-lg font-semibold">
            Agent saved for {effectiveClientName}.
          </h2>
          <p className="text-sm text-muted-foreground">
            {attaching ? (
              <>
                This agent joins your existing client — it shares their workspace
                and number, so nothing new is provisioned. It sits as a draft
                until you activate it.
              </>
            ) : (
              <>
                Provisioning the number and billing activates when you connect
                Twilio and Stripe. Until then this client sits in your book as a
                draft — nothing is live and no one is charged yet.
              </>
            )}
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link href="/studio/clients" className="crm-button-primary h-10 px-5 text-sm">
              Go to Clients
            </Link>
            <Link
              href={`/studio/agents/${templateId}`}
              className="crm-button-secondary h-10 px-5 text-sm"
            >
              Back to agent
            </Link>
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className="space-y-5">
      <StepBar current={step} />

      {/* ── Step 1: Agent ─────────────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-card-title">Which agent?</h2>
            <p className="text-xs text-muted-foreground">
              This is the agent you&apos;re deploying.
            </p>
          </div>
          {/* Single confirmation card for the route's [id] — NOT the full roster.
              The deployment always targets this agent; to deploy a different one,
              the builder goes back to the Studio (secondary link below). */}
          <div className="flex w-full items-center gap-3 rounded-lg border border-primary bg-primary/5 p-4">
            <span
              className="inline-flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
              aria-hidden
            >
              <Bot className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                You&apos;re deploying
              </span>
              <span className="block truncate text-sm font-medium">
                {selectedTemplate?.name ?? "this agent"}
              </span>
              {selectedTemplate && (
                <span className="block text-xs text-muted-foreground">
                  {formatTemplateType(selectedTemplate.type)}
                </span>
              )}
            </span>
            <Check className="size-4 text-primary" aria-hidden />
          </div>
          <Link
            href="/studio/agents"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Deploy a different agent
            <span aria-hidden>→</span>
          </Link>
          <StepNav
            onNext={() => setStep(2)}
            nextDisabled={!templateId}
          />
        </div>
      )}

      {/* ── Step 2: Client details ────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div>
            <h2 className="text-card-title">Client details</h2>
            <p className="text-xs text-muted-foreground">
              {attaching
                ? "Attach this agent to one of your existing clients — it joins their workspace and shares their number."
                : "Who is this agent for? They never log into SeldonFrame — this is your record of the client."}
            </p>
          </div>

          {/* ── NEW client vs. ATTACH to an existing one (F3) ── */}
          {hasExistingClients && (
            <div
              role="radiogroup"
              aria-label="New or existing client"
              className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            >
              <ClientModeCard
                active={clientMode === "new"}
                icon={UserPlus}
                title="New client"
                hint="Create a fresh client for this agent."
                onSelect={() => setClientMode("new")}
              />
              <ClientModeCard
                active={attaching}
                icon={Building2}
                title="Existing client"
                hint="Add this agent to a client you already serve."
                onSelect={() => setClientMode("existing")}
              />
            </div>
          )}

          {/* ── ATTACH: pick the existing client ── */}
          {attaching ? (
            <div className="space-y-3">
              <Field label="Client" required>
                <select
                  value={existingClientOrgId}
                  onChange={(e) => setExistingClientOrgId(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {existingClients.map((c) => (
                    <option key={c.clientOrgId} value={c.clientOrgId}>
                      {c.clientName}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedExistingClient && (
                <div className="space-y-1.5 rounded-lg border bg-muted/30 p-4 text-sm">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="size-4" aria-hidden />
                    <span>
                      {selectedExistingClient.phoneNumber
                        ? `Shares the client's number ${selectedExistingClient.phoneNumber} — no new number is provisioned.`
                        : "Sends from the client's number — no new number is provisioned."}
                    </span>
                  </div>
                  {selectedExistingClient.agentNames.length > 0 && (
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <Bot className="mt-0.5 size-4" aria-hidden />
                      <span>
                        Already running:{" "}
                        <span className="text-foreground">
                          {selectedExistingClient.agentNames.join(" · ")}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
          <div className="space-y-3">
            <Field label="Client name" required>
              <input
                type="text"
                autoFocus
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Acme Plumbing"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contact phone">
                <input
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Contact email">
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="owner@acme.com"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
          </div>

          {/* ── Optional: the CLIENT's business (makes the agent speak as them) ── */}
          <div className="rounded-lg border bg-background">
            <button
              type="button"
              onClick={() => setBizOpen((v) => !v)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left"
              aria-expanded={bizOpen}
            >
              <span className="inline-flex size-7 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" aria-hidden>
                <Sparkles className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  Client&apos;s business{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  Makes the agent speak as them — their services &amp; FAQ, not generic.
                </span>
              </span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${bizOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>

            {bizOpen && (
              <div className="space-y-4 border-t px-4 py-4">
                {/* Source text + Auto-fill */}
                <Field label="Paste their website text or describe their services & hours">
                  <textarea
                    value={bizSource}
                    onChange={(e) => setBizSource(e.target.value)}
                    rows={4}
                    placeholder="e.g. Acme Plumbing is a family-owned shop in Austin. We do drain cleaning, water heater installs, and 24/7 emergency calls. Open Mon–Sat 7am–6pm…"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </Field>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={runAutofill}
                    disabled={isAutofilling || bizSource.trim().length === 0}
                    className="crm-button-secondary inline-flex h-9 items-center gap-1.5 px-4 text-sm"
                  >
                    <Sparkles className="size-4" />
                    {isAutofilling ? "Reading…" : "Auto-fill"}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Fills the fields below — edit anything before you deploy.
                  </span>
                </div>
                {autofillError && (
                  <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                    {autofillError}
                  </p>
                )}

                {/* Description */}
                <Field label="One-line description (optional)">
                  <input
                    type="text"
                    value={bizDescription}
                    onChange={(e) => setBizDescription(e.target.value)}
                    placeholder="Family-owned plumbing serving greater Austin."
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </Field>

                {/* Services */}
                <RowEditor
                  legend="Services"
                  addLabel="Add service"
                  emptyHint="No services yet — add the work this client does so the agent can describe it."
                  rows={bizServices}
                  onAdd={() => setBizServices((r) => [...r, { name: "", description: "" }])}
                  onRemove={(i) => setBizServices((r) => r.filter((_, idx) => idx !== i))}
                  renderRow={(row, i) => (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                      <input
                        type="text"
                        value={row.name}
                        onChange={(e) =>
                          setBizServices((r) =>
                            r.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="Service name"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      <input
                        type="text"
                        value={row.description}
                        onChange={(e) =>
                          setBizServices((r) =>
                            r.map((x, idx) => (idx === i ? { ...x, description: e.target.value } : x)),
                          )
                        }
                        placeholder="Short description (optional)"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  )}
                />

                {/* FAQ */}
                <RowEditor
                  legend="FAQ"
                  addLabel="Add question"
                  emptyHint="No FAQ yet — add common questions so the agent answers in the client's words."
                  rows={bizFaq}
                  onAdd={() => setBizFaq((r) => [...r, { q: "", a: "" }])}
                  onRemove={(i) => setBizFaq((r) => r.filter((_, idx) => idx !== i))}
                  renderRow={(row, i) => (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={row.q}
                        onChange={(e) =>
                          setBizFaq((r) => r.map((x, idx) => (idx === i ? { ...x, q: e.target.value } : x)))
                        }
                        placeholder="Question"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                      <textarea
                        value={row.a}
                        onChange={(e) =>
                          setBizFaq((r) => r.map((x, idx) => (idx === i ? { ...x, a: e.target.value } : x)))
                        }
                        rows={2}
                        placeholder="Answer"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                      />
                    </div>
                  )}
                />
              </div>
            )}
          </div>

          {/* Captured-intent rows — NOT provisioned now. */}
          <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-4">
            <PendingRow
              icon={CalendarClock}
              title="Connect their calendar (cal.diy)"
              note="SeldonFrame provisions on activation"
            />
            <PendingRow
              icon={Phone}
              title="Phone number"
              note="SeldonFrame provisions on activation"
            />
          </div>
            </>
          )}

          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextDisabled={!clientStepValid}
          />
        </div>
      )}

      {/* ── Step 3: Surface + price + margin readout ──────────────── */}
      {step === 3 && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-card-title">How they reach the agent</h2>
            <p className="text-xs text-muted-foreground">
              Pick the surface and what this client pays you each month.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {SURFACES.map((s) => {
              const active = s.id === surface;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSurface(s.id)}
                  className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                    active ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50"
                  }`}
                  aria-pressed={active}
                >
                  <Icon className="size-5 text-indigo-500 dark:text-indigo-400" aria-hidden />
                  <span className="text-sm font-medium">{s.label}</span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </button>
              );
            })}
          </div>

          <Field label="What the client pays (per month)">
            <div className="relative max-w-[12rem]">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                $
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                className="w-full rounded-md border bg-background py-2 pl-7 pr-12 text-sm focus:border-primary focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                /mo
              </span>
            </div>
          </Field>

          <MarginReadout priceCents={priceCents} margin={margin} />

          {/* ── How should this agent book? (ICP-3 calendar-provider chooser) ── */}
          <div className="space-y-3 border-t pt-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                How should this agent book?
              </h3>
              <p className="text-xs text-muted-foreground">
                Pick the calendar the agent books into. You can change this later.
              </p>
            </div>
            <BookingModeChooser
              value={bookingMode}
              onSelect={setBookingMode}
              externalBookingUrl={externalBookingUrl}
              onExternalUrlChange={setExternalBookingUrl}
              externalUrlValid={externalUrlValid}
            />
          </div>

          <StepNav
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextDisabled={!bookingValid}
          />
        </div>
      )}

      {/* ── Step 4: Review ────────────────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-card-title">Review</h2>
            <p className="text-xs text-muted-foreground">
              {attaching
                ? "We'll add this agent to your existing client as a draft — sharing their workspace and number. Nothing new is provisioned."
                : "We'll save this client as a draft. The number and billing activate later, when you connect Twilio and Stripe."}
            </p>
          </div>

          <dl className="divide-y rounded-lg border bg-background text-sm">
            <ReviewRow label="Agent" value={selectedTemplate?.name ?? "—"} />
            <ReviewRow
              label="Client"
              value={
                attaching
                  ? `${effectiveClientName || "—"} (existing)`
                  : clientName.trim() || "—"
              }
            />
            {attaching ? (
              <ReviewRow
                label="Number"
                value={
                  selectedExistingClient?.phoneNumber
                    ? `${selectedExistingClient.phoneNumber} (shared)`
                    : "Shares the client's number"
                }
              />
            ) : (
              <ReviewRow
                label="Contact"
                value={[clientPhone.trim(), clientEmail.trim()].filter(Boolean).join(" · ") || "—"}
              />
            )}
            <ReviewRow label="Surface" value={SURFACES.find((s) => s.id === surface)?.label ?? surface} />
            <ReviewRow
              label="Booking"
              value={
                BOOKING_PROVIDERS.find((p) => p.id === bookingMode)?.label ?? bookingMode
              }
            />
            {bookingMode === "external_link" && externalBookingUrl.trim() && (
              <ReviewRow label="Booking link" value={externalBookingUrl.trim()} />
            )}
            <ReviewRow label="Price" value={formatCentsMonthly(priceCents)} />
            <ReviewRow label="Your estimated net" value={formatCentsMonthly(margin.netCents)} />
            <ReviewRow label="Status on save" value="Draft (pending activation)" />
          </dl>

          {error && (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-600">
              Couldn&apos;t deploy: {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={isDeploying}
              className="crm-button-secondary h-10 px-5 text-sm"
            >
              Back
            </button>
            <button
              type="button"
              onClick={deploy}
              disabled={isDeploying || !canSubmit}
              className="crm-button-primary inline-flex h-10 items-center gap-1.5 px-5 text-sm"
            >
              <Rocket className="size-4" />
              {isDeploying ? "Saving…" : "Deploy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── sub-components ────────────────────────────────────────────────────

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const done = s.id < current;
        const active = s.id === current;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3.5" /> : s.id}
            </span>
            <span className={active ? "font-medium text-foreground" : "text-muted-foreground"}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function StepNav({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-1">
      {onBack && (
        <button type="button" onClick={onBack} className="crm-button-secondary h-10 px-5 text-sm">
          Back
        </button>
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="crm-button-primary h-10 px-5 text-sm"
      >
        Continue
      </button>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function RowEditor<T>({
  legend,
  addLabel,
  emptyHint,
  rows,
  onAdd,
  onRemove,
  renderRow,
}: {
  legend: string;
  addLabel: string;
  emptyHint: string;
  rows: T[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderRow: (row: T, index: number) => React.ReactNode;
}) {
  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between">
        <legend className="text-xs font-medium text-foreground">{legend}</legend>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50"
        >
          <Plus className="size-3.5" />
          {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border bg-muted/20 p-2.5">
              <div className="min-w-0 flex-1">{renderRow(row, i)}</div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`Remove ${legend} ${i + 1}`}
                className="mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function PendingRow({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof Phone;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex size-8 items-center justify-center rounded-md bg-background text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-sm">{title}</span>
      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
        {note}
      </span>
    </div>
  );
}

/** A selectable "New client" / "Existing client" mode card (F3). Mirrors the
 *  surface/booking selector cards: active = primary border + tint. */
function ClientModeCard({
  active,
  icon: Icon,
  title,
  hint,
  onSelect,
}: {
  active: boolean;
  icon: typeof Phone;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
        active ? "border-primary bg-primary/5" : "bg-background hover:bg-muted/50"
      }`}
    >
      <span className="flex w-full items-center gap-2">
        <Icon className="size-5 text-indigo-500 dark:text-indigo-400" aria-hidden />
        <span className="text-sm font-medium">{title}</span>
        {active && <Check className="ml-auto size-4 text-primary" aria-hidden />}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

/** The "How should this agent book?" chooser. Renders the BOOKING_PROVIDERS
 *  registry: available modes are selectable cards; coming-soon modes render
 *  disabled with a "Coming soon" pill. Selecting external_link reveals a required
 *  booking-URL input with inline validation. */
function BookingModeChooser({
  value,
  onSelect,
  externalBookingUrl,
  onExternalUrlChange,
  externalUrlValid,
}: {
  value: BookingMode;
  onSelect: (mode: BookingMode) => void;
  externalBookingUrl: string;
  onExternalUrlChange: (v: string) => void;
  externalUrlValid: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {BOOKING_PROVIDERS.map((p) => {
          const comingSoon = p.status === "coming_soon";
          const active = p.id === value;
          return (
            <button
              key={p.id}
              type="button"
              disabled={comingSoon}
              aria-pressed={active}
              onClick={() => !comingSoon && onSelect(p.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors ${
                comingSoon
                  ? "cursor-not-allowed border-dashed bg-muted/20 opacity-70"
                  : active
                    ? "border-primary bg-primary/5"
                    : "bg-background hover:bg-muted/50"
              }`}
            >
              <span className="flex w-full items-center gap-2">
                <span className="text-sm font-medium">{p.label}</span>
                {comingSoon ? (
                  <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Coming soon
                  </span>
                ) : (
                  active && <Check className="ml-auto size-4 text-primary" aria-hidden />
                )}
              </span>
              <span className="text-xs text-muted-foreground">{p.description}</span>
            </button>
          );
        })}
      </div>

      {value === "api_mcp" && (
        <p className="rounded-lg border border-dashed bg-muted/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <CalendarClock className="mb-0.5 mr-1 inline size-3.5 text-indigo-500 dark:text-indigo-400" />
          You&apos;ll connect the client&apos;s Google/Outlook calendar from the
          Clients screen after you deploy.
        </p>
      )}

      {value === "external_link" && (
        <div className="rounded-lg border bg-background p-4">
          <Field label="Their booking link" required>
            <input
              type="url"
              inputMode="url"
              value={externalBookingUrl}
              onChange={(e) => onExternalUrlChange(e.target.value)}
              placeholder="https://calendly.com/their-business"
              aria-invalid={externalBookingUrl.trim().length > 0 && !externalUrlValid}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </Field>
          {externalBookingUrl.trim().length > 0 && !externalUrlValid && (
            <p className="mt-1.5 text-xs text-rose-600">
              Enter a full URL starting with http:// or https://
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            The agent captures the caller, then shares this link instead of booking
            into SeldonFrame.
          </p>
        </div>
      )}
    </div>
  );
}

function MarginReadout({
  priceCents,
  margin,
}: {
  priceCents: number;
  margin: { feeCents: number; netCents: number };
}) {
  const feePctLabel = `${Math.round(DEFAULT_SELDONFRAME_FEE_PCT * 100)}%`;
  const netNegative = margin.netCents < 0;
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="space-y-1.5 text-sm">
        <MarginLine label="You charge" value={formatCentsMonthly(priceCents)} />
        <MarginLine
          label={`− SeldonFrame fee (${feePctLabel})`}
          value={`− ${formatCentsMonthly(margin.feeCents)}`}
          muted
        />
        <MarginLine
          label="− Telephony (est.)"
          value={`− ${formatCentsMonthly(DEFAULT_TELEPHONY_CENTS)}`}
          muted
        />
        <MarginLine
          label="− LLM (est., your key)"
          value={`− ${formatCentsMonthly(DEFAULT_LLM_CENTS)}`}
          muted
        />
        <div className="my-1 border-t" />
        <MarginLine
          label="= Your net"
          value={formatCentsMonthly(margin.netCents)}
          strong
          tone={netNegative ? "negative" : "positive"}
        />
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Telephony and LLM are estimates for this readout — actual costs are
        metered when the deployment goes live on Twilio + your LLM key. Nothing
        is billed now.
      </p>
    </div>
  );
}

function MarginLine({
  label,
  value,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "positive" | "negative";
}) {
  const valueColor =
    tone === "negative"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "positive"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={muted ? "text-muted-foreground" : strong ? "font-medium" : ""}>
        {label}
      </span>
      <span className={`tabular-nums ${strong ? `font-semibold ${valueColor}` : muted ? "text-muted-foreground" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
