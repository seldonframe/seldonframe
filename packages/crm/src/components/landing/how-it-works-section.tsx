import Image from "next/image";

// Cut C Phase 2 — "How it works" 3-step section.
// Concrete proof of the hero's 60-second claim: signup → URL paste →
// workspace ready. Each step pairs a numbered badge with a screenshot
// taken from the actual Cut A / Cut B routes (/signup, /clients/new,
// the freshly-created workspace dashboard).

type Step = {
  number: 1 | 2 | 3;
  title: string;
  body: string;
  screenshot: string;
  alt: string;
};

const STEPS: readonly Step[] = [
  {
    number: 1,
    title: "Sign up free",
    body: "Magic link. 30 seconds. Free to start.",
    screenshot: "/marketing/how-it-works-step-1.png",
    alt: "Screenshot of the SeldonFrame signup form showing an email field and Continue with email link button.",
  },
  {
    number: 2,
    title: "Paste your client's URL",
    body: "SeldonFrame reads their site — services, hours, reviews — using your Anthropic key.",
    screenshot: "/marketing/how-it-works/step-2-spin-up.png",
    alt: "Paste a client URL into the new-workspace form; the live build narrates each step.",
  },
  {
    number: 3,
    title: "Workspace ready in 60 seconds",
    body: "CRM, booking page, intake form, AI chatbot, demo portal. Pre-wired. White-label. Ready to hand over.",
    screenshot: "/marketing/how-it-works/step-3-workspace-ready.png",
    alt: "Workspace ready — operator dashboard + customer portal both live in 60 seconds.",
  },
];

export function LandingHowItWorksSection() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="mx-auto max-w-5xl border-t border-zinc-800/30 px-6 py-16 md:py-20"
    >
      <div className="text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
          How it works
        </p>
        <h2 id="how-it-works-heading" className="text-3xl font-bold text-zinc-100 md:text-4xl">
          Paste a URL. Walk away with a client-ready workspace. 3 steps.
        </h2>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            data-step={String(step.number)}
            className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900 p-5"
          >
            <div className="mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#14b8a6]/15 text-sm font-bold text-[#14b8a6]">
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-zinc-100">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">{step.body}</p>
            <div className="mt-5 overflow-hidden rounded-lg border border-zinc-800">
              <Image
                src={step.screenshot}
                alt={step.alt}
                width={640}
                height={400}
                className="aspect-video h-auto w-full object-cover"
                unoptimized
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
