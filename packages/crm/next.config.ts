import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost", "127.0.0.1", "127.0.0.1:54345"],
    },
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
