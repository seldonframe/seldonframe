"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const INSTALL_STEPS = [
  "Applying your brand theme...",
  "Compiling your business knowledge...",
  "Creating your booking page...",
  "Setting up your CRM pipeline...",
  "Building your landing page...",
  "Writing your welcome flow...",
  "Almost done...",
];

export default function ClaimPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token"), [searchParams]);

  const [status, setStatus] = useState("Installing your system...");

  useEffect(() => {
    if (!token) {
      router.push("/dashboard");
      return;
    }

    let stepIndex = 0;
    const interval = window.setInterval(() => {
      if (stepIndex < INSTALL_STEPS.length) {
        setStatus(INSTALL_STEPS[stepIndex] ?? "Finalizing...");
        stepIndex += 1;
      }
    }, 1500);

    void fetch("/api/v1/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (!res.ok || !body.success) {
          throw new Error(body.error || "Claim failed");
        }

        window.clearInterval(interval);
        setStatus("Your system is live!");
        window.setTimeout(() => router.push("/dashboard"), 1300);
      })
      .catch(() => {
        window.clearInterval(interval);
        setStatus("Something went wrong. Redirecting...");
        window.setTimeout(() => router.push("/dashboard"), 1800);
      });

    return () => {
      window.clearInterval(interval);
    };
  }, [token, router]);

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[#14b8a6] border-t-transparent" />
        <p className="text-xl font-medium text-foreground">{status}</p>
      </div>
    </div>
  );
}
