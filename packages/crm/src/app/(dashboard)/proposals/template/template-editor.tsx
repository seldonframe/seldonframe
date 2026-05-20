"use client";

// packages/crm/src/app/(dashboard)/proposals/template/template-editor.tsx
// 2026-05-19 — Proposal Builder. Two-column template editor with live preview.
// Spec: §"Phase 7 — per-agency template editor".
//
// Variables supported: {{prospectName}}, {{prospectFirstName}},
//   {{agencyName}}, {{price}}.
// Sample values are substituted in the preview column only.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AgencyProposalTemplate } from "@/db/schema/agency-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveProposalTemplateAction } from "@/lib/proposals/actions";

const SAMPLE_VARS: Record<string, string> = {
  prospectName: "Acme Plumbing",
  prospectFirstName: "James",
  agencyName: "Your Agency",
  price: "$497",
};

function substituteVars(copy: string, agencyName: string): string {
  const vars: Record<string, string> = { ...SAMPLE_VARS, agencyName };
  return copy.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

type Props = {
  template: AgencyProposalTemplate;
  agencyName: string;
};

export function TemplateEditor({ template, agencyName }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [subject, setSubject] = useState(template.subject);
  const [introCopy, setIntroCopy] = useState(template.introCopy);
  const [scopeCopy, setScopeCopy] = useState(template.scopeCopy);
  const [timelineCopy, setTimelineCopy] = useState(template.timelineCopy);
  const [termsCopy, setTermsCopy] = useState(template.termsCopy);

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveProposalTemplateAction({
        subject,
        introCopy,
        scopeCopy,
        timelineCopy,
        termsCopy,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  const previewSubject = substituteVars(subject, agencyName);
  const previewIntro = substituteVars(introCopy, agencyName);
  const previewScope = substituteVars(scopeCopy, agencyName);
  const previewTimeline = substituteVars(timelineCopy, agencyName);
  const previewTerms = substituteVars(termsCopy, agencyName);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      {/* Left — form */}
      <section className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="tpl-subject">Email subject line</Label>
          <Input
            id="tpl-subject"
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setSaved(false); }}
            placeholder="A proposal for {{prospectName}}"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-intro">Intro paragraph</Label>
          <Textarea
            id="tpl-intro"
            value={introCopy}
            onChange={(e) => { setIntroCopy(e.target.value); setSaved(false); }}
            placeholder="Hi {{prospectFirstName}} — ..."
            className="min-h-24"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-scope">What&apos;s included</Label>
          <Textarea
            id="tpl-scope"
            value={scopeCopy}
            onChange={(e) => { setScopeCopy(e.target.value); setSaved(false); }}
            className="min-h-20"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-timeline">Timeline</Label>
          <Textarea
            id="tpl-timeline"
            value={timelineCopy}
            onChange={(e) => { setTimelineCopy(e.target.value); setSaved(false); }}
            className="min-h-16"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-terms">Terms</Label>
          <Textarea
            id="tpl-terms"
            value={termsCopy}
            onChange={(e) => { setTermsCopy(e.target.value); setSaved(false); }}
            className="min-h-16"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Available variables:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{"{{prospectName}}"}</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{"{{prospectFirstName}}"}</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{"{{agencyName}}"}</code>{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{"{{price}}"}</code>
        </p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving…" : "Save template"}
          </Button>
          {saved && (
            <span className="text-sm text-emerald-600" aria-live="polite">
              Saved
            </span>
          )}
        </div>
      </section>

      {/* Right — live preview */}
      <aside className="rounded-2xl border bg-card/40 p-6 space-y-4 text-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Preview — sample values
        </p>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Subject</p>
          <p className="font-medium">{previewSubject || <span className="italic text-muted-foreground">empty</span>}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Intro</p>
          <p className="text-foreground/90 whitespace-pre-wrap">{previewIntro || <span className="italic text-muted-foreground">empty</span>}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">What&apos;s included</p>
          <p className="text-foreground/90 whitespace-pre-wrap">{previewScope || <span className="italic text-muted-foreground">empty</span>}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Timeline</p>
          <p className="text-foreground/90 whitespace-pre-wrap">{previewTimeline || <span className="italic text-muted-foreground">empty</span>}</p>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Terms</p>
          <p className="text-foreground/90 whitespace-pre-wrap">{previewTerms || <span className="italic text-muted-foreground">empty</span>}</p>
        </div>
      </aside>
    </div>
  );
}
