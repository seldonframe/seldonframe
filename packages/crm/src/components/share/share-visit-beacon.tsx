"use client";

// Agent setup mode slice (T5) — fires ONE "share_card_viewed" PostHog event
// per real browser view of the public /a/[slug] page. posthog-js is already
// initialized globally (instrumentation-client.ts runs on every route,
// including this public one) — this just adds a named event on top of the
// automatic pageview so the distribution-loop KPI (spec §3: cards minted /
// share-page visits / share->/record starts) has a dedicated event to
// filter on. No PII: only the slug (a capability token, not identifying).

import { useEffect, useRef } from "react";
import posthog from "posthog-js";

export function ShareVisitBeacon({ slug }: { slug: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    posthog.capture("share_card_viewed", { slug });
  }, [slug]);

  return null;
}
