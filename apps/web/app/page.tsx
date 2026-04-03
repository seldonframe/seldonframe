"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const BUSINESS_TYPES = ["coach", "therapist", "trainer", "consultant", "freelancer", "other"] as const;

type SubmitState = {
  ok: boolean;
  position: number;
  total: number;
};

export default function Page() {
  const [referralCode, setReferralCode] = useState<string | undefined>(undefined);
  const [businessType, setBusinessType] = useState<(typeof BUSINESS_TYPES)[number]>("coach");
  const [email, setEmail] = useState("");
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitState | null>(null);

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get("ref") ?? undefined;
    setReferralCode(ref);

    void (async () => {
      try {
        const response = await fetch("/api/subscribe", { method: "GET" });
        const data = (await response.json()) as { total?: number };
        setCount(Number(data.total ?? 0));
      } catch {
        setCount(0);
      }
    })();
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          businessType,
          referralCode,
        }),
      });

      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        position?: number;
        total?: number;
      };

      if (!response.ok || !data.ok) {
        setError(data.error ?? "Could not join waitlist right now.");
        return;
      }

      const nextResult = {
        ok: true,
        position: Number(data.position ?? 1),
        total: Number(data.total ?? count + 1),
      };
      setResult(nextResult);
      setCount(nextResult.total);
    } catch {
      setError("Could not join waitlist right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-10 mx-auto h-80 w-[42rem] bg-[radial-gradient(circle,rgba(245,158,11,0.08)_0%,rgba(245,158,11,0)_70%)]" />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 md:px-12">
          <Link href="/" className="inline-flex items-center gap-3">
            <Image src="/logo.svg" alt="SeldonFrame" width={28} height={36} className="h-9 w-auto" priority />
            <span className="text-sm font-semibold">SeldonFrame</span>
          </Link>
          <Link
            href="https://github.com/seldonframe/crm"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground transition-all duration-200 hover:text-foreground"
          >
            GitHub ↗
          </Link>
        </header>

        <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 pb-12 pt-6 text-center md:min-h-[calc(100vh-5rem)] md:justify-center md:pb-20 md:pt-0">
          <span className="mb-6 inline-flex w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-1.5 text-xs font-medium text-muted-foreground transition-[color,box-shadow] overflow-hidden">
            Launching Soon — Early Access Open
          </span>

          <h1 className="text-4xl font-bold leading-[1.1] tracking-tight md:text-5xl lg:text-6xl">
            The operating system
            <br />
            for your <span className="italic text-[#F59E0B]">business</span>
          </h1>

          <p className="mt-4 max-w-xl text-lg text-muted-foreground">
            One brain. Every block. If it doesn&apos;t exist — Seldon it into existence.
          </p>
          <p className="mt-2 text-sm text-muted-foreground/70">
            SeldonFrame configures your CRM, booking, email, landing page, and payments from one conversation. Free and
            open source.
          </p>

          <div className="mt-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-[0_0_0_1px_rgba(245,158,11,0.05)] md:p-8">
            {!result ? (
              <form onSubmit={onSubmit} className="space-y-4 text-left">
                <p className="text-sm font-medium">What type of business do you run?</p>
                <div className="flex flex-wrap gap-2">
                  {BUSINESS_TYPES.map((type) => {
                    const selected = businessType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setBusinessType(type)}
                        className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-sm transition-all duration-200 ${
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:border-primary/50"
                        }`}
                      >
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium">
                    Your email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@yourbusiness.com"
                    className="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-12 w-full min-w-0 rounded-xl border bg-transparent px-4 py-3 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
                >
                  {loading ? "Joining..." : "Get Early Access"}
                </button>

                <p className="text-center text-xs text-muted-foreground/60">Free forever to self-host. No credit card required.</p>
                {error ? <p className="text-center text-xs text-destructive">{error}</p> : null}
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <h2 className="text-2xl font-semibold">You&apos;re in! 🎉</h2>
                <p className="text-sm text-muted-foreground">You&apos;re #{result.position} on the waitlist.</p>
                <p className="text-xs text-muted-foreground">First 100 get personal setup with the founder.</p>
                <div className="pt-2 text-sm font-medium">While you wait:</div>
                <div className="flex flex-wrap justify-center gap-2">
                  <Link
                    href="https://github.com/seldonframe/crm"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-all duration-200 hover:bg-accent"
                  >
                    ⭐ Star us on GitHub
                  </Link>
                  <Link
                    href="https://www.skool.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium transition-all duration-200 hover:bg-accent"
                  >
                    👥 Join the Community
                  </Link>
                </div>
              </div>
            )}
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            {count > 0 ? `Join ${count} others on the waitlist` : "First 100 users get personal setup with the founder."}
          </p>

          <div className="mt-16 flex flex-wrap items-center justify-center gap-3">
            {[
              "🧠 One Brain",
              "📦 Infinite Blocks",
              "✨ Seldon Anything",
            ].map((pill) => (
              <span key={pill} className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-xs text-muted-foreground">
                {pill}
              </span>
            ))}
          </div>

          <section className="mt-12 text-center">
            <h3 className="text-base font-semibold">What early access includes:</h3>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>✓ Full business OS — CRM, booking, email, pages, payments</li>
              <li>✓ AI-powered Seldon It — describe features, they appear</li>
              <li>✓ Direct line to the founder for your first 90 days</li>
            </ul>
          </section>

          <section className="mt-10 w-full max-w-sm rounded-xl border border-border bg-card/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">Developer? Self-host for free right now.</p>
            <Link
              href="https://github.com/seldonframe/crm"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 transition-all duration-200 hover:underline"
            >
              Clone on GitHub →
            </Link>
          </section>

          <footer className="mt-20 pb-8 text-center text-xs text-muted-foreground">
            <span>© 2026 SeldonFrame · </span>
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              Privacy
            </Link>
            <span> · </span>
            <Link href="/terms" className="underline-offset-4 hover:underline">
              Terms
            </Link>
          </footer>
        </section>
      </div>
    </main>
  );
}
