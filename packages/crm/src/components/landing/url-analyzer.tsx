"use client";

import { useMemo, useState } from "react";
import { BusinessPreview } from "@/components/landing/business-preview";

type AnalyzePhase = "idle" | "analyzing" | "preview" | "error";

type AnalyzeResponse = {
  claimToken: string;
  business: {
    businessName: string | null;
    industry: string | null;
    tagline: string | null;
    description: string | null;
    services: Array<{ name: string; description: string; price: string | null; duration: string | null }>;
    testimonials: Array<{ quote: string; author: string; role: string | null }>;
    contactInfo: { email: string | null; phone: string | null; address: string | null };
    voiceTone: string | null;
    idealClient: string | null;
    suggestedFramework: "coaching" | "agency" | "saas" | "ecommerce" | "services" | "other";
  };
  tools: Array<{ name: string; slug: string; icon: string; autoConnect: boolean }>;
  themeColor: string;
};

const progressSteps = [
  "Reading your website...",
  "Extracting your services...",
  "Analyzing your voice...",
  "Detecting your tools...",
  "Building your preview...",
];

export function UrlAnalyzer() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<AnalyzePhase>("idle");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [claimToken, setClaimToken] = useState("");
  const [progressStep, setProgressStep] = useState(0);

  const progressLabel = useMemo(() => progressSteps[Math.min(progressStep, progressSteps.length - 1)] ?? progressSteps[0], [progressStep]);

  const analyze = async () => {
    const nextUrl = url.trim();
    if (!nextUrl) {
      return;
    }

    setPhase("analyzing");
    setResult(null);
    setClaimToken("");
    setProgressStep(0);

    const interval = window.setInterval(() => {
      setProgressStep((value) => Math.min(value + 1, progressSteps.length - 1));
    }, 1800);

    try {
      const res = await fetch("/api/v1/public/analyze-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: nextUrl }),
      });

      window.clearInterval(interval);

      if (!res.ok) {
        setPhase("error");
        return;
      }

      const data = (await res.json()) as AnalyzeResponse;
      setResult(data);
      setClaimToken(data.claimToken);
      setPhase("preview");
    } catch {
      window.clearInterval(interval);
      setPhase("error");
    }
  };

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void analyze();
            }
          }}
          placeholder="https://yourwebsite.com"
          className="h-14 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-5 text-lg text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none"
          disabled={phase === "analyzing"}
        />
        <button
          onClick={() => {
            void analyze();
          }}
          disabled={phase === "analyzing" || !url.trim()}
          className="h-14 rounded-xl px-8 text-lg font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          style={{ backgroundColor: "#14b8a6" }}
        >
          {phase === "analyzing" ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {phase === "analyzing" ? (
        <div className="mt-8 text-center">
          <div className="inline-flex items-center gap-3 text-zinc-300">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
            <span className="text-lg">{progressLabel}</span>
          </div>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="mt-6 text-center text-sm text-red-400">
          Couldn&apos;t read that URL. Make sure it&apos;s a public website and try again.
        </div>
      ) : null}

      {phase === "preview" && result && claimToken ? <BusinessPreview data={result} claimToken={claimToken} /> : null}
    </div>
  );
}
