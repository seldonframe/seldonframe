import type { Archetype } from "./types";

// Weather-Aware Booking archetype — SLICE 6 PR 2 C5 per audit §11.1.
//
// First archetype to exercise the branch primitive with an
// external_state condition. Demonstrates:
//   trigger (event: booking.requested)
//     → branch (external_state on weather API)
//         on_match (rain ≥ threshold) → send_sms reschedule offer
//         on_no_match (dry enough)     → create_booking confirm
//     → send_email confirmation
//
// Use case: outdoor photoshoot / rooftop dinner / garden event where
// the booking's value is weather-dependent. The workflow checks a
// forecast API at the moment of booking request; if forecast rain
// probability >= builder's threshold, offer a reschedule instead of
// auto-confirming.
//
// Placeholders:
//   User-input:
//     $bookingSlug                — which booking appointment type
//     $weatherApiEndpoint          — builder's weather data source
//     $rainProbabilityThreshold    — match threshold (0-100)
//     $weatherApiSecretName        — workspace_secrets key for auth
//     $rescheduleSms               — SMS body for reschedule offer
//     $confirmationEmailSubject    — email subject on confirm
//     $confirmationEmailBody       — email body on confirm
//   Soul-copy: none in v1 (all copy is user-input; future revision
//   could Soul-generate the reschedule SMS + confirmation email)

export const weatherAwareBookingArchetype: Archetype = {
  id: "weather-aware-booking",
  name: "Weather-Aware Booking",
  description:
    "When someone requests an outdoor booking, check the weather forecast first. Offer reschedule if rain is likely; otherwise confirm the booking.",
  detailedDescription:
    "Fires on booking.requested. Branches on a live weather-API lookup (GET against the builder's configured endpoint) at the requested appointment time. If rain probability crosses the builder's threshold, sends an SMS offering to reschedule; otherwise creates the booking + emails confirmation. The weather API is authenticated via a workspace_secret the builder registers separately. On any external-API failure (timeout, 5xx), the branch fails the run — operators check /agents/runs for the workflow.external_state.evaluated event to triage.",
  requiresInstalled: ["crm", "caldiy-booking", "sms", "email"],
  knownLimitations: [
    {
      summary: "Single weather API assumed; no multi-provider fallback.",
      detail:
        "v1 authors wire one weather endpoint. If the configured API goes down, the branch fails the run. Post-launch, multi-provider fallback can be authored by chaining branches or by the builder owning the API aggregation layer.",
    },
    {
      summary: "Threshold is a single number (>=) — no fuzzy logic.",
      detail:
        "Builders configure a numeric rain probability (e.g., 60). Nuanced 'if rain AND temperature < 15 then reschedule' rules require multi-branch chains; single-branch v1 stays simple.",
    },
    {
      summary: "Workspace-secret registration is out-of-band.",
      detail:
        "$weatherApiSecretName references a secret the builder must register via CLI or direct DB before the agent deploys. Admin UI for secrets management is a post-launch slice.",
    },
  ],
  placeholders: {
    $bookingSlug: {
      kind: "user_input",
      description:
        "The booking appointment type slug that this agent watches. Only bookings against this appointment type trigger the workflow.",
      valuesFromTool: "list_appointment_types",
      example: "outdoor-photoshoot",
    },
    $weatherApiEndpoint: {
      kind: "user_input",
      description:
        "HTTPS URL to the weather API. Should accept a location query string and return JSON with rain probability at a well-known path.",
      example: "https://api.weatherapi.com/v1/forecast.json?q={{contactCity}}&days=1",
    },
    $rainProbabilityThreshold: {
      kind: "user_input",
      description:
        "Rain probability (0-100) at which to offer reschedule instead of confirm. 60 is a common starting value for outdoor events.",
      example: "60",
    },
    $weatherApiSecretName: {
      kind: "user_input",
      description:
        'workspace_secrets key for the weather API. The builder registers the secret separately (CLI or direct DB). Cannot be interpolated through {{secrets.X}} — must flow through auth.secret_name.',
      example: "weather_api_key",
    },
    $rescheduleSms: {
      kind: "user_input",
      description:
        "SMS body sent when the forecast crosses the threshold. Suggests rescheduling; should offer one specific alternative.",
      example: "Hi {{firstName}}! The forecast shows rain on your booked date — want to reschedule to next {{dayOfWeek}}? Reply YES to confirm.",
    },
    $confirmationEmailSubject: {
      kind: "user_input",
      description: "Subject for the confirmation email sent when weather is clear.",
      example: "Your outdoor booking is confirmed",
    },
    $confirmationEmailBody: {
      kind: "user_input",
      description: "Body for the confirmation email.",
      example:
        "Hi {{firstName}},\n\nYour outdoor booking is confirmed for {{bookingStartsAt}}. The forecast looks good — we'll see you then.\n\nThanks,\n{{brandName}}",
    },
  },
  specTemplate: {
    id: "weather-aware-booking",
    name: "Weather-Aware Booking",
    description:
      "Branches on weather-API forecast to offer reschedule vs. confirm.",
    trigger: {
      type: "event",
      event: "booking.requested",
      filter: { bookingSlug: "$bookingSlug" },
    },
    variables: {
      contactId: "trigger.contactId",
      firstName: "trigger.contact.firstName",
      email: "trigger.contact.email",
      phone: "trigger.contact.phone",
      contactCity: "trigger.contact.city",
      bookingStartsAt: "trigger.startsAt",
    },
    steps: [
      {
        id: "check_weather",
        type: "branch",
        condition: {
          type: "external_state",
          http: {
            url: "$weatherApiEndpoint",
            method: "GET",
            timeout_ms: 5000,
            auth: { type: "bearer", secret_name: "$weatherApiSecretName" },
          },
          response_path: "forecast.forecastday[0].day.daily_chance_of_rain",
          operator: "gte",
          expected: "$rainProbabilityThreshold",
          timeout_behavior: "fail",
        },
        on_match_next: "offer_reschedule",
        on_no_match_next: "confirm_booking",
      },
      {
        id: "offer_reschedule",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{phone}}",
          body: "$rescheduleSms",
        },
        next: null,
      },
      {
        id: "confirm_booking",
        type: "mcp_tool_call",
        tool: "create_booking",
        args: {
          contact_id: "{{contactId}}",
          appointment_type_id: "$bookingSlug",
          starts_at: "{{bookingStartsAt}}",
        },
        next: "send_confirmation_email",
      },
      {
        id: "send_confirmation_email",
        type: "mcp_tool_call",
        tool: "send_email",
        args: {
          to: "{{email}}",
          subject: "$confirmationEmailSubject",
          body: "$confirmationEmailBody",
        },
        next: null,
      },
    ],
  },
};
