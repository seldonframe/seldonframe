// Per-deployment agent persona — the pure customization resolver.
//
// A builder ships ONE agent template (the product). Each client/buyer deploys a
// copy and customizes their own instance's client-facing persona — greeting,
// TTS voice, and business info — WITHOUT the builder cloning the template per
// client. The template holds DEFAULTS that may carry `{placeholders}` (e.g. the
// greeting "Thanks for calling {business_name}!"); the deployment holds the
// per-client overrides. This module owns:
//   - the `DeploymentCustomization` type (+ `DeploymentBusinessInfo`)
//   - `fillPlaceholders(text, vars)` — substitute `{token}`s from the client's
//     business info, dropping unknown/blank tokens CLEANLY (so the agent never
//     reads a literal "{business_name}" aloud)
//   - `resolveDeploymentPersona(args)` — the single source of truth for the
//     EFFECTIVE persona the voice + chat runtimes use: greeting/prompt/voiceId/
//     businessName, applying override-or-placeholder-fill precedence.
//
// Booking rules are the sibling layer (`deployments.booking_policy` +
// `resolveBookingPolicy`); this is the parallel "everything-else" persona layer.
//
// Pure: no I/O, no DB, no clock. Nothing here throws — a live call must always
// end up with a usable persona, so missing/blank inputs degrade to a clean
// result rather than an error or a leaked placeholder.

/** A client's business facts, used to fill the template's `{placeholders}` and
 *  to ground the agent. Every field optional — a deployment fills what it knows. */
export type DeploymentBusinessInfo = {
  name?: string;
  hours?: string;
  address?: string;
  phone?: string;
  email?: string;
};

/** A single client-facing FAQ entry (question + answer). */
export type DeploymentFaqEntry = { q: string; a: string };

/** A single client-facing service offering. `name` required; the rest optional. */
export type DeploymentService = { name: string; description?: string; price?: string };

/** A deployment's per-client persona overrides over the agent template default.
 *  `greeting` is a FULL override of the spoken/written greeting; `voiceId` a TTS
 *  voice override; `businessInfo` the facts that fill the template's placeholders
 *  (and from which the effective business name is derived). `script`, `faq`, and
 *  `services` are FULL overrides too: an explicit `script` replaces the template
 *  script VERBATIM (no placeholder-fill — it was authored for this client), and a
 *  non-empty `faq`/`services` array replaces the template's WHOLE (no element
 *  merge). `reviewUrl` is the CLIENT's own Google review link the review-requester
 *  agent puts in its ask — per-client, because the link belongs to the client's
 *  Google Business Profile, not the shared template (the template's
 *  `blueprint.reviewUrl` is only the agency-wide fallback/default). Any of these
 *  left absent (or, for the arrays, empty) defers to the template default. */
export type DeploymentCustomization = {
  greeting?: string;
  voiceId?: string;
  businessInfo?: DeploymentBusinessInfo;
  script?: string;
  faq?: DeploymentFaqEntry[];
  services?: DeploymentService[];
  /** The client's own Google review URL (review-requester agents). Overrides the
   *  template's `blueprint.reviewUrl`; absent/blank/`null` → the template's link is
   *  used (and if neither exists, the review ask is skipped — it's worthless
   *  without a link). `null` is the CLEAR sentinel the editor persists to drop just
   *  this field; the resolver (`resolveReviewUrl` → `firstNonEmpty`) treats
   *  null/blank identically to absent. Resolved on the runtime path. */
  reviewUrl?: string | null;
  /** 2026-06-29 (marketplace buyer onboarding) — the buyer's resumable
   *  setup-wizard progress (which onboarding steps are done). Rides this existing
   *  jsonb so the buyer flow needs NO migration. Purely a buyer-surface concern:
   *  the persona resolver (`resolveDeploymentPersona`) never reads it, so the
   *  voice/chat runtime is byte-for-byte unaffected. Absent on agency-created
   *  deployments. See lib/marketplace/onboarding/progress.ts. */
  onboardingProgress?: import("@/lib/marketplace/onboarding/progress").OnboardingProgress;
  /** 2026-07-16 (marketplace generalize) — this deployment's fill values for
   *  the template's DECLARED `templateVariables` (AgentBlueprint.templateVariables).
   *  Keyed by the variable's snake_case token name. `resolveDeploymentPersona`
   *  merges these OVER the businessInfo-derived vars before `fillPlaceholders`
   *  — an explicit template var wins on token-name collision, because it was
   *  authored specifically for this template (vs. the generic business-info
   *  fallback). Absent → the vars object is exactly what businessInfo produces
   *  today (byte-identical current behavior). */
  templateVarValues?: Record<string, string>;
};

/**
 * Resolve the EFFECTIVE review URL a deployed review-requester agent should use:
 * the deployment's per-client `customization.reviewUrl` if it's a non-empty
 * string (the client's own GBP link wins), else the agent template's
 * `blueprint.reviewUrl` (the agency-wide fallback/default), else null.
 *
 * Pure; never throws. A null result means "no link at all" — the caller skips
 * the ask (run-event-agent does exactly this), because a review request with no
 * link is worthless. Trimmed so a whitespace-only value is treated as absent.
 */
export function resolveReviewUrl(args: {
  customization?: DeploymentCustomization | null;
  templateReviewUrl?: string | null;
}): string | null {
  return firstNonEmpty(args.customization?.reviewUrl, args.templateReviewUrl);
}

/** Tolerant placeholder matcher: `{token}` with optional inner whitespace and a
 *  token of word-chars/spaces, so `{business_name}`, `{Business Name}`, and
 *  `{ business name }` all match. Non-greedy so adjacent tokens don't merge. */
const TOKEN_RE = /\{\s*([\w ]+?)\s*\}/g;

/** Normalize a raw token to its canonical key: lowercase, runs of whitespace →
 *  single underscore. `"Business Name"`, `" business name "`, and `"business_name"`
 *  all canonicalize to `business_name`. */
function normalizeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "_");
}

/** Tidy the wreckage left after a token is removed: collapse any run of spaces to
 *  one, strip a space sitting directly before sentence punctuation, and trim. This
 *  is what turns "Thanks for calling !" → "Thanks for calling!" and
 *  "have a great ." → "have a great." after a blank token is dropped. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, " ") // collapse double (+) spaces from a removed token
    .replace(/\s+([,.!?;:])/g, "$1") // drop a space dangling before punctuation
    .trim();
}

/**
 * Replace every `{token}` in `text` using `vars`, then tidy the result.
 *
 *   - A token canonicalizes to a key (lowercase, spaces → underscores). If
 *     `vars[key]` is a NON-EMPTY string (after trim) → substitute it verbatim.
 *   - An unknown token, or one whose value is blank/undefined → REMOVED (replaced
 *     with empty string). The agent must NEVER read a literal `{token}` aloud.
 *   - After substitution the whole string is tidied (collapse double spaces, strip
 *     a space before punctuation, trim) so a dropped token leaves no scar.
 *
 * Pure; never throws. Text with no tokens is returned tidied (effectively
 * unchanged for normal prose).
 */
export function fillPlaceholders(text: string, vars: Record<string, string | undefined>): string {
  const replaced = text.replace(TOKEN_RE, (_match, rawToken: string) => {
    const key = normalizeKey(rawToken);
    const value = vars[key];
    if (typeof value === "string" && value.trim() !== "") return value;
    return ""; // unknown or blank → drop the placeholder entirely
  });
  return tidy(replaced);
}

/** First non-empty trimmed string, else null. Used for override → fallback chains. */
function firstNonEmpty(...vals: (string | null | undefined)[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Override-wins-WHOLE for array fields (faq/services): the customization array
 *  wins only if it's a NON-EMPTY array (an empty array is treated as "not set" →
 *  fall through to the template). No element merge. Returns the chosen array or
 *  null when neither side supplies one. */
function firstNonEmptyArray<T>(...vals: (T[] | null | undefined)[]): T[] | null {
  for (const v of vals) {
    if (Array.isArray(v) && v.length > 0) return v;
  }
  return null;
}

/**
 * Resolve the EFFECTIVE persona the runtime speaks/writes AS the client, from the
 * agent-template defaults and the deployment's customization.
 *
 *   - `businessName` = `customization.businessInfo.name` ?? `clientName` (trimmed),
 *     else null. This is the canonical name everything else grounds on.
 *   - `vars` is built from `businessInfo` (with `business_name` taken from the
 *     resolved `businessName`); only non-empty fields are included, so an absent
 *     field's token gets DROPPED rather than filled with blank.
 *   - `greeting` = the deployment's full `greeting` override (trimmed) if present;
 *     else the template greeting with its placeholders filled; else null.
 *   - `prompt` = the deployment's full `script` override (trimmed) used VERBATIM if
 *     present (an explicit override is authored for this client — its `{tokens}`
 *     are NOT filled); else the template script with its placeholders filled; else
 *     null. The placeholder-fill path is what kills the live "thanks for calling
 *     {business name}, have a great day" leak — the template's tokens are filled
 *     (or cleanly dropped) before runtime.
 *   - `voiceId` = the deployment's `voiceId` override (trimmed) ?? the template
 *     voice ?? null.
 *   - `faq` = the deployment's non-empty `faq` array (wins WHOLE, no element merge)
 *     ?? `templateFaq` ?? null.
 *   - `services` = the deployment's non-empty `services` array (wins WHOLE) ??
 *     `templateServices` ?? null.
 *
 * Pure; never throws. Callers fall back to today's values when a field is null.
 */
export function resolveDeploymentPersona(args: {
  templateGreeting?: string | null;
  templateScript?: string | null;
  templateVoiceId?: string | null;
  templateFaq?: DeploymentFaqEntry[] | null;
  templateServices?: DeploymentService[] | null;
  customization?: DeploymentCustomization | null;
  clientName?: string | null;
}): {
  greeting: string | null;
  prompt: string | null;
  voiceId: string | null;
  businessName: string | null;
  faq: DeploymentFaqEntry[] | null;
  services: DeploymentService[] | null;
} {
  const {
    templateGreeting,
    templateScript,
    templateVoiceId,
    templateFaq,
    templateServices,
    customization,
    clientName,
  } = args;
  const info = customization?.businessInfo;

  const businessName = firstNonEmpty(info?.name, clientName);

  // Build the placeholder vars from the client's business info. `business_name`
  // uses the resolved businessName (so the clientName fallback also fills it).
  // Only non-empty values are added → an absent field's token is dropped.
  const vars: Record<string, string | undefined> = {};
  const add = (key: string, value: string | null | undefined) => {
    if (typeof value === "string" && value.trim() !== "") vars[key] = value.trim();
  };
  add("business_name", businessName);
  add("hours", info?.hours);
  add("address", info?.address);
  add("phone", info?.phone);
  add("email", info?.email);

  // Template-declared variable fill values (marketplace generalize) win OVER
  // the businessInfo-derived vars on token-name collision — they were filled
  // explicitly for THIS template's declared placeholders. Absent/empty →
  // `vars` is untouched, so this is a no-op for every deployment that predates
  // the feature (byte-identical current behavior).
  const templateVarValues = customization?.templateVarValues;
  if (templateVarValues) {
    for (const [key, value] of Object.entries(templateVarValues)) {
      add(key, value);
    }
  }

  const greetingOverride = firstNonEmpty(customization?.greeting);
  const greeting =
    greetingOverride ??
    (templateGreeting ? fillPlaceholders(templateGreeting, vars) : null);

  // An explicit `script` override is used VERBATIM — it was authored for this
  // client, so its `{tokens}` are NOT substituted. Only the TEMPLATE script gets
  // placeholder-filled (the live-leak fix). A blank override falls through.
  const scriptOverride = firstNonEmpty(customization?.script);
  const prompt =
    scriptOverride ?? (templateScript ? fillPlaceholders(templateScript, vars) : null);

  const voiceId = firstNonEmpty(customization?.voiceId, templateVoiceId);

  // Override-wins-WHOLE: a non-empty customization array replaces the template's
  // outright (no element merge); empty/absent defers to the template.
  const faq = firstNonEmptyArray(customization?.faq, templateFaq);
  const services = firstNonEmptyArray(customization?.services, templateServices);

  return { greeting, prompt, voiceId, businessName, faq, services };
}
