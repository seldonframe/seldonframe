"use client";

import { useState } from "react";

export function EmailCapture() {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("loading");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    const response = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setState(response.ok ? "success" : "error");
    if (response.ok) {
      event.currentTarget.reset();
    }
  }

  return (
    <section className="web-section">
      <div className="web-container max-w-[560px]">
        <p className="section-label text-center">Email Capture</p>
        <h2 className="text-center text-[28px] font-semibold tracking-[-0.02em]">The foundation for what you build next.</h2>
        <p className="mt-3 text-center text-[hsl(var(--color-text-secondary))]">
          Get notified when new blocks ship, Pro launches, and Cloud goes live.
        </p>

        <form onSubmit={onSubmit} className="glass-card mt-6 rounded-2xl p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              name="email"
              required
              placeholder="Email"
              className="focus-teal h-12 flex-1 rounded-lg border border-white/10 bg-transparent px-4 text-sm text-foreground placeholder:text-[hsl(var(--color-text-secondary))]"
            />
            <button type="submit" disabled={state === "loading"} className="glow-teal h-12 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60">
              {state === "loading" ? "Joining..." : "Join builders"}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-[hsl(var(--color-text-secondary))]">
            {state === "success"
              ? "You're in. Watch your inbox for milestones."
              : state === "error"
                ? "Could not subscribe right now. Please try again."
                : "No spam. One email per milestone. Unsubscribe anytime."}
          </p>
        </form>
      </div>
    </section>
  );
}
