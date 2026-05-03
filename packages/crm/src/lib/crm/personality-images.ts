// ============================================================================
// Personality images — Unsplash hero + section URLs per CRMPersonality.
// ============================================================================
//
// May 2, 2026 / Issue #3 — every CRMPersonality (hvac, dental, legal,
// agency, coaching) ships a curated bundle of Unsplash images so a fresh
// workspace's landing page renders with industry-relevant photography
// instead of a text-only hero band. Hand-picked URLs (not auto-fetched)
// so we have full editorial control over what shows up: professional
// stock that matches each vertical, no awkward stock-photo clichés.
//
// Selection rules:
//   - hero_url: a single landscape (16:9 or wider) image suitable for
//     a full-bleed hero background. The renderer overlays a dark
//     gradient so headline text stays readable; pick darker / lower-
//     contrast images.
//   - service_grid_image_urls: up to 8 portrait/square photos used as
//     service-card backgrounds (round-robin assignment in
//     applyPersonalityImagesToSchema). Operators can override per-card
//     via update_landing_section.
//
// All URLs are Unsplash Source-format direct photo links with `auto=format`
// + `fit=crop` + `w=1600&h=900` for hero (or w=600&h=400 for cards).
// Resizing happens server-side at Unsplash; no client-side image
// processing. Free for commercial use under the Unsplash License.
//
// Adding a new personality: drop an entry below, keyed by vertical slug.
// Personalities without an entry render text-only (graceful fallback).

import type { PersonalityVertical } from "./personality";

export interface PersonalityImageBundle {
  /** Single landscape hero background — 1600x900 ideal. */
  hero_url: string;
  /** Up to 8 portrait/square images for the services-grid cards. */
  service_grid_image_urls: string[];
}

const HERO_PARAMS = "auto=format&fit=crop&w=1600&h=900&q=80";
const CARD_PARAMS = "auto=format&fit=crop&w=800&h=600&q=80";

function hero(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${HERO_PARAMS}`;
}

function card(photoId: string): string {
  return `https://images.unsplash.com/photo-${photoId}?${CARD_PARAMS}`;
}

// ─── GENERAL ─────────────────────────────────────────────────────────────────
// v1.2.0 — fallback for any business that doesn't match a named
// vertical. Hand-picked images that read as "professional contractor /
// trade / local service" — work boots, blueprints, contractor on a
// site, residential exterior work — generic enough to fit roofing /
// landscaping / handyman / painting / fencing / general remodelers
// without looking like a specific vertical.

const GENERAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1503387762-cf8d8a39c049"), // contractor consulting on residential job site
  service_grid_image_urls: [
    card("1503387762-cf8d8a39c049"), // contractor on site
    card("1581094288338-2314dddb7ece"), // tools laid out
    card("1503387837-b154d5074bd2"), // blueprints / planning
    card("1581092334651-ddf26d9a09d0"), // residential workspace
    card("1556761175-5973dc0f32e7"), // craftsperson at work
    card("1505236858219-8359eb29e329"), // home exterior project
  ],
};

// ─── HVAC ────────────────────────────────────────────────────────────────────
// Technicians, HVAC equipment, residential service. Photos lean toward
// "professional + trustworthy" rather than corporate stock.

const HVAC_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1581094488379-6c3c8e7e8a64"), // technician working on outdoor AC unit
  service_grid_image_urls: [
    card("1581094288338-2314dddb7ece"), // HVAC tools
    card("1597007030739-6d2e7172ee0a"), // ductwork install
    card("1558618666-fcd25c85cd64"), // technician with clipboard
    card("1581092334651-ddf26d9a09d0"), // residential thermostat
    card("1622428051717-dcd8412959de"), // commercial unit on roof
    card("1565182999561-18d7dc61c393"), // air filter / indoor air
  ],
};

// ─── DENTAL ──────────────────────────────────────────────────────────────────
// Dentists with patients, modern dental office, smiling patients. Lean
// toward clean / bright / friendly — not clinical.

const DENTAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1606811971618-4486d14f3f99"), // smiling family / friendly dental setting
  service_grid_image_urls: [
    card("1588776814546-1ffcf47267a5"), // dentist with patient (cleaning)
    card("1609840114035-3c981b782dfe"), // teeth whitening / tools
    card("1551269901-5c5e14c25df7"), // invisalign / clear aligner
    card("1606265752439-1f18756aa5fc"), // dental implant model
    card("1559757148-5c350d0d3c56"), // emergency / urgent care setting
    card("1581595220892-b0739db3ba8c"), // pediatric / child dentist
  ],
};

// ─── LEGAL ───────────────────────────────────────────────────────────────────
// Law-office interiors, scales of justice, attorney-client meetings. Avoid
// gavel-on-desk clichés in favor of warmer, conversational images.

const LEGAL_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1589994965851-a8f479c573a9"), // attorney consulting with client
  service_grid_image_urls: [
    card("1505664194779-8beaceb93744"), // family law / mediation
    card("1450101499163-c8848c66ca85"), // legal documents / contract
    card("1589216532372-1c2a367900d9"), // estate planning / paperwork
    card("1521791136064-7986c2920216"), // attorney handshake
    card("1505664063603-28e48ca204eb"), // court / formal setting
    card("1589994160957-fa46ab66f78d"), // immigration / passport context
  ],
};

// ─── AGENCY ──────────────────────────────────────────────────────────────────
// Creative-team workspaces, design tools, brand collateral. Lean into
// modern / minimal / photo-of-people-collaborating.

const AGENCY_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1521737711867-e3b97375f902"), // collaborative team workspace
  service_grid_image_urls: [
    card("1542744094-3a31f272c490"), // brand strategy whiteboard
    card("1559028012-481c04fa702d"), // designer working
    card("1499951360447-b19be8fe80f5"), // photographer / creative
    card("1551434678-e076c223a692"), // analytics / strategy
    card("1559136555-9303baea8ebd"), // motion / video work
    card("1542744173-8e7e53415bb0"), // ux/ui design
  ],
};

// ─── MEDSPA ──────────────────────────────────────────────────────────────────
// v1.1.7 — luxury aesthetics, modern spa interiors, treatment rooms,
// botanical/skincare products. Lean toward warm, premium, calming —
// not clinical or harsh.

const MEDSPA_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1570172619644-dfd03ed5d881"), // serene treatment-room ambience
  service_grid_image_urls: [
    card("1596704017254-9b121068fb31"), // facial treatment
    card("1571019613454-1cb2f99b2d8b"), // skincare products / botanical
    card("1503951914875-452162b0f3f1"), // laser/wellness device
    card("1591343395082-e120087004b4"), // dropper / serum
    card("1583416750470-965b2707b355"), // spa interior detail
    card("1612817288484-6f916006741a"), // massage / body treatment
  ],
};

// ─── COACHING ────────────────────────────────────────────────────────────────
// 1:1 coaching sessions, video calls, journaling, professional growth.
// Warm, conversational, person-focused.

const COACHING_IMAGES: PersonalityImageBundle = {
  hero_url: hero("1573497019940-1c28c88b4f3e"), // coach + client conversation
  service_grid_image_urls: [
    card("1552664730-d307ca884978"), // group coaching workshop
    card("1573497620053-ea5300f94f21"), // 1:1 conversation
    card("1551836022-d5d88e9218df"), // executive coaching
    card("1573164574511-73c773193279"), // virtual call setup
    card("1517245386807-bb43f82c33c4"), // career planning notebook
    card("1531403009284-440f080d1e12"), // mindset / focus
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const IMAGES: Partial<Record<PersonalityVertical, PersonalityImageBundle>> = {
  general: GENERAL_IMAGES,
  hvac: HVAC_IMAGES,
  dental: DENTAL_IMAGES,
  legal: LEGAL_IMAGES,
  agency: AGENCY_IMAGES,
  coaching: COACHING_IMAGES,
  medspa: MEDSPA_IMAGES,
};

/**
 * Look up a personality's curated image bundle. Returns null when the
 * personality has no curated images (rare — every built-in vertical has
 * one). Callers should fall back to text-only rendering when null.
 */
export function getPersonalityImages(
  vertical: PersonalityVertical | string | null | undefined
): PersonalityImageBundle | null {
  if (!vertical) return null;
  return IMAGES[vertical as PersonalityVertical] ?? null;
}
