"use client";

// ICP-3 — the Deploy-to-client stepper (client).
//
// 4 steps:
//   1. Confirm the agent (preselected from the URL; switchable among the
//      builder's templates).
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
} from "lucide-react";
import { createDeploymentAction } from "@/lib/deployments/actions";
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

type Surface = "phone" | "embed" | "link";

type Props = {
  templates: TemplateOption[];
  initialTemplateId: string;
};

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
];

export function DeployFlowClient({ templates, initialTemplateId }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — agent
  const [templateId, setTemplateId] = useState(initialTemplateId);

  // Step 2 — client details
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");

  // Step 3 — surface + price
  const [surface, setSurface] = useState<Surface>("phone");
  // Price the SMB pays, as a dollars string for the input. Default $99/mo.
  const [priceDollars, setPriceDollars] = useState("99");

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

  const canSubmit = clientName.trim().length >= 2 && !!templateId;

  const deploy = () => {
    setError(null);
    startDeploy(async () => {
      const result = await createDeploymentAction({
        agentTemplateId: templateId,
        clientName: clientName.trim(),
        clientContact: {
          phone: clientPhone.trim() || undefined,
          email: clientEmail.trim() || undefined,
        },
        surface,
        priceCents,
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
            Agent saved for {clientName.trim()}.
          </h2>
          <p className="text-sm text-muted-foreground">
            Provisioning the number and billing activates when you connect Twilio
            and Stripe. Until then this client sits in your book as a draft —
            nothing is live and no one is charged yet.
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
              This is the template you&apos;re deploying. Switch it here if you
              meant a different one.
            </p>
          </div>
          <div className="space-y-2">
            {templates.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplateId(t.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/5"
                      : "bg-background hover:bg-muted/50"
                  }`}
                  aria-pressed={active}
                >
                  <span
                    className="inline-flex size-9 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500 dark:text-indigo-400"
                    aria-hidden
                  >
                    <Bot className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatTemplateType(t.type)}
                    </span>
                  </span>
                  {active && <Check className="size-4 text-primary" aria-hidden />}
                </button>
              );
            })}
          </div>
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
              Who is this agent for? They never log into SeldonFrame — this is
              your record of the client.
            </p>
          </div>

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

          <StepNav
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextDisabled={clientName.trim().length < 2}
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

          <StepNav onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </div>
      )}

      {/* ── Step 4: Review ────────────────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-xl border bg-card p-5 space-y-5">
          <div>
            <h2 className="text-card-title">Review</h2>
            <p className="text-xs text-muted-foreground">
              We&apos;ll save this client as a draft. The number and billing
              activate later, when you connect Twilio and Stripe.
            </p>
          </div>

          <dl className="divide-y rounded-lg border bg-background text-sm">
            <ReviewRow label="Agent" value={selectedTemplate?.name ?? "—"} />
            <ReviewRow label="Client" value={clientName.trim() || "—"} />
            <ReviewRow
              label="Contact"
              value={[clientPhone.trim(), clientEmail.trim()].filter(Boolean).join(" · ") || "—"}
            />
            <ReviewRow label="Surface" value={SURFACES.find((s) => s.id === surface)?.label ?? surface} />
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
