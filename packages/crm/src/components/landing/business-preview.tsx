"use client";

import Link from "next/link";

type PreviewService = {
  name: string;
  description: string;
  price: string | null;
  duration: string | null;
};

type PreviewTestimonial = {
  quote: string;
  author: string;
  role: string | null;
};

type PreviewBusiness = {
  businessName: string | null;
  industry: string | null;
  tagline: string | null;
  description: string | null;
  services: PreviewService[];
  testimonials: PreviewTestimonial[];
  contactInfo: { email: string | null; phone: string | null; address: string | null };
  voiceTone: string | null;
  idealClient: string | null;
  suggestedFramework: "coaching" | "agency" | "saas" | "ecommerce" | "services" | "other";
};

type PreviewTool = {
  name: string;
  slug: string;
  icon: string;
  autoConnect: boolean;
};

type PreviewPayload = {
  business: PreviewBusiness;
  tools: PreviewTool[];
  themeColor: string;
};

function normalizeColor(value: string | undefined) {
  if (!value) {
    return "#14b8a6";
  }

  const color = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
    return color;
  }

  return "#14b8a6";
}

export function BusinessPreview({ data, claimToken }: { data: PreviewPayload; claimToken: string }) {
  const { business, tools } = data;
  const themeColor = normalizeColor(data.themeColor);
  const callbackUrl = `/claim?token=${encodeURIComponent(claimToken)}`;
  const googleHref = `/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  return (
    <div className="mx-auto mt-16 w-full max-w-5xl">
      <div className="mb-12 text-center">
        <h2 className="mb-2 text-3xl font-bold text-zinc-100">{business.businessName || "Your Business"}</h2>
        <p className="text-zinc-400">{business.tagline || business.description || "Preview generated from your site."}</p>
      </div>

      <div className="mb-12 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Services Found</h3>
          <div className="space-y-3">
            {business.services.slice(0, 4).map((service) => (
              <div key={service.name} className="flex items-start justify-between gap-2">
                <span className="text-sm text-zinc-200">{service.name}</span>
                {service.price ? (
                  <span className="text-sm font-mono" style={{ color: themeColor }}>
                    {service.price}
                  </span>
                ) : null}
              </div>
            ))}
            {business.services.length === 0 ? <p className="text-sm italic text-zinc-500">Add services after signup</p> : null}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Testimonials Found</h3>
          <div className="space-y-3">
            {business.testimonials.slice(0, 2).map((testimonial, index) => (
              <div key={`${testimonial.author}-${index}`}>
                <p className="text-sm italic text-zinc-300">&quot;{testimonial.quote.slice(0, 90)}...&quot;</p>
                <p className="mt-1 text-xs text-zinc-500">— {testimonial.author || "Anonymous"}</p>
              </div>
            ))}
            {business.testimonials.length === 0 ? (
              <p className="text-sm italic text-zinc-500">Add testimonials after signup</p>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">Tools Detected</h3>
          <div className="space-y-3">
            {tools.map((tool) => (
              <div key={tool.slug} className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-zinc-200">{tool.name}</span>
                {tool.autoConnect ? <span className="ml-auto text-xs text-teal-400">Auto-connect</span> : null}
              </div>
            ))}
            {tools.length === 0 ? <p className="text-sm italic text-zinc-500">Connect tools after signup</p> : null}
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h3 className="mb-6 text-center text-lg font-semibold text-zinc-300">Your system is ready</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="bg-zinc-800 px-4 py-2 text-xs text-zinc-400">Booking Page</div>
            <div className="space-y-2 bg-zinc-900 p-4">
              <div className="h-3 w-3/4 rounded" style={{ backgroundColor: themeColor, opacity: 0.65 }} />
              <div className="h-2 w-full rounded bg-zinc-700" />
              <div className="h-2 w-5/6 rounded bg-zinc-700" />
              <div className="mt-3 h-8 w-24 rounded" style={{ backgroundColor: themeColor }} />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="bg-zinc-800 px-4 py-2 text-xs text-zinc-400">Landing Page</div>
            <div className="space-y-2 bg-zinc-900 p-4">
              <div className="h-4 w-2/3 rounded" style={{ backgroundColor: themeColor, opacity: 0.65 }} />
              <div className="h-2 w-full rounded bg-zinc-700" />
              <div className="h-2 w-4/5 rounded bg-zinc-700" />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="h-12 rounded bg-zinc-800" />
                <div className="h-12 rounded bg-zinc-800" />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <div className="bg-zinc-800 px-4 py-2 text-xs text-zinc-400">CRM Pipeline</div>
            <div className="space-y-2 bg-zinc-900 p-4">
              <div className="flex gap-2">
                <div className="h-16 flex-1 rounded bg-zinc-800" />
                <div className="h-16 flex-1 rounded bg-zinc-800" />
                <div className="h-16 flex-1 rounded bg-zinc-800" />
              </div>
              <div className="h-2 w-1/2 rounded bg-zinc-700" />
            </div>
          </div>
        </div>
      </div>

      {business.voiceTone ? (
        <div className="mb-8 text-center">
          <p className="text-sm text-zinc-500">
            Detected voice: <span className="text-zinc-300">{business.voiceTone}</span>
          </p>
        </div>
      ) : null}

      <div className="py-8 text-center">
        <a
          href={googleHref}
          className="inline-flex h-14 items-center gap-3 rounded-xl px-10 text-lg font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: themeColor }}
        >
          Go Live with Google
        </a>
        <p className="mt-4 text-sm text-zinc-500">Free forever. No credit card required.</p>
        <p className="mt-2 text-xs text-zinc-600">
          Or{" "}
          <Link href={`/signup?token=${encodeURIComponent(claimToken)}`} className="underline hover:text-zinc-400">
            sign up with email
          </Link>
        </p>
      </div>
    </div>
  );
}
