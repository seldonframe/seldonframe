"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ConnectStartButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/proposals/connect/start", { method: "POST" });
      let data: { url?: string; error?: string; message?: string; help?: string };
      try {
        data = await response.json();
      } catch {
        data = { error: `non_json_response_${response.status}` };
      }
      if (!response.ok || !data.url) {
        const parts = [data.message ?? data.error ?? `connect_start_failed_${response.status}`];
        if (data.help) parts.push(data.help);
        throw new Error(parts.join(" — "));
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_start_failed");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={loading}>
        {loading ? "Opening Stripe..." : "Connect Stripe account"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
