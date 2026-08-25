const buckets = new Map();

export function rateLimit(key, { limit, windowMs }) {
  const now = Date.now();
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }
  current.count += 1
  if (current.count <= limit) return { allowed: true, retryAfter: 0 }
  return { allowed: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) }
}
