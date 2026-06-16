"use client";
// packages/crm/src/app/start/return/_components/onboarding-mini-form.tsx
// Post-payment onboarding mini-form shown on the return/success page.
// Collects 4 high-value fields and applies them to the client workspace
// via applyOnboardingMiniFormAction (buildChangePlan + applyChangePlan).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyOnboardingMiniFormAction } from "../../actions";

type OnboardingMiniFormProps = {
  orgId: string;
  accentColor: string;
};

export function OnboardingMiniForm({ orgId, accentColor }: OnboardingMiniFormProps) {
  const [servicesText, setServicesText] = useState("");
  const [hoursText, setHoursText] = useState("");
  const [googleReviewsUrl, setGoogleReviewsUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const result = await applyOnboardingMiniFormAction({
      orgId,
      services_text: servicesText.trim() || undefined,
      hours_text: hoursText.trim() || undefined,
      google_reviews_url: googleReviewsUrl.trim() || undefined,
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDone(true);
    setLoading(false);
  }

  if (done) {
    return (
      <div
        className="rounded-2xl border border-green-200 bg-green-50 px-6 py-5 text-center space-y-1"
        style={{ borderColor: accentColor + "33", backgroundColor: accentColor + "11" }}
      >
        <p className="font-semibold text-foreground">Workspace updated!</p>
        <p className="text-sm text-muted-foreground">
          Services, hours, and Google review link applied to the workspace.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="services-text">
          What services do you offer?{" "}
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Textarea
          id="services-text"
          placeholder="e.g. HVAC installation $150/hr, Tune-up $99, Emergency call $299"
          value={servicesText}
          onChange={(e) => setServicesText(e.target.value)}
          rows={3}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          One service per line. Include name, duration, and price if known.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="hours-text">
          Business hours{" "}
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Input
          id="hours-text"
          placeholder="e.g. Mon–Fri 8am–6pm, Sat 9am–2pm"
          value={hoursText}
          onChange={(e) => setHoursText(e.target.value)}
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="google-reviews-url">
          Google Business profile URL{" "}
          <span className="text-muted-foreground font-normal text-xs">(optional)</span>
        </Label>
        <Input
          id="google-reviews-url"
          type="url"
          placeholder="https://g.page/r/..."
          value={googleReviewsUrl}
          onChange={(e) => setGoogleReviewsUrl(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Find it at Google Maps → your business → Share → Copy link.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={loading}
        className="w-full"
        style={{ backgroundColor: accentColor, color: "#fff", borderColor: accentColor }}
      >
        {loading ? "Saving..." : "Save workspace info →"}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        All fields are optional. You can update these any time in the workspace settings.
      </p>
    </form>
  );
}
