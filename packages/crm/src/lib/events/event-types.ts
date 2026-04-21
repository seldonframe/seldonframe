export const BUILT_IN_EVENT_TYPE_SUGGESTIONS = [
  "contact.created",
  "contact.updated",
  "deal.stage_changed",
  "form.submitted",
  "booking.created",
  "booking.completed",
  "booking.cancelled",
  "booking.no_show",
  "email.sent",
  "email.delivered",
  "email.opened",
  "email.clicked",
  "email.bounced",
  "email.replied",
  "email.suppressed",
  "sms.sent",
  "sms.delivered",
  "sms.replied",
  "sms.failed",
  "sms.suppressed",
  "conversation.turn.received",
  "conversation.turn.sent",
  "landing.visited",
  "landing.converted",
  "payment.completed",
  "payment.failed",
  "subscription.created",
  "subscription.cancelled",
  "invoice.created",
  "portal.login",
  "portal.message_sent",
  "portal.resource_viewed",
] as const;

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

export function isValidEventType(value: string) {
  return EVENT_TYPE_PATTERN.test(value.trim());
}
