// landing/_shared/phone.ts
//
// One-line tel: helper. Per the brief: render the phone string verbatim from
// the LLM payload (any format — (209) 555-0144 / 209.555.0144 / +1 209-555-0144).
// For the tel: href, strip non-digits and prefix +1 for 10-digit US numbers.
// No libphonenumber-js dependency.

export function telHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return `tel:${digits}`;
  if (digits.length === 10) return `tel:+1${digits}`;
  return `tel:${digits}`;
}

export function smsHref(phone: string): string {
  return telHref(phone).replace(/^tel:/, "sms:");
}
