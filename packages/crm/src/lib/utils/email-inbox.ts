/**
 * Resolve a deep-link URL into the user's email inbox based on their
 * email domain. Used by both the marketing login and operator portal
 * login "Open Email Inbox" buttons so the helper lives in one place.
 *
 * Returns null for unsupported providers (no button is rendered).
 */
export function resolveInboxUrl(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  if (domain === "gmail.com" || domain === "googlemail.com") {
    return "https://mail.google.com/mail/u/0/#search/from:noreply@seldonframe.com";
  }

  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return "https://outlook.live.com/mail/";
  }

  if (domain === "yahoo.com" || domain === "ymail.com") {
    return "https://mail.yahoo.com/";
  }

  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return "https://www.icloud.com/mail/";
  }

  return null;
}
