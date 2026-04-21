import type { Archetype } from "./types";

// Win-Back archetype (event+wait shape). Designed for the subscription-
// cancellation path that fits the current AgentSpec trigger model
// without scheduled/cron triggers. Yoga-style inactivity-based Win-Back
// requires Brain v2's contact.inactive_Nd synthetic event emitter and
// is V1.1 per tasks/phase-7-synthesis-spike.md's V1.1 queue.
//
// Flow ordering — corrected 2026-04-21 after Max's review:
// 1. create_coupon (unique per-contact, relative-expiry so the window
//    stays meaningful regardless of when the agent was deployed)
// 2. create_activity — logs agent initiated, records the code
// 3. wait $initialDelaySeconds (default 3 days)
// 4. send_email — warm, on-brand, references the code
// 5. wait $reminderDelaySeconds (default 4 days, so reminder lands before
//    the 14-day expiry leaves a 7-day buffer)
// 6. send_sms — shorter, less formal, references the same code
// 7. create_activity — logs agent sequence complete
//
// Deliberately NO automated create_invoice at the end. See README for
// the rationale — chargeback risk + trust cost of auto-billing a churn.
// The coupon is the offer; redemption is self-serve.

export const winBackArchetype: Archetype = {
  id: "win-back",
  name: "Win-Back",
  description:
    "Offer a time-limited unique discount code to recently-cancelled subscribers via email + SMS to win them back.",
  detailedDescription:
    "Fires on subscription.cancelled. Immediately creates a per-contact unique Stripe promotion code (14-day expiry by default) on the workspace's connected Stripe account, logs an agent_action activity with the code for audit, then waits 3 days before sending a warm email with the code, 4 more days before a follow-up SMS reminder, and logs the sequence complete. Does NOT automatically create an invoice — the discount is the offer, redemption is self-serve. Chargeback risk + trust cost of auto-billing a recent churn is too high to justify.",
  requiresInstalled: ["crm", "email", "sms", "payments"],
  knownLimitations: [
    {
      summary: "Single-event trigger (subscription.cancelled).",
      detail:
        "For payment.failed-triggered Win-Back flows, clone this archetype and swap the trigger event — AgentSpec doesn't support OR-triggers in v1. Adding multi-event triggers is V1.1.",
    },
    {
      summary: "Shared expiry window across all recipients.",
      detail:
        "Every contact who hits this agent gets a unique redeemable code, but all codes share the same expiry horizon ($couponDurationDays from trigger-fire time). Per-contact custom expiry (VIP gets 30 days, trial-lapse gets 7 days) is V1.1.",
    },
    {
      summary: "Inactivity-based Win-Back NOT supported in v1.",
      detail:
        "Yoga / gym / attendance-based 'hasn't visited in 60 days' Win-Back requires Brain v2's contact.inactive_Nd synthetic event emitter, which is V1.1. Use this subscription-cancelled shape for SaaS, coaching, service-business verticals where a cancel signal exists.",
    },
  ],
  placeholders: {
    $discountPercent: {
      kind: "user_input",
      description:
        "Discount percentage to offer on redemption (1–100). A common range is 15–30 for Win-Back — too small and it doesn't move the needle, too large and it trains customers to cancel to get deals.",
      example: "20",
    },
    $couponDurationDays: {
      kind: "user_input",
      description:
        "How many days the promotion code stays redeemable after the agent fires. Default 14 covers the email send (day 3) + SMS send (day 7) + buffer for the customer to decide.",
      example: "14",
    },
    $initialDelaySeconds: {
      kind: "user_input",
      description:
        "Seconds after the cancellation event before the first email. Default 259200 (3 days) — long enough to avoid looking desperate, short enough to catch the customer while the decision is still malleable.",
      example: "259200",
    },
    $reminderDelaySeconds: {
      kind: "user_input",
      description:
        "Seconds after the first email before the SMS reminder. Default 345600 (4 days) — lands the reminder on day 7, leaving 7 more days before the 14-day coupon expiry.",
      example: "345600",
    },
    $couponName: {
      kind: "soul_copy",
      description:
        "Short human-readable name for the coupon on the Stripe dashboard (≤60 chars). Shown to the SMB in Stripe's admin UI — make it obvious this came from the Win-Back agent.",
      soulFields: ["businessName"],
      example: "Bright Smile Dental — Win-Back 20% off",
    },
    $winBackEmailSubject: {
      kind: "soul_copy",
      description:
        "Email subject line. Warm, on-brand, not overly salesy. Avoid 'we miss you' clichés if Soul tone is anything but casual. Include the discount number when it helps urgency.",
      soulFields: ["businessName", "tone"],
      example: "A thought — here's 20% off if you come back",
    },
    $winBackEmailBody: {
      kind: "soul_copy",
      description:
        "Email body. Acknowledges their cancellation without guilt-tripping, restates the core offer briefly, presents the discount code, explains the expiry window, offers a 'reply if you have questions' out. Must reference {{coupon.code}} for the actual code string and the expiry. Keep under 200 words.",
      soulFields: ["businessName", "tone", "mission", "offer"],
      example:
        "Hi {{firstName}},\\n\\nWe noticed you cancelled your subscription. No pressure — life happens — but I wanted to personally send you a 20% discount code if you ever want to come back:\\n\\n{{coupon.code}}\\n\\nGood for 14 days. Use it at checkout the next time you book.\\n\\nIf there was something specific that wasn't working, I'd genuinely like to know — hit reply and I read every one.\\n\\nWarmly,\\nThe Bright Smile team",
    },
    $winBackSmsBody: {
      kind: "soul_copy",
      description:
        "SMS reminder body. Much shorter than the email — under 160 chars if possible, under 320 strictly. Less formal, more immediate. Mentions the code is expiring to create the time-boxed pull. Must reference {{coupon.code}}. No email-style sign-offs; this reads like a text from a thoughtful shop owner, not an agency.",
      soulFields: ["businessName", "tone"],
      example:
        "Hey {{firstName}}, just a heads up — your {{coupon.code}} discount code is good for a few more days. Grab it if you want to come back. No pressure either way!",
    },
  },
  specTemplate: {
    name: "Win-Back",
    description:
      "Offer a unique per-contact discount code to recently-cancelled subscribers via email + SMS.",
    trigger: {
      type: "event",
      event: "subscription.cancelled",
    },
    variables: {
      contactId: "trigger.contactId",
      firstName: "trigger.contact.firstName",
      email: "trigger.contact.email",
      phone: "trigger.contact.phone",
    },
    steps: [
      {
        id: "create_winback_coupon",
        type: "mcp_tool_call",
        tool: "create_coupon",
        args: {
          percent_off: "$discountPercent",
          duration: "once",
          name: "$couponName",
          max_redemptions: 1,
          expires_in_days: "$couponDurationDays",
        },
        capture: "coupon",
        next: "log_winback_initiated",
      },
      {
        id: "log_winback_initiated",
        type: "mcp_tool_call",
        tool: "create_activity",
        args: {
          contact_id: "{{contactId}}",
          type: "agent_action",
          subject: "Win-Back agent initiated",
          body: "Created unique coupon code {{coupon.code}} — valid for $couponDurationDays days.",
          metadata: {
            source: "win-back",
            stage: "initiated",
            couponId: "{{coupon.couponId}}",
            promotionCodeId: "{{coupon.promotionCodeId}}",
            code: "{{coupon.code}}",
          },
        },
        next: "wait_before_email",
      },
      {
        id: "wait_before_email",
        type: "wait",
        seconds: "$initialDelaySeconds",
        next: "send_winback_email",
      },
      {
        id: "send_winback_email",
        type: "mcp_tool_call",
        tool: "send_email",
        args: {
          to: "{{email}}",
          subject: "$winBackEmailSubject",
          body: "$winBackEmailBody",
          contactId: "{{contactId}}",
        },
        next: "wait_before_reminder",
      },
      {
        id: "wait_before_reminder",
        type: "wait",
        seconds: "$reminderDelaySeconds",
        next: "send_winback_sms",
      },
      {
        id: "send_winback_sms",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          to: "{{phone}}",
          body: "$winBackSmsBody",
          contact_id: "{{contactId}}",
        },
        next: "log_winback_complete",
      },
      {
        id: "log_winback_complete",
        type: "mcp_tool_call",
        tool: "create_activity",
        args: {
          contact_id: "{{contactId}}",
          type: "agent_action",
          subject: "Win-Back agent sequence complete",
          body: "Delivered email + SMS with coupon {{coupon.code}}. Redemption (if any) will surface as a payment event on the workspace's Stripe Connect account.",
          metadata: {
            source: "win-back",
            stage: "complete",
            couponId: "{{coupon.couponId}}",
            code: "{{coupon.code}}",
          },
        },
        next: null,
      },
    ],
  },
};
