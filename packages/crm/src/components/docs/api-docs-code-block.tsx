"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

type ApiDocsCodeBlockProps = {
  title: string;
  label: string;
  code: string;
};

export function ApiDocsCodeBlock({ title, label, code }: ApiDocsCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className="rounded-2xl border border-zinc-800/90 bg-zinc-950/80 shadow-(--shadow-xs)">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800/90 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-100">{title}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        </div>
        <Button type="button" variant="outline" size="sm" className="border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100" onClick={() => void handleCopy()}>
          {copied ? <Check className="size-3.5 text-teal-300" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto px-4 py-4 text-[13px] leading-6 text-zinc-200">
        <code>{code}</code>
      </pre>
    </article>
  );
}
