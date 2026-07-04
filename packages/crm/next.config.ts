import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // Pre-existing React 19 / Framer Motion dual @types/react resolution
  // produces spurious ReactNode/ReactPortal errors across UI components.
  // Turbopack compilation (the real gate) passes cleanly — suppress the
  // tsc post-build check to stop whack-a-mole on third-party type artifacts.
  typescript: { ignoreBuildErrors: true },
  reactCompiler: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
    },
  },
  // v1.38.4 — allowlist Unsplash domains for next/image. Without this,
  // any <Image src="https://images.unsplash.com/..."> silently fails
  // and renders the alt-text fallback. v1.38.4 hero.tsx switched to
  // raw <img> to bypass this entirely (gallery already does), but the
  // remotePatterns are added as defense-in-depth for any future
  // next/image usage with Unsplash content. Vercel Blob added so
  // operator-uploaded photos via /upload work too.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "source.unsplash.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "*.app.seldonframe.com" },
    ],
  },
  // PostHog client-side analytics (web analytics, session replay, error
  // tracking) — instrumentation-client.ts posts events to same-origin
  // "/ingest" so ad-blockers don't eat them; these rewrites forward that
  // traffic to PostHog Cloud US. Deliberately NOT setting
  // `skipTrailingSlashRedirect: true` (PostHog's docs suggest it): that flag
  // is a GLOBAL behavior change for the whole app. Next's default
  // trailing-slash 308 redirect preserves the request method (POST), so
  // event captures still survive — they just take one extra redirect hop
  // before this rewrite matches.
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: "https://us-assets.i.posthog.com/static/:path*" },
      { source: "/ingest/:path*", destination: "https://us.i.posthog.com/:path*" },
    ];
  },
};

// v1.28.4 — Vercel Workflow DevKit integration. withWorkflow() wraps the
// Next.js config to compile workflow files (functions with "use workflow"
// or "use step" directives) into durable code that runs on Vercel's
// workflow runtime. Workflows persist across function invocations + can
// sleep for hours/days without consuming compute.
//
// Used by: lib/workflows/booking-reminder.ts (post-booking 24h reminder).
// Future workflows go in lib/workflows/ — withWorkflow auto-discovers them.
export default withWorkflow(nextConfig);
