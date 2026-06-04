/**
 * parseServicesText — convert a free-text services answer into structured
 * service records.
 *
 * Formats handled per line:
 *   "60-min massage — $90"
 *   "Deep tissue (90 min) - $130"
 *   "Consult: free"
 *   "Hair cut $45"
 *   "Facial 60min $80"
 */

export type ParsedService = {
  name: string;
  price: number;
  durationMinutes: number;
};

const DEFAULT_DURATION = 30;

// ── duration extraction ───────────────────────────────────────────────────────

/**
 * Find and extract a duration token from the line.
 * Returns { durationMinutes, lineWithoutDuration } or null if not found.
 *
 * Patterns matched:
 *   "60-min"        → prefixed before the service name
 *   "(90 min)"      → parenthesised
 *   "90 min"        → bare
 *   "60min"         → no space
 */
function extractDuration(line: string): { durationMinutes: number; rest: string } {
  // Pattern 1: leading "NN-min" (e.g. "60-min massage")
  let m = /^(\d+)-min\s+/i.exec(line);
  if (m) {
    return {
      durationMinutes: parseInt(m[1], 10),
      rest: line.slice(m[0].length),
    };
  }

  // Pattern 2: parenthesised "(NN min)" anywhere
  m = /\(\s*(\d+)\s*min(?:utes?)?\s*\)/i.exec(line);
  if (m) {
    return {
      durationMinutes: parseInt(m[1], 10),
      rest: (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim(),
    };
  }

  // Pattern 3: "NN min" or "NNmin" (no parens)
  m = /\b(\d+)\s*min(?:utes?)?\b/i.exec(line);
  if (m) {
    return {
      durationMinutes: parseInt(m[1], 10),
      rest: (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim(),
    };
  }

  return { durationMinutes: DEFAULT_DURATION, rest: line };
}

// ── price extraction ──────────────────────────────────────────────────────────

/**
 * Find and extract the price token from the line.
 * Returns { price, lineWithoutPrice }.
 *
 * Patterns:
 *   "$NNN" or "$NNN.NN"
 *   "free" / "Free" / "FREE"  → 0
 */
function extractPrice(line: string): { price: number; rest: string } {
  // Dollar amount
  let m = /\$(\d+(?:\.\d{1,2})?)/i.exec(line);
  if (m) {
    return {
      price: parseFloat(m[1]),
      rest: (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim(),
    };
  }

  // "free"
  m = /\bfree\b/i.exec(line);
  if (m) {
    return {
      price: 0,
      rest: (line.slice(0, m.index) + line.slice(m.index + m[0].length)).trim(),
    };
  }

  return { price: 0, rest: line };
}

// ── name cleanup ──────────────────────────────────────────────────────────────

/**
 * Strip leading/trailing separators (—, –, -, :) and whitespace from the
 * name remainder so we get a clean service name.
 */
function cleanName(raw: string): string {
  return raw
    .replace(/^[\s—–\-:]+/, "") // leading separators
    .replace(/[\s—–\-:]+$/, "") // trailing separators
    .trim();
}

// ── main parser ───────────────────────────────────────────────────────────────

export function parseServicesText(text: string): ParsedService[] {
  if (!text.trim()) return [];

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const results: ParsedService[] = [];

  for (const rawLine of lines) {
    // Step 1: extract duration
    const { durationMinutes, rest: afterDuration } = extractDuration(rawLine);

    // Step 2: extract price from the duration-stripped line
    const { price, rest: afterPrice } = extractPrice(afterDuration);

    // Step 3: what remains is the name
    const name = cleanName(afterPrice);
    if (!name) continue;

    results.push({ name, price, durationMinutes });
  }

  return results;
}
