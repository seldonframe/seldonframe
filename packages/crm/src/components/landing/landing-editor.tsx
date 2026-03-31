"use client";

import { useState, useTransition } from "react";
import { publishLandingPageAction, updateLandingEditorAction, updateLandingPageSettingsAction } from "@/lib/landing/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { PageEditor } from "./page-editor";

export function LandingEditor({
  pageId,
  orgSlug,
  title,
  slug,
  seoDescription,
  initialHtml,
  initialCss,
  initialEditorData,
  initialStatus,
}: {
  pageId: string;
  orgSlug: string;
  title: string;
  slug: string;
  seoDescription?: string;
  initialHtml?: string | null;
  initialCss?: string | null;
  initialEditorData?: Record<string, unknown> | null;
  initialStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [pageTitle, setPageTitle] = useState(title);
  const [pageSlug, setPageSlug] = useState(slug);
  const [pageSeoDescription, setPageSeoDescription] = useState(seoDescription ?? "");
  const { showDemoToast } = useDemoToast();

  function saveEditor(payload: { html: string; css: string; editorData: Record<string, unknown> }) {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await updateLandingEditorAction({
          pageId,
          html: payload.html,
          css: payload.css,
          editorData: payload.editorData,
        });
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        throw error;
      }
    });
  }

  function saveSettings() {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await updateLandingPageSettingsAction({
          pageId,
          title: pageTitle,
          slug: pageSlug,
          seoDescription: pageSeoDescription,
        });
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        throw error;
      }
    });
  }

  function togglePublish() {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        const next = status !== "published";
        await publishLandingPageAction(pageId, next);
        setStatus(next ? "published" : "draft");
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        throw error;
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={saveSettings} className="crm-button-secondary h-9 px-3" disabled={pending}>
          {pending ? "Saving..." : "Save Settings"}
        </button>
        <button
          type="button"
          onClick={togglePublish}
          className="h-9 rounded-md border border-[hsl(var(--border))] px-3 text-sm font-medium"
          disabled={pending}
        >
          {status === "published" ? "Unpublish" : "Publish"}
        </button>
        <button type="button" className="crm-button-ghost h-9 px-3" onClick={() => window.open(`/l/${orgSlug}/${pageSlug}`, "_blank")}>Preview</button>
        <span className="crm-badge">{status}</span>
      </div>

      <div className="grid gap-3 rounded-xl border border-[hsl(var(--border))] p-3 md:grid-cols-2">
        <label className="text-xs text-[hsl(var(--muted-foreground))]">
          Title
          <input className="crm-input mt-1 h-10 w-full px-3" value={pageTitle} onChange={(event) => setPageTitle(event.target.value)} />
        </label>
        <label className="text-xs text-[hsl(var(--muted-foreground))]">
          Slug
          <input className="crm-input mt-1 h-10 w-full px-3" value={pageSlug} onChange={(event) => setPageSlug(event.target.value)} />
        </label>
        <label className="text-xs text-[hsl(var(--muted-foreground))] md:col-span-2">
          SEO description
          <textarea className="crm-input mt-1 min-h-20 w-full p-3" value={pageSeoDescription} onChange={(event) => setPageSeoDescription(event.target.value)} />
        </label>
      </div>

      <PageEditor
        initialHTML={initialHtml}
        initialCSS={initialCss}
        editorData={initialEditorData ?? null}
        onSave={saveEditor}
      />
    </div>
  );
}
