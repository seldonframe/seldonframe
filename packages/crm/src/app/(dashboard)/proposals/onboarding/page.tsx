// packages/crm/src/app/(dashboard)/proposals/onboarding/page.tsx
// 2026-05-20 — Thin redirect. /proposals/onboarding is kept alive for
// backward-compatibility (saved bookmarks, old Stripe return_url values)
// but the Stripe Connect setup now lives inline at /proposals. Any ?status
// query-param is forwarded so the flash banner renders correctly.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProposalsOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const qs = status ? `?status=${status}` : "";
  redirect(`/proposals${qs}`);
}
