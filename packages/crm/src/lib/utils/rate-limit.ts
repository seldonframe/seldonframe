const counters = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit = 120, windowMs = 60_000) {
  const now = Date.now();
  const current = counters.get(key);

  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}
