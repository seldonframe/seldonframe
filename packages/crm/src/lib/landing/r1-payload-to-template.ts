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

  const tagline = clean(hero.tagline) ?? clean(footer.tagline);
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
  if (photos.length) soul.photos = photos;

  return soul;
}
