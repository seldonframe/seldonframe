// packages/crm/src/app/onboard/[token]/page.tsx
// 2026-06-04 — Public onboarding intake route. No auth required.
// Clients receive /onboard/<token> after paying; the link renders
// the 7-chapter intake card flow so we can configure their workspace.
//
// Conventions:
// - await params (Next.js 15 async params)
// - Validate token + load row before any expensive work
// - Render "link no longer active" panel for invalid / applied links
// - Render formbricks-stack-v1 fresh from ONBOARDING_QUESTIONS for valid links
// Mirrors: app/p/[token]/page.tsx (proposal public page)
//          app/forms/[id]/[formSlug]/page.tsx (public intake)

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { loadOnboardingLinkByToken } from "@/lib/onboarding/links";
import { ONBOARDING_QUESTIONS } from "@/lib/onboarding/onboarding-form-definition";
import { renderFormbricksStackV1 } from "@/lib/blueprint/renderers/formbricks-stack-v1";
import type { Blueprint, Intake } from "@/lib/blueprint/types";

export const dynamic = "force-dynamic";

// ─── Blueprint stub ───────────────────────────────────────────────────────────
// The onboarding form has no pre-rendered blueprint HTML stored in the DB.
// We synthesise a minimal Blueprint on-the-fly so renderFormbricksStackV1
// can produce the card-flow HTML/CSS. Only the fields the renderer actually
// reads are populated; the rest use safe defaults.

function buildOnboardingBlueprint(workspaceName: string, orgSlug: string): Blueprint {
  const intake: Intake = {
    renderer: "formbricks-stack-v1",
    title: "Let's build your new front office",
    description:
      "About 10 minutes. Upload what you have; skip the rest and we'll handle it.",
    questions: ONBOARDING_QUESTIONS,
    completion: {
      headline: "That's everything!",
      message:
        "We're building your front office now — you'll get an email the moment it's ready.",
    },
  };

  return {
    version: 1,
    workspace: {
      name: workspaceName,
      slug: orgSlug,
      tagline: "",
      industry: "service",
      theme: {
        mode: "light",
        accent: "#0ea5e9",
      },
      contact: {
        phone: "",
        email: null,
        address: {
          street: "",
          city: "",
          region: "",
          postalCode: "",
          country: "US",
        },
        hours: {
          mon: [9, 17],
          tue: [9, 17],
          wed: [9, 17],
          thu: [9, 17],
          fri: [9, 17],
          sat: null,
          sun: null,
        },
        timezone: "America/New_York",
      },
    },
    // landing/booking/admin are required by the Blueprint type but not
    // consumed by renderFormbricksStackV1. Provide minimal valid stubs.
    landing: {
      renderer: "general-service-v1",
      sections: [],
    } as Blueprint["landing"],
    booking: {
      renderer: "calcom-month-v1",
      eventType: {
        title: "Consultation",
        durationMinutes: 60,
      },
      availability: {
        weekly: {
          mon: [9, 17],
          tue: [9, 17],
          wed: [9, 17],
          thu: [9, 17],
          fri: [9, 17],
          sat: null,
          sun: null,
        },
      },
      formFields: [],
      confirmation: {},
    },
    admin: {
      renderer: "twenty-shell-v1",
      objects: [],
      sidebarOrder: [],
    },
    intake,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function OnboardTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate + load the link row. loadOnboardingLinkByToken pre-validates
  // the token shape before hitting the DB (cheap bot defence).
  const link = await loadOnboardingLinkByToken(token);

  // Render a friendly "no longer active" panel for:
  //   - invalid token (null from pre-validation)
  //   - missing token (no DB row)
  //   - already-applied links (workspace is already configured)
  if (!link || link.status === "applied") {
    return (
      <main className="min-h-screen bg-[#ededed] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl bg-white shadow-sm border border-black/5 p-10 text-center space-y-4">
          <div
            className="mx-auto flex items-center justify-center w-16 h-16 rounded-full"
            style={{ background: "rgba(239, 68, 68, 0.1)" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--sf-font-display, inherit)", color: "#0f172a" }}
          >
            This link is no longer active
          </h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            Your onboarding link has already been used or has expired. If you
            believe this is a mistake, please contact your account manager.
          </p>
        </div>
      </main>
    );
  }

  // Load workspace name for the navbar + footer (renderer uses blueprint.workspace.name).
  const [org] = await db
    .select({ name: organizations.name, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, link.orgId))
    .limit(1);

  const workspaceName = org?.name ?? "Your workspace";
  const orgSlug = org?.slug ?? "";

  const blueprint = buildOnboardingBlueprint(workspaceName, orgSlug);
  const { html, css } = renderFormbricksStackV1(blueprint, { formSlug: "onboarding" });

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
