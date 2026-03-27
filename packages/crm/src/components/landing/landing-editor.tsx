"use client";

import { useState, useTransition } from "react";
import { publishLandingPageAction, updateLandingSectionsAction } from "@/lib/landing/actions";
import type { LandingSection } from "@/lib/landing/types";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function LandingEditor({
  pageId,
  initialSections,
  initialStatus,
}: {
  pageId: string;
  initialSections: LandingSection[];
  initialStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [jsonValue, setJsonValue] = useState(JSON.stringify(initialSections, null, 2));
  const [status, setStatus] = useState(initialStatus);
  const { showDemoToast } = useDemoToast();

  function saveSections() {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await updateLandingSectionsAction(pageId, jsonValue);
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
        <button type="button" onClick={saveSections} className="crm-button-primary h-9 px-3" disabled={pending}>
          {pending ? "Saving..." : "Save Sections"}
        </button>
        <button
          type="button"
          onClick={togglePublish}
          className="h-9 rounded-md border border-[hsl(var(--border))] px-3 text-sm font-medium"
          disabled={pending}
        >
          {status === "published" ? "Unpublish" : "Publish"}
        </button>
        <span className="crm-badge">{status}</span>
      </div>

      <textarea
        className="crm-input min-h-[520px] w-full p-3 font-mono text-xs"
        value={jsonValue}
        onChange={(event) => setJsonValue(event.target.value)}
      />
    </div>
  );
}
