import { redirect } from "next/navigation";

// 2026-07-04 — the Soul/Blocks/Framework welcome interstitial is retired
// (audit fix #5: jargon-free onboarding; nothing routed here since the
// paste→build flow became the default landing). The route stays so old
// magic-link callbacks and bookmarks resolve; they now land on the
// dashboard directly. Spec: docs/superpowers/specs/2026-07-04-onboarding-batch2-design.md
export default function WelcomePage() {
  redirect("/dashboard");
}
