// Programmatic-SEO vertical registry — the SECOND dimension of the agent-page
// matrix (job × vertical). Pure data + pure lookups (no React, no "use server",
// no db) so it can be unit-tested and imported from server components and the
// sitemap/llms.txt routes alike.
//
// WHY a plain module: the SEO engine generates STATIC public pages from this
// registry via generateStaticParams — there is no per-request state and no
// write path, so this stays framework-agnostic data. ADDITIVE ONLY: no entity,
// no migration.
//
// Each vertical carries the few facts a job×vertical page needs to read like it
// was written FOR that trade: the singular/plural noun, a short "painHook" that
// localizes the job's promise (e.g. "a burst pipe at 2am won't wait for
// voicemail"), and the example service that makes the copy concrete.

export type Vertical = {
  /** URL slug — the `[vertical]` route param. Stable, lowercase, hyphenated. */
  slug: string;
  /** Singular business noun, e.g. "plumber". Used mid-sentence. */
  name: string;
  /** Plural business noun, e.g. "plumbers". Used in headlines + titles. */
  plural: string;
  /** A short, trade-specific pain hook that localizes a job's promise. One
   *  sentence, lowercase-friendly so it can be dropped into composed prose. */
  painHook: string;
  /** A concrete example service the trade sells — grounds the copy. */
  exampleService: string;
};

export const VERTICALS: Vertical[] = [
  {
    slug: "plumbers",
    name: "plumber",
    plural: "plumbers",
    painHook: "a burst pipe at 2am won't leave a voicemail — it calls the next plumber",
    exampleService: "emergency leak repair",
  },
  {
    slug: "hvac",
    name: "HVAC company",
    plural: "HVAC companies",
    painHook: "when the AC dies in a heat wave, the first company to answer wins the job",
    exampleService: "AC repair",
  },
  {
    slug: "roofers",
    name: "roofer",
    plural: "roofers",
    painHook: "storm-damage leads go cold fast — the homeowner calls three roofers before lunch",
    exampleService: "roof repair estimate",
  },
  {
    slug: "electricians",
    name: "electrician",
    plural: "electricians",
    painHook: "a tripped panel or a dead outlet is an emergency the caller wants handled today",
    exampleService: "panel repair",
  },
  {
    slug: "landscapers",
    name: "landscaper",
    plural: "landscapers",
    painHook: "spring quote requests pile up while the crew is out on the mowers",
    exampleService: "landscape design quote",
  },
  {
    slug: "garage-door",
    name: "garage door company",
    plural: "garage door companies",
    painHook: "a stuck door traps a car in the driveway — the homeowner needs someone now",
    exampleService: "spring replacement",
  },
  {
    slug: "dentists",
    name: "dental practice",
    plural: "dental practices",
    painHook: "a missed call is a new patient who booked with the practice down the street",
    exampleService: "new-patient cleaning",
  },
  {
    slug: "med-spas",
    name: "med spa",
    plural: "med spas",
    painHook: "high-ticket bookings slip away when no one answers the consultation inquiry",
    exampleService: "Botox consultation",
  },
  {
    slug: "chiropractors",
    name: "chiropractor",
    plural: "chiropractors",
    painHook: "a person in pain calls until someone picks up — the front desk can't always",
    exampleService: "initial adjustment",
  },
  {
    slug: "law-firms",
    name: "law firm",
    plural: "law firms",
    painHook: "an unanswered intake call is a signed case that walked to another firm",
    exampleService: "free case consultation",
  },
  {
    slug: "real-estate",
    name: "real estate agent",
    plural: "real estate agents",
    painHook: "a portal lead unanswered for five minutes is a buyer working with another agent",
    exampleService: "showing request",
  },
  {
    slug: "salons",
    name: "salon",
    plural: "salons",
    painHook: "stylists with their hands full can't answer the phone — and that booking is gone",
    exampleService: "color appointment",
  },
  {
    slug: "barbers",
    name: "barbershop",
    plural: "barbershops",
    painHook: "mid-cut, no one grabs the phone — and a walk-in books somewhere else",
    exampleService: "haircut appointment",
  },
  {
    slug: "auto-repair",
    name: "auto repair shop",
    plural: "auto repair shops",
    painHook: "a stranded driver calls every shop in town until one answers",
    exampleService: "brake repair estimate",
  },
  {
    slug: "restaurants",
    name: "restaurant",
    plural: "restaurants",
    painHook: "a ringing phone during the dinner rush is a reservation no one can take",
    exampleService: "table reservation",
  },
  {
    slug: "cleaning",
    name: "cleaning company",
    plural: "cleaning companies",
    painHook: "a quote request that waits a day is a recurring contract lost to a faster rival",
    exampleService: "recurring house cleaning",
  },
];

/** Find a vertical by slug, or throw. Pure — no DB. */
export function getVertical(slug: string): Vertical {
  const found = VERTICALS.find((v) => v.slug === slug);
  if (!found) throw new Error(`unknown vertical: ${slug}`);
  return found;
}
