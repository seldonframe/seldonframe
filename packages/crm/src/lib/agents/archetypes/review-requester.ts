import type { Archetype } from "./types";

// Review Requester archetype. Fires on booking.completed — after a
// customer has experienced the service. Waits a short "reflect" window,
// sends a warm email with the review URL, waits longer, sends a shorter
// SMS reminder with the same URL.
//
// Honest limitation: the SMS reminder fires regardless of whether the
// customer has already submitted a review. We have no event on
// review.submitted in the v1 SeldonEvent vocabulary; adding conditional
// suppression requires either a new event emitter (custom block) or
// V1.1's branch step reading external state. Documented loudly in the
// README so users don't discover the duplicate-ask at use-time.

export const reviewRequesterArchetype: Archetype = {
  id: "review-requester",
  name: "Review Requester",
  description:
    "After a completed booking, ask for a review via email, with an SMS nudge if they haven't responded a few days later.",
  detailedDescription:
    "Fires on booking.completed. Waits a short reflect window, sends a warm email with a review link, waits 5 days, sends a shorter SMS reminder with the same link, logs a sequence-complete activity. Works with any review destination: Google Business Profile URL (recommended for local SEO), Yelp, industry-specific sites, or your own internal form for rating capture. See README for the $reviewLink flexibility note + the review-gating compliance flag.",
  requiresInstalled: ["crm", "email", "sms", "caldiy-booking"],
  knownLimitations: [
    {
      summary: "SMS reminder fires unconditionally.",
      detail:
        "V1 has no review.submitted event, so the SMS reminder fires 5 days after the email regardless of whether the customer already left a review. V1.1 will add conditional suppression when the branch step type supports external-state checks. Users who want immediate conditional behavior can manually deactivate the agent per-customer after a review lands, or pair with a custom block that emits review.submitted events.",
    },
    {
      summary: "$reviewLink is treated as opaque by the archetype.",
      detail:
        "We pass the URL through verbatim into email + SMS bodies. The archetype doesn't know whether you're pointing at Google, Yelp, or an internal form. If you build an internal form that filters positive vs negative responses (review gating), see the README compliance note — some jurisdictions regulate this pattern.",
    },
  ],
  placeholders: {
    $reviewLink: {
      kind: "user_input",
      description:
        "URL where the customer will leave their review. Google Business Profile URL (recommended for local SEO), Yelp or industry-specific review site, or your own internal form. Must be a full https:// URL — embedded verbatim in email + SMS copy.",
      example: "https://g.page/r/Ca-example-business/review",
    },
    $initialDelaySeconds: {
      kind: "user_input",
      description:
        "Seconds after booking.completed before the review email fires. Default 172800 (2 days) — long enough that the experience has been reflected on, short enough that memory is fresh.",
      example: "172800",
    },
    $reminderDelaySeconds: {
      kind: "user_input",
      description:
        "Seconds after the email before the SMS reminder fires. Default 432000 (5 days) — mid-range of the standard 3–7 day follow-up window. NOTE: fires unconditionally regardless of whether the customer already left a review (see known-limitations). Users who want conditional suppression pair with a custom review.submitted event emitter (V1.1).",
      example: "432000",
    },
    $reviewEmailSubject: {
      kind: "soul_copy",
      description:
        "Email subject line. Warm, specific to the service they received. Avoids generic 'please leave us a review' clichés. Keep under 60 chars.",
      soulFields: ["businessName", "tone"],
      example: "Thanks for visiting — would you share your experience?",
    },
    $reviewEmailBody: {
      kind: "soul_copy",
      description:
        "Email body asking for a review. Warm, on-brand, thanks them for visiting by name, briefly explains why reviews matter for the business (honest, not desperate), and includes the full $reviewLink URL verbatim as a clickable link. Offers a feedback reply-path for customers who had issues ('if something wasn't right, hit reply'). Keep under 150 words. Must include the exact URL provided in $reviewLink.",
      soulFields: ["businessName", "tone", "mission"],
      example:
        "Hi {{firstName}},\\n\\nThanks so much for visiting us today. If you have 30 seconds, we'd really appreciate a quick review — it helps other people find us:\\n\\nhttps://g.page/r/Ca-example-business/review\\n\\nAnd if anything didn't sit right, please reply to this email directly. We read every one.\\n\\nWarmly,\\nThe team",
    },
    $reviewSmsBody: {
      kind: "soul_copy",
      description:
        "SMS reminder body. Much shorter than the email — under 200 chars. Less formal, more immediate. Acknowledges this is a quick follow-up, includes the full $reviewLink URL. No email-style sign-offs. Must include the exact URL provided in $reviewLink.",
      soulFields: ["businessName", "tone"],
      example:
        "Hey {{firstName}}, quick follow-up — if you have 30 seconds, we'd love a quick review: https://g.page/r/Ca-example-business/review  Thanks! — Bright Smile",
    },
  },
  specTemplate: {
    name: "Review Requester",
    description:
      "Request a review from a customer via email 2 days after their booking completes, with an SMS reminder 5 days after the email.",
    trigger: {
      type: "event",
      event: "booking.completed",
    },
    variables: {
      contactId: "trigger.contactId",
      firstName: "trigger.contact.firstName",
      email: "trigger.contact.email",
      phone: "trigger.contact.phone",
    },
    steps: [
      {
        id: "wait_before_email",
        type: "wait",
        seconds: "$initialDelaySeconds",
        next: "send_review_email",
      },
      {
        id: "send_review_email",
        type: "mcp_tool_call",
        tool: "send_email",
        args: {
          to: "{{email}}",
          subject: "$reviewEmailSubject",
          body: "$reviewEmailBody",
          contactId: "{{contactId}}",
        },
        next: "wait_before_sms",
      },
      {
        id: "wait_before_sms",
        type: "wait",
        seconds: "$reminderDelaySeconds",
        next: "send_review_sms",
      },
      {
        id: "send_review_sms",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          to: "{{phone}}",
          body: "$reviewSmsBody",
          contact_id: "{{contactId}}",
        },
        next: "log_review_request_complete",
      },
      {
        id: "log_review_request_complete",
        type: "mcp_tool_call",
        tool: "create_activity",
        args: {
          contact_id: "{{contactId}}",
          type: "review_request",
          subject: "Review Requester agent sequence complete",
          body: "Sent review request email + SMS reminder. Review destination: the configured $reviewLink. NOTE: reminder fired unconditionally — v1 has no review.submitted event; check the configured review URL manually to see if this customer responded.",
          metadata: {
            source: "review-requester",
            stage: "complete",
          },
        },
        next: null,
      },
    ],
  },
};
