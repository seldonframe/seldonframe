// lib/landing/r1-payload-to-template.ts
//
// Maps the R1 landing payload (the extracted, cleaned hero/services/
// testimonials/faq/footer that `/w/[slug]` already loads) onto the shared
// landing-template `Soul` contract. This makes the premium full-page
// templates (e.g. earthy-modern-clinical) *alternative renderers* of the
// same r1 content — no separate data source, no second extraction.
//
// House rules:
//   • Never throw on missing data. Every r1 sub-section is treated as
//     possibly absent / partially filled. Absent fields are OMITTED so the
//     template renders its themed placeholders rather than empty strings.
//   • The r1 service shape (`R1Service`) only carries { id, name, description }
//     and the payload carries no per-service photos — so offerings get name +
//     description, and price/duration/service-photos are picked up ONLY if a
//     future enriched payload happens to include them (tolerant, never
//     required). Hero is the one image the r1 payload reliably provides.

import type {
  R1LandingPayload,
  R1Service,
  R1Testimonial,
  R1FaqItem,
} from "./r1-payload-prompt";
import type { Soul } from "@/components/landing-templates/_contract/types";

type Photo = NonNullable<Soul["photos"]>[number];
type Offering = NonNullable<Soul["offerings"]>[number];

/** Trim a string; return undefined for empty/whitespace-only/missing. */
function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length ? t : undefined;
}

/** Keep a finite number; drop NaN / Infinity / non-numbers. */
function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * The templates render the tagline as a LARGE hero headline (the cinematic
 * ones especially). Long, multi-sentence taglines overflow above the fold and
 * bury the subhead + CTAs, so keep the headline punchy: take the first
 * sentence; hard-cap a very long single sentence at a word boundary. The full
 * description still renders in the subhead (soul_description). Returns
 * undefined for empty/missing input.
 */
function heroHeadline(tagline: string | undefined): string | undefined {
  if (!tagline) return undefined;
  const firstSentence = tagline.split(/(?<=[.!?])\s+/)[0]?.trim() || tagline;
  if (firstSentence.length <= 72) return firstSentence;
  const capped = firstSentence.slice(0, 64);
  const lastSpace = capped.lastIndexOf(" ");
  return `${(lastSpace > 40 ? capped.slice(0, lastSpace) : capped).trimEnd()}…`;
}

/**
 * Join an r1 footer address ({ line1, city, state, zip }) into the single
 * string the template expects. Omits blank parts; returns undefined when
 * nothing usable is present. Format: "line1, city, state zip".
 */
function joinAddress(
  address: R1LandingPayload["footer"]["address"],
): string | undefined {
  if (!address) return undefined;
  const line1 = clean(address.line1);
  const city = clean(address.city);
  const state = clean(address.state);
  const zip = clean(address.zip);
  const cityState = [city, state].filter(Boolean).join(", ");
  const cityStateZip = [cityState, zip].filter(Boolean).join(" ").trim();
  const out = [line1, cityStateZip].filter(Boolean).join(", ").trim();
  return out.length ? out : undefined;
}

/**
 * Map an r1 service entry → template offering. The base r1 shape has only
 * name + description; price / currency / duration are read defensively in
 * case an enriched payload provides them, but are never required.
 */
function toOffering(svc: R1Service): Offering | null {
  const name = clean(svc?.name);
  if (!name) return null; // name is the only required offering field
  const loose = svc as Partial<Offering> & R1Service;
  const offering: Offering = { name };
  const description = clean(svc.description);
  if (description) offering.description = description;
  const price = num(loose.price);
  if (price != null) offering.price = price;
  const currency = clean(loose.currency);
  if (currency) offering.currency = currency;
  const duration = num(loose.duration_minutes);
  if (duration != null) offering.duration_minutes = duration;
  return offering;
}

/** Map an r1 testimonial → template testimonial ({ name, text }). */
function toTestimonial(t: R1Testimonial): { name: string; text: string } | null {
  const text = clean(t?.quote);
  const name = clean(t?.name);
  if (!text || !name) return null;
  return { name, text };
}

/** Map an r1 faq item → template faq ({ q, a }). */
function toFaq(item: R1FaqItem): { q: string; a: string } | null {
  const q = clean(item?.question);
  const a = clean(item?.answer);
  if (!q || !a) return null;
  return { q, a };
}

/**
 * Convert an R1 landing payload into the shared template `Soul`.
 *
 * Defensive by design: any sub-section may be missing or partial. Absent
 * fields are omitted (the templates render graceful, themed placeholders).
 * The only invariant is `business_name` (always produced — falls back from
 * hero → footer → "Our Practice").
 */
export function r1PayloadToTemplateData(payload: R1LandingPayload): Soul {
  // Tolerate a malformed/partial payload object without throwing.
  const hero = payload?.hero ?? ({} as R1LandingPayload["hero"]);
  const services = payload?.services ?? ({} as R1LandingPayload["services"]);
  const testimonialsSec =
    payload?.testimonials ?? ({} as R1LandingPayload["testimonials"]);
  const faqSec = payload?.faq ?? ({} as R1LandingPayload["faq"]);
  const footer = payload?.footer ?? ({} as R1LandingPayload["footer"]);

  // ── identity ──────────────────────────────────────────────────────────────
  const business_name =
    clean(hero.businessName) ?? clean(footer.businessName) ?? "Our Practice";

  const soul: Soul = { business_name };

  const tagline = heroHeadline(clean(hero.tagline) ?? clean(footer.tagline));
  if (tagline) soul.tagline = tagline;

  const soul_description = clean(hero.subhead);
  if (soul_description) soul.soul_description = soul_description;

  // ── reviews (hero first, testimonials summary as fallback) ─────────────────
  const reviewSummary = testimonialsSec.reviewSummary;
  const review_rating = num(hero.reviewRating) ?? num(reviewSummary?.rating);
  if (review_rating != null) soul.review_rating = review_rating;
  const review_count = num(hero.reviewCount) ?? num(reviewSummary?.count);
  if (review_count != null) soul.review_count = review_count;

  if (hero.emergencyService === true) soul.emergency_service = true;

  // ── contact / location (footer) ────────────────────────────────────────────
  const phone = clean(footer.phone);
  if (phone) soul.phone = phone;
  const email = clean(footer.email);
  if (email) soul.email = email;
  const address = joinAddress(footer.address);
  if (address) soul.address = address;

  const service_area = (footer.serviceAreas ?? [])
    .map(clean)
    .filter((s): s is string => Boolean(s));
  if (service_area.length) soul.service_area = service_area;

  // ── trust signals / certifications (footer) ────────────────────────────────
  const trust_signals = (footer.trustBadges ?? [])
    .map((b) => clean(b?.label))
    .filter((s): s is string => Boolean(s));
  if (trust_signals.length) soul.trust_signals = trust_signals;

  const license = clean(footer.license);
  if (license) soul.certifications = [license];

  // ── offerings (services) ────────────────────────────────────────────────────
  const offerings = (services.services ?? [])
    .map(toOffering)
    .filter((o): o is Offering => o != null);
  if (offerings.length) soul.offerings = offerings;

  // ── testimonials ────────────────────────────────────────────────────────────
  const testimonials = (testimonialsSec.testimonials ?? [])
    .map(toTestimonial)
    .filter((t): t is { name: string; text: string } => t != null);
  if (testimonials.length) soul.testimonials = testimonials;

  // ── faqs ────────────────────────────────────────────────────────────────────
  const faqs = (faqSec.items ?? [])
    .map(toFaq)
    .filter((f): f is { q: string; a: string } => f != null);
  if (faqs.length) soul.faqs = faqs;

  // ── photos ──────────────────────────────────────────────────────────────────
  // Hero is the one image r1 reliably provides. Per-service images are mapped
  // in source order ONLY when an (enriched) service entry carries an `image`
  // url — preserving order so sfPhoto(data, "service", i) lines up with the
  // i-th offering. Absent → omitted → template placeholder.
  const photos: Photo[] = [];
  const heroUrl = clean(hero.heroImage?.src);
  if (heroUrl) {
    const heroPhoto: Photo = { url: heroUrl, role: "hero" };
    const heroAlt = clean(hero.heroImage?.alt);
    if (heroAlt) heroPhoto.alt = heroAlt;
    photos.push(heroPhoto);
  }
  for (const svc of services.services ?? []) {
    const loose = svc as R1Service & { image?: unknown; imageUrl?: unknown };
    const url = clean(loose.image) ?? clean(loose.imageUrl);
    if (!url) continue;
    const photo: Photo = { url, role: "service" };
    const alt = clean(svc.name);
    if (alt) photo.alt = alt;
    photos.push(photo);
  }
  // About portrait + gallery imagery — written onto the persisted payload by
  // enrichR1TemplateImages (ambient + face-free). All templates use the About
  // slot; the cinematic template adds a gallery + CTA texture. Absent → the
  // template renders its themed placeholder.
  const enriched = payload as {
    aboutImage?: { src?: unknown } | null;
    galleryImages?: ReadonlyArray<{ src?: unknown }> | null;
  };
  const aboutUrl = clean(enriched.aboutImage?.src);
  if (aboutUrl) photos.push({ url: aboutUrl, role: "about" });
  for (const g of enriched.galleryImages ?? []) {
    const url = clean(g?.src);
    if (url) photos.push({ url, role: "gallery" });
  }
  if (photos.length) soul.photos = photos;

  return soul;
}

// ────────────────────────────────────────────────────────────────────────────
// Flat submitted-soul → template Soul
// ────────────────────────────────────────────────────────────────────────────
//
// Some workspaces have a raw `organizations.soul` jsonb (a FLAT business
// profile captured at submission time) but no r1 landing payload yet. The
// /w/[slug] route falls back to this mapper so those workspaces still render a
// registered template. The flat soul is untyped JSON, so every access is
// defensive and the function NEVER throws.
//
// Shape we expect (all keys optional except the produced business_name):
//   business_name, tagline, soul_description, phone, email, address (strings),
//   offerings (array of STRINGS or { name, ... } objects),
//   faqs ({ q, a }[]), testimonials ({ name, text }[]).
// Richer fields (review_rating/count, service_area, trust_signals,
// certifications, emergency_service/same_day, photos) are passed through ONLY
// when present and well-typed — otherwise omitted so the template renders its
// themed placeholders.

/** Narrow an unknown to a plain (non-array, non-null) object. */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Keep only the finite-number entries of an unknown; undefined otherwise. */
function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(clean).filter((s): s is string => Boolean(s));
  return out.length ? out : undefined;
}

/**
 * Map one flat-soul offering entry → template offering.
 *   • string            → { name: <string> }
 *   • { name: string }  → passthrough (description/price/currency/duration
 *                          read defensively, never required)
 *   • anything else     → dropped (null)
 */
function flatOffering(item: unknown): Offering | null {
  if (typeof item === "string") {
    const name = clean(item);
    return name ? { name } : null;
  }
  if (!isRecord(item)) return null;
  const name = clean(item.name);
  if (!name) return null;
  const offering: Offering = { name };
  const description = clean(item.description);
  if (description) offering.description = description;
  const price = num(item.price);
  if (price != null) offering.price = price;
  const currency = clean(item.currency);
  if (currency) offering.currency = currency;
  const duration = num(item.duration_minutes);
  if (duration != null) offering.duration_minutes = duration;
  return offering;
}

/** Map a flat-soul faq entry → { q, a }; null unless both are non-empty. */
function flatFaq(item: unknown): { q: string; a: string } | null {
  if (!isRecord(item)) return null;
  const q = clean(item.q);
  const a = clean(item.a);
  if (!q || !a) return null;
  return { q, a };
}

/**
 * Map a flat-soul testimonial entry → { name, text }. `text` is required;
 * `name` falls back to "Anonymous" so a well-formed quote without an attributed
 * author still renders (the contract types `name` as required).
 */
function flatTestimonial(item: unknown): { name: string; text: string } | null {
  if (!isRecord(item)) return null;
  const text = clean(item.text);
  if (!text) return null;
  const name = clean(item.name) ?? "Anonymous";
  return { name, text };
}

/** Map a flat-soul photo entry → template photo; null unless `url` is present. */
function flatPhoto(item: unknown): Photo | null {
  if (!isRecord(item)) return null;
  const url = clean(item.url);
  if (!url) return null;
  const photo: Photo = { url };
  const alt = clean(item.alt);
  if (alt) photo.alt = alt;
  const role = item.role;
  if (
    role === "hero" ||
    role === "service" ||
    role === "about" ||
    role === "gallery"
  ) {
    photo.role = role;
  }
  return photo;
}

/**
 * Convert a raw, FLAT `organizations.soul` jsonb into the shared template
 * `Soul`. Used by /w/[slug] when a workspace has a soul but no r1 landing
 * payload. Defensive by design: any field may be missing or the wrong type;
 * such fields are omitted. The only invariant is `business_name` (falls back to
 * "Our Practice"). Never throws.
 */
export function submittedSoulToTemplateData(raw: unknown): Soul {
  const src: Record<string, unknown> = isRecord(raw) ? raw : {};

  // ── identity ────────────────────────────────────────────────────────────
  const business_name = clean(src.business_name) ?? "Our Practice";
  const soul: Soul = { business_name };

  const tagline = heroHeadline(clean(src.tagline));
  if (tagline) soul.tagline = tagline;
  const soul_description = clean(src.soul_description);
  if (soul_description) soul.soul_description = soul_description;

  // ── contact / location ──────────────────────────────────────────────────
  const phone = clean(src.phone);
  if (phone) soul.phone = phone;
  const email = clean(src.email);
  if (email) soul.email = email;
  const address = clean(src.address);
  if (address) soul.address = address;

  const service_area = strArray(src.service_area);
  if (service_area) soul.service_area = service_area;

  // ── reviews / trust ───────────────────────────────────────────────────────
  const review_rating = num(src.review_rating);
  if (review_rating != null) soul.review_rating = review_rating;
  const review_count = num(src.review_count);
  if (review_count != null) soul.review_count = review_count;

  const trust_signals = strArray(src.trust_signals);
  if (trust_signals) soul.trust_signals = trust_signals;
  const certifications = strArray(src.certifications);
  if (certifications) soul.certifications = certifications;

  if (src.emergency_service === true) soul.emergency_service = true;
  if (src.same_day === true) soul.same_day = true;

  // ── offerings (array of strings or { name, … } objects) ───────────────────
  if (Array.isArray(src.offerings)) {
    const offerings = src.offerings
      .map(flatOffering)
      .filter((o): o is Offering => o != null);
    if (offerings.length) soul.offerings = offerings;
  }

  // ── faqs ──────────────────────────────────────────────────────────────────
  if (Array.isArray(src.faqs)) {
    const faqs = src.faqs
      .map(flatFaq)
      .filter((f): f is { q: string; a: string } => f != null);
    if (faqs.length) soul.faqs = faqs;
  }

  // ── testimonials ──────────────────────────────────────────────────────────
  if (Array.isArray(src.testimonials)) {
    const testimonials = src.testimonials
      .map(flatTestimonial)
      .filter((t): t is { name: string; text: string } => t != null);
    if (testimonials.length) soul.testimonials = testimonials;
  }

  // ── photos (only when present + well-typed) ───────────────────────────────
  if (Array.isArray(src.photos)) {
    const photos = src.photos
      .map(flatPhoto)
      .filter((p): p is Photo => p != null);
    if (photos.length) soul.photos = photos;
  }

  return soul;
}
