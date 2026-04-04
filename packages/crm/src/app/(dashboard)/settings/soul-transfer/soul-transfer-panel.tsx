"use client";

import { useState, useTransition } from "react";
import { exportSoulAction, importSoulAction } from "@/lib/soul/export-actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

export function SoulTransferPanel() {
  const [pending, startTransition] = useTransition();
  const [importText, setImportText] = useState("");
  const [status, setStatus] = useState<"idle" | "exported" | "imported" | "error">("idle");
  const { showDemoToast } = useDemoToast();

  function handleExport() {
    startTransition(async () => {
      try {
        const result = await exportSoulAction();
        const blob = new Blob([result.content], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.fileName;
        a.click();
        URL.revokeObjectURL(url);
        setStatus("exported");
      } catch {
        setStatus("error");
      }
    });
  }

  function handleImport() {
    startTransition(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }

        await importSoulAction(importText);
        setStatus("imported");
        setImportText("");
      } catch (error) {
        if (isDemoBlockedError(error)) {
          showDemoToast();
          return;
        }

        setStatus("error");
      }
    });
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="crm-card space-y-3">
        <p className="text-card-title">Export</p>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Download your current Soul configuration as a .seldon.json file.
        </p>
        <button type="button" className="crm-button-primary h-9 px-3" disabled={pending} onClick={handleExport}>
          {pending ? "Exporting..." : "Export Soul"}
        </button>
        {status === "exported" ? <p className="text-label text-positive">Downloaded.</p> : null}
      </div>

      <div className="crm-card space-y-3">
        <p className="text-card-title">Import</p>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">
          Paste the contents of a .seldon.json file to import a Soul configuration.
        </p>
        <textarea
          className="crm-input min-h-[120px] w-full p-3 font-mono text-xs"
          placeholder='{"version":1, ...}'
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button type="button" className="crm-button-primary h-9 px-3" disabled={pending || !importText.trim()} onClick={handleImport}>
          {pending ? "Importing..." : "Import Soul"}
        </button>
        {status === "imported" ? <p className="text-label text-positive">Imported successfully.</p> : null}
        {status === "error" ? <p className="text-label text-negative">Operation failed.</p> : null}
      </div>
    </div>
  );
}
