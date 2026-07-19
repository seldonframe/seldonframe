// Pure grading logic for /tools/website-grader — the Local Business Website
// Grader. Zero I/O: every function here takes an already-fetched HTML string
// (plus a couple of fetch-timing facts the route measures) and returns check
// results + a 0-100 score. This split keeps the scoring logic unit-testable
// without a network stack, and keeps the API route a thin I/O shell.
//
// Parsing strategy: cheap regex/string scanning over the raw HTML. No DOM
// parser, no new dependency (per plan: no cheerio) — local-business marketing
// pages are simple enough that this is reliable, and a false positive/negative
// on a single check just nudges the score, it never crashes.

export type CheckStatus = "pass" | "warn" | "fail";

export type CheckResult = {
  id: string;
  label: string;
  status: CheckStatus;
  /** Plain-language explanation of why this matters for a local business. */
  why: string;
  /** What to do about it. Present for warn/fail; also present (as praise) for pass. */
  fix: string;
  /** Points earned out of `weight` for this check. */
  points: number;
  weight: number;
};

export type GradeInput = {
  html: string;
  /** The URL that was actually fetched (after any redirects), used for the
   *  HTTPS check. */
  finalUrl: string;
  /** True if the ORIGINAL user-entered URL was http:// and the fetch
   *  followed a redirect to https://. */
  redirectedToHttps: boolean;
  /** Response timing in ms (TTFB estimate — see check 10). Null if unknown. */
  responseTimeMs: number | null;
  /** Byte size of the fetched body. Null if unknown. */
  pageBytes: number | null;
};

export type GradeResult = {
  score: number;
  grade: string;
  checks: CheckResult[];
};

// ── Weights ──────────────────────────────────────────────────────────────────
// One exported table so the score always sums to 100 and the UI/tests can
// both read the same source of truth.
export const CHECK_WEIGHTS = {
  https: 12,
  clickToCall: 12,
  booking: 14,
  leadForm: 12,
  titleMeta: 10,
  viewport: 8,
  schema: 10,
  h1: 8,
  imageAlt: 8,
  speed: 6,
} as const;

const TOTAL_WEIGHT = Object.values(CHECK_WEIGHTS).reduce((sum, w) => sum + w, 0);

function letterGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function stripScriptsAndStyles(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

// ── Individual checks ────────────────────────────────────────────────────────
// Each is a small pure function: (html, ctx) -> CheckResult. Kept separate so
// they're each independently testable and readable.

function checkHttps(input: GradeInput): CheckResult {
  const weight = CHECK_WEIGHTS.https;
  const isHttps = input.finalUrl.toLowerCase().startsWith("https://");
  if (isHttps && input.redirectedToHttps) {
    return {
      id: "https",
      label: "HTTPS",
      status: "pass",
      why: "HTTPS is a baseline trust signal — browsers flag http:// sites as 'Not Secure', and Google factors it into ranking.",
      fix: "Your site redirects http → https correctly.",
      points: weight,
      weight,
    };
  }
  if (isHttps) {
    return {
      id: "https",
      label: "HTTPS",
      status: "pass",
      why: "HTTPS is a baseline trust signal — browsers flag http:// sites as 'Not Secure', and Google factors it into ranking.",
      fix: "Your site is served over HTTPS.",
      points: weight,
      weight,
    };
  }
  return {
    id: "https",
    label: "HTTPS",
    status: "fail",
    why: "HTTPS is a baseline trust signal — browsers flag http:// sites as 'Not Secure', and Google factors it into ranking.",
    fix: "Get an SSL certificate and force all traffic to https:// (most hosts offer this for free, e.g. Let's Encrypt).",
    points: 0,
    weight,
  };
}

function checkClickToCall(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.clickToCall;
  const hasTel = /href\s*=\s*["']tel:/i.test(html);
  return {
    id: "clickToCall",
    label: "Click-to-call",
    status: hasTel ? "pass" : "fail",
    why: "Most local-service leads happen on a phone, mid-search. A tel: link lets a visitor call you in one tap instead of memorizing or copying a number.",
    fix: hasTel
      ? "Your phone number is tappable on mobile."
      : "Add a tel: link to your phone number, e.g. <a href=\"tel:+15551234567\">Call us</a>, in the header and a visible CTA.",
    points: hasTel ? weight : 0,
    weight,
  };
}

const BOOKING_HOST_PATTERNS = [
  /calendly\.com/i,
  /cal\.com/i,
  /squareup\.com/i,
  /housecallpro\.com/i,
  /acuityscheduling\.com/i,
  /booksy\.com/i,
];
const BOOKING_PATH_PATTERN = /(?:href|src)\s*=\s*["'][^"']*\/(book|booking|schedule)(?:[/"'?]|$)/i;
const BOOKING_TEXT_PATTERN = /\b(book now|book online|schedule (an )?appointment|schedule now|get a quote|request an? (appointment|estimate))\b/i;

function checkBooking(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.booking;
  const hasHost = BOOKING_HOST_PATTERNS.some((re) => re.test(html));
  const hasPath = BOOKING_PATH_PATTERN.test(html);
  const hasText = BOOKING_TEXT_PATTERN.test(html);
  const pass = hasHost || hasPath || hasText;
  return {
    id: "booking",
    label: "Online booking",
    status: pass ? "pass" : "fail",
    why: "A booking link lets a ready buyer grab a slot at 11pm without waiting for a callback — the #1 reason local sites lose after-hours leads.",
    fix: pass
      ? "You offer a way to book online."
      : "Add a 'Book Now' or 'Schedule' button that links to a booking tool (Calendly, cal.com, Housecall Pro, Acuity, or a /book page).",
    points: pass ? weight : 0,
    weight,
  };
}

const FORM_EMBED_PATTERNS = [/formbricks/i, /typeform\.com/i, /jotform\.com/i, /gravityforms|gform_wrapper/i];
const SKIPPABLE_INPUT_TYPES = new Set(["search", "hidden", "submit", "button", "image", "reset"]);

function checkLeadForm(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.leadForm;

  const hasEmbed = FORM_EMBED_PATTERNS.some((re) => re.test(html));

  let hasRealForm = false;
  const formBlocks = html.match(/<form[\s\S]*?<\/form>/gi) ?? [];
  for (const block of formBlocks) {
    const inputTags = block.match(/<input\b[^>]*>/gi) ?? [];
    const hasTextarea = /<textarea\b/i.test(block);
    const hasSelect = /<select\b/i.test(block);
    const hasQualifyingInput = inputTags.some((tag) => {
      const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
      const type = (typeMatch?.[1] ?? "text").toLowerCase();
      return !SKIPPABLE_INPUT_TYPES.has(type);
    });
    if (hasQualifyingInput || hasTextarea || hasSelect) {
      hasRealForm = true;
      break;
    }
  }

  const pass = hasEmbed || hasRealForm;
  return {
    id: "leadForm",
    label: "Lead form",
    status: pass ? "pass" : "fail",
    why: "Not everyone wants to call. A short lead form captures visitors who'd rather type than talk — skip it and you lose those leads to a competitor's site.",
    fix: pass
      ? "You have a way for visitors to submit their info without calling."
      : "Add a short contact/quote form (name, phone, what they need) — a form embed (Formbricks, Typeform, Jotform) or a plain HTML <form> both work.",
    points: pass ? weight : 0,
    weight,
  };
}

function checkTitleMeta(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.titleMeta;
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const descMatch = /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']*)["']/i.exec(html)
    ?? /<meta[^>]*content\s*=\s*["']([^"']*)["'][^>]*name\s*=\s*["']description["']/i.exec(html);
  const description = descMatch?.[1]?.trim() ?? "";

  const titleOk = title.length >= 10 && title.length <= 70;
  const descOk = description.length >= 50 && description.length <= 165;

  if (!title && !description) {
    return {
      id: "titleMeta",
      label: "Title & meta description",
      status: "fail",
      why: "The title and meta description are what show up as your headline and blurb in Google search results — no title means Google writes it for you, often badly.",
      fix: "Add a <title> (roughly 10-70 characters, business + service + city) and a <meta name=\"description\"> (roughly 50-165 characters) to your page <head>.",
      points: 0,
      weight,
    };
  }
  if (title && description && titleOk && descOk) {
    return {
      id: "titleMeta",
      label: "Title & meta description",
      status: "pass",
      why: "The title and meta description are what show up as your headline and blurb in Google search results — no title means Google writes it for you, often badly.",
      fix: "Your title and meta description are present and reasonably sized.",
      points: weight,
      weight,
    };
  }
  return {
    id: "titleMeta",
    label: "Title & meta description",
    status: "warn",
    why: "The title and meta description are what show up as your headline and blurb in Google search results — no title means Google writes it for you, often badly.",
    fix: !title
      ? "Add a <title> tag."
      : !description
        ? "Add a <meta name=\"description\"> tag."
        : "Adjust length — aim for a title around 10-70 characters and a description around 50-165 characters.",
    points: Math.round(weight * 0.5),
    weight,
  };
}

function checkViewport(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.viewport;
  const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(html);
  return {
    id: "viewport",
    label: "Mobile viewport",
    status: hasViewport ? "pass" : "fail",
    why: "Most local searches happen on a phone. Without a viewport meta tag, mobile browsers render a shrunk desktop layout that visitors have to pinch-zoom to read.",
    fix: hasViewport
      ? "Your page declares a mobile viewport."
      : "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to your <head>.",
    points: hasViewport ? weight : 0,
    weight,
  };
}

function checkSchema(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.schema;
  const ldBlocks = html.match(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  let hasLocalBusiness = false;
  for (const block of ldBlocks) {
    if (/["']@type["']\s*:\s*["'](?:[A-Za-z]*)?(LocalBusiness|Restaurant|Store|HomeAndConstructionBusiness|ProfessionalService|AutoRepair|Dentist|Plumber|Electrician|HairSalon|Attorney)/i.test(block)) {
      hasLocalBusiness = true;
      break;
    }
  }
  return {
    id: "schema",
    label: "LocalBusiness schema",
    status: hasLocalBusiness ? "pass" : "fail",
    why: "LocalBusiness structured data tells Google (and now AI answer engines) your hours, address, and category as verified facts instead of guesses — it's what powers the map-pack card.",
    fix: hasLocalBusiness
      ? "You have LocalBusiness (or a subtype) JSON-LD schema."
      : "Add a <script type=\"application/ld+json\"> block with @type: \"LocalBusiness\" (or a more specific subtype) including name, address, phone, and hours.",
    points: hasLocalBusiness ? weight : 0,
    weight,
  };
}

function checkH1(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.h1;
  const h1s = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
  if (h1s.length === 1) {
    return {
      id: "h1",
      label: "H1 heading",
      status: "pass",
      why: "The H1 is the clearest signal to both visitors and search engines of what the page is about — exactly one keeps that signal unambiguous.",
      fix: "You have exactly one H1.",
      points: weight,
      weight,
    };
  }
  if (h1s.length === 0) {
    return {
      id: "h1",
      label: "H1 heading",
      status: "fail",
      why: "The H1 is the clearest signal to both visitors and search engines of what the page is about — exactly one keeps that signal unambiguous.",
      fix: "Add one <h1> with your business name/service + city near the top of the page.",
      points: 0,
      weight,
    };
  }
  return {
    id: "h1",
    label: "H1 heading",
    status: "warn",
    why: "The H1 is the clearest signal to both visitors and search engines of what the page is about — exactly one keeps that signal unambiguous.",
    fix: `You have ${h1s.length} H1 tags — consolidate to exactly one, with supporting headings as H2/H3.`,
    points: Math.round(weight * 0.5),
    weight,
  };
}

function checkImageAlt(html: string): CheckResult {
  const weight = CHECK_WEIGHTS.imageAlt;
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  if (imgTags.length === 0) {
    return {
      id: "imageAlt",
      label: "Image alt text",
      status: "warn",
      why: "Alt text lets screen readers and search engines understand your images — job photos are some of the highest-trust content on a local business site.",
      fix: "No <img> tags were found to check. If your site has photos of your work, make sure they load as real <img> elements with descriptive alt text.",
      points: Math.round(weight * 0.5),
      weight,
    };
  }
  const withAlt = imgTags.filter((tag) => {
    const m = /alt\s*=\s*["']([^"']*)["']/i.exec(tag);
    return Boolean(m && m[1].trim().length > 0);
  }).length;
  const coverage = withAlt / imgTags.length;
  if (coverage >= 0.9) {
    return {
      id: "imageAlt",
      label: "Image alt text",
      status: "pass",
      why: "Alt text lets screen readers and search engines understand your images — job photos are some of the highest-trust content on a local business site.",
      fix: `${withAlt}/${imgTags.length} images have alt text.`,
      points: weight,
      weight,
    };
  }
  const status: CheckStatus = coverage >= 0.5 ? "warn" : "fail";
  return {
    id: "imageAlt",
    label: "Image alt text",
    status,
    why: "Alt text lets screen readers and search engines understand your images — job photos are some of the highest-trust content on a local business site.",
    fix: `Only ${withAlt}/${imgTags.length} images (${Math.round(coverage * 100)}%) have alt text. Add a short, descriptive alt to each — e.g. "kitchen remodel in Austin TX".`,
    points: Math.round(weight * coverage),
    weight,
  };
}

function checkSpeed(input: GradeInput): CheckResult {
  const weight = CHECK_WEIGHTS.speed;
  const { responseTimeMs, pageBytes } = input;
  if (responseTimeMs == null) {
    return {
      id: "speed",
      label: "Response time",
      status: "warn",
      why: "A slow-loading site loses mobile visitors before they ever see your number — every extra second of load time measurably increases bounce rate.",
      fix: "Could not measure response time for this fetch. Try again, or test with a dedicated speed tool for a fuller picture.",
      points: Math.round(weight * 0.5),
      weight,
    };
  }
  const sizeNote = pageBytes != null ? ` (page was ${(pageBytes / 1024).toFixed(0)}KB)` : "";
  if (responseTimeMs <= 1500) {
    return {
      id: "speed",
      label: "Response time",
      status: "pass",
      why: "A slow-loading site loses mobile visitors before they ever see your number — every extra second of load time measurably increases bounce rate.",
      fix: `Responded in ${Math.round(responseTimeMs)}ms${sizeNote}. Note: this is a single-sample estimate from one server-side fetch, not a full multi-region speed test.`,
      points: weight,
      weight,
    };
  }
  return {
    id: "speed",
    label: "Response time",
    status: "warn",
    why: "A slow-loading site loses mobile visitors before they ever see your number — every extra second of load time measurably increases bounce rate.",
    fix: `Took ${Math.round(responseTimeMs)}ms to respond${sizeNote} — over the 1.5s guideline. This is a single-sample estimate, not a full speed audit, but worth checking image sizes and hosting. Consider a dedicated tool (PageSpeed Insights) for a full picture.`,
    points: Math.round(weight * 0.4),
    weight,
  };
}

/**
 * PURE. Run all 10 checks against a fetched HTML string and derive a 0-100
 * score + letter grade. Never throws — malformed/empty HTML degrades
 * individual checks to fail/warn rather than crashing (regexes on a string
 * always terminate, so this is naturally safe against malformed markup).
 */
export function gradeWebsite(input: GradeInput): GradeResult {
  const html = stripScriptsAndStyles(input.html ?? "");
  const rawHtml = input.html ?? "";

  const checks: CheckResult[] = [
    checkHttps(input),
    checkClickToCall(rawHtml),
    checkBooking(rawHtml),
    checkLeadForm(rawHtml),
    checkTitleMeta(rawHtml),
    checkViewport(rawHtml),
    checkSchema(rawHtml),
    checkH1(html),
    checkImageAlt(rawHtml),
    checkSpeed(input),
  ];

  const earned = checks.reduce((sum, c) => sum + c.points, 0);
  const score = Math.round((earned / TOTAL_WEIGHT) * 100);

  return { score, grade: letterGrade(score), checks };
}
