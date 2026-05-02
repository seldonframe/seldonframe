// May 2, 2026 — infer an IANA timezone from a US/Canada state, a city
// name, or free-text business description. Used during workspace
// creation so a "Pacific Coast Heating in San Diego, CA" workspace
// gets `America/Los_Angeles` set on organizations.timezone instead
// of falling back to UTC (which then renders the booking page in
// the visitor's browser TZ — often misleading for the operator).
//
// Conservative by design — returns null when we don't have a high-
// confidence match. Caller falls back to whatever default makes
// sense (usually leaving organizations.timezone at "UTC").
//
// Coverage scope: US states + DC + the most common Canadian provinces.
// Not exhaustive — this is "good enough for first-time render"; the
// operator can always change it via /settings/workspace.

const STATE_TIMEZONES: Record<string, string> = {
  // Pacific
  CA: "America/Los_Angeles",
  WA: "America/Los_Angeles",
  OR: "America/Los_Angeles",
  NV: "America/Los_Angeles",
  // Mountain
  AZ: "America/Phoenix", // no DST
  CO: "America/Denver",
  ID: "America/Boise",
  MT: "America/Denver",
  NM: "America/Denver",
  UT: "America/Denver",
  WY: "America/Denver",
  // Central
  AL: "America/Chicago",
  AR: "America/Chicago",
  IA: "America/Chicago",
  IL: "America/Chicago",
  KS: "America/Chicago",
  LA: "America/Chicago",
  MN: "America/Chicago",
  MO: "America/Chicago",
  MS: "America/Chicago",
  ND: "America/Chicago",
  NE: "America/Chicago",
  OK: "America/Chicago",
  SD: "America/Chicago",
  TN: "America/Chicago",
  TX: "America/Chicago",
  WI: "America/Chicago",
  // Eastern
  CT: "America/New_York",
  DC: "America/New_York",
  DE: "America/New_York",
  FL: "America/New_York",
  GA: "America/New_York",
  IN: "America/Indiana/Indianapolis",
  KY: "America/New_York",
  MA: "America/New_York",
  MD: "America/New_York",
  ME: "America/New_York",
  MI: "America/Detroit",
  NC: "America/New_York",
  NH: "America/New_York",
  NJ: "America/New_York",
  NY: "America/New_York",
  OH: "America/New_York",
  PA: "America/New_York",
  RI: "America/New_York",
  SC: "America/New_York",
  VA: "America/New_York",
  VT: "America/New_York",
  WV: "America/New_York",
  // Alaska / Hawaii
  AK: "America/Anchorage",
  HI: "Pacific/Honolulu",
  // Canadian provinces (most populous)
  ON: "America/Toronto",
  QC: "America/Toronto",
  BC: "America/Vancouver",
  AB: "America/Edmonton",
  MB: "America/Winnipeg",
  NS: "America/Halifax",
  NB: "America/Moncton",
  NL: "America/St_Johns",
  PE: "America/Halifax",
  SK: "America/Regina",
};

const STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  // Canadian provinces
  ontario: "ON",
  quebec: "QC",
  "british columbia": "BC",
  alberta: "AB",
  manitoba: "MB",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  newfoundland: "NL",
  "prince edward island": "PE",
  saskatchewan: "SK",
};

/** Map well-known city names to their state codes so a free-text
 *  business description like "in San Diego" still resolves a TZ even
 *  when the operator didn't include the state. Conservative — only
 *  cities that are unambiguous (no "Springfield" / "Portland"). */
const UNIQUE_CITY_TO_STATE: Record<string, string> = {
  "los angeles": "CA",
  "san francisco": "CA",
  "san diego": "CA",
  "san jose": "CA",
  sacramento: "CA",
  oakland: "CA",
  fresno: "CA",
  "long beach": "CA",
  anaheim: "CA",
  bakersfield: "CA",
  seattle: "WA",
  spokane: "WA",
  tacoma: "WA",
  "salt lake city": "UT",
  phoenix: "AZ",
  tucson: "AZ",
  mesa: "AZ",
  scottsdale: "AZ",
  denver: "CO",
  "colorado springs": "CO",
  boise: "ID",
  reno: "NV",
  "las vegas": "NV",
  henderson: "NV",
  honolulu: "HI",
  anchorage: "AK",
  dallas: "TX",
  houston: "TX",
  austin: "TX",
  "san antonio": "TX",
  "fort worth": "TX",
  "el paso": "TX",
  arlington: "TX",
  plano: "TX",
  chicago: "IL",
  milwaukee: "WI",
  minneapolis: "MN",
  "saint paul": "MN",
  "kansas city": "MO",
  "st louis": "MO",
  "saint louis": "MO",
  nashville: "TN",
  memphis: "TN",
  "new orleans": "LA",
  "oklahoma city": "OK",
  tulsa: "OK",
  omaha: "NE",
  "des moines": "IA",
  atlanta: "GA",
  miami: "FL",
  orlando: "FL",
  tampa: "FL",
  jacksonville: "FL",
  "new york": "NY",
  "new york city": "NY",
  brooklyn: "NY",
  manhattan: "NY",
  queens: "NY",
  bronx: "NY",
  buffalo: "NY",
  rochester: "NY",
  philadelphia: "PA",
  pittsburgh: "PA",
  boston: "MA",
  cambridge: "MA",
  baltimore: "MD",
  "washington dc": "DC",
  charlotte: "NC",
  raleigh: "NC",
  detroit: "MI",
  cleveland: "OH",
  cincinnati: "OH",
  columbus: "OH",
  indianapolis: "IN",
  louisville: "KY",
  toronto: "ON",
  ottawa: "ON",
  montreal: "QC",
  vancouver: "BC",
  calgary: "AB",
  edmonton: "AB",
  winnipeg: "MB",
  halifax: "NS",
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Resolve a state code from any of: 2-letter state code (CA / NY),
 * full state name ("California"), or a well-known city name
 * ("San Diego"). Returns null when nothing matches.
 *
 * Two-letter code matching is intentionally strict — only when the
 * input itself is a short state-code string ("CA" / "ca" / "Ca")
 * OR the original input contains the code in UPPERCASE
 * surrounded by word boundaries (e.g. "San Diego, CA"). This stops
 * the English preposition "in" inside free text like "...HVAC in
 * San Diego." from being misread as the state code IN (Indiana).
 */
export function resolveStateCode(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const haystack = normalize(input);
  if (!haystack) return null;

  // Strict short-input case: the WHOLE string is just a 2-letter
  // code (any casing). "ca", "Ca", "CA" all work.
  if (trimmed.length === 2) {
    const upper = trimmed.toUpperCase();
    if (upper in STATE_TIMEZONES) return upper;
  }

  // Embedded 2-letter codes — require the ORIGINAL input to contain
  // the code in UPPERCASE bounded by word boundaries. That matches
  // "San Diego, CA" / "based in NY" but rejects "in" inside free
  // text like "HVAC in San Diego."
  const upperMatches = trimmed.match(/\b[A-Z]{2}\b/g);
  if (upperMatches) {
    for (const match of upperMatches) {
      if (match in STATE_TIMEZONES) return match;
    }
  }

  // Full state name match (longest-first so "new york" beats "york").
  const sortedNames = Object.keys(STATE_NAME_TO_CODE).sort(
    (a, b) => b.length - a.length
  );
  for (const name of sortedNames) {
    if (haystack.includes(name)) {
      return STATE_NAME_TO_CODE[name];
    }
  }

  // Unique city match (longest-first).
  const sortedCities = Object.keys(UNIQUE_CITY_TO_STATE).sort(
    (a, b) => b.length - a.length
  );
  for (const city of sortedCities) {
    if (haystack.includes(city)) {
      return UNIQUE_CITY_TO_STATE[city];
    }
  }

  return null;
}

/**
 * Resolve an IANA timezone string from any of: explicit state code,
 * a state name, a city name, or a free-text description that
 * mentions any of the above. Returns null when no match — caller
 * decides the fallback (usually "UTC").
 *
 * Examples:
 *   inferTimezone("CA") → "America/Los_Angeles"
 *   inferTimezone("San Diego, CA") → "America/Los_Angeles"
 *   inferTimezone("Family-owned HVAC in San Diego.") → "America/Los_Angeles"
 *   inferTimezone("Toronto, ON") → "America/Toronto"
 *   inferTimezone("Globally distributed") → null
 */
export function inferTimezone(...inputs: Array<string | null | undefined>): string | null {
  for (const input of inputs) {
    const code = resolveStateCode(input);
    if (code) return STATE_TIMEZONES[code] ?? null;
  }
  return null;
}
