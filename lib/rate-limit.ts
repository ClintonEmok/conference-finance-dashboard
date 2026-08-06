type RateLimitEntry = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

type RateLimitConfig = {
  /** Max requests allowed within the window */
  maxRequests: number
  /** Window duration in milliseconds */
  windowMs: number
}

type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterMs: number
  limit: number
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMs: 60_000,
}

/**
 * In-memory rate limiter keyed by arbitrary identifier.
 *
 * Suitable for single-instance deployments (Vercel serverless, local dev).
 * For multi-instance or edge deployments, swap the backing store for Redis
 * or a similar shared counter — the public surface stays the same. Without a
 * shared store, each instance keeps its own counter, which weakens the
 * limit under concurrency (WR-01).
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): RateLimitResult {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      retryAfterMs: 0,
      limit: config.maxRequests,
    }
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: entry.resetAt - now,
      limit: config.maxRequests,
    }
  }

  entry.count += 1
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    retryAfterMs: 0,
    limit: config.maxRequests,
  }
}

function isLoopbackAddress(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true
  return /^127\./.test(ip)
}

/**
 * Derive a rate-limit key from the incoming request.
 *
 * Trusted-proxy extraction: on managed hosts (Vercel, etc.) the platform
 * proxy APPENDS the caller's IP as the LAST entry of `x-forwarded-for`.
 * Earlier entries are client-controlled and must never be keyed on — an
 * attacker rotating the first entry would otherwise bypass the limit. The
 * final non-loopback entry wins, falling back to `x-real-ip` (also set by
 * the proxy) and then to a shared "unknown" bucket so requests without
 * proxy headers are still counted rather than silently bypassed (WR-01).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const candidates = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      const candidate = candidates[index]
      if (candidate && !isLoopbackAddress(candidate)) return candidate
    }
    if (candidates.length > 0) return candidates[candidates.length - 1]
  }

  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp.trim()

  return "unknown"
}

/**
 * Apply rate-limit headers to a response.
 */
export function withRateLimitHeaders(
  response: Response,
  result: RateLimitResult
): Response {
  response.headers.set("X-RateLimit-Limit", String(result.limit))
  response.headers.set("X-RateLimit-Remaining", String(result.remaining))
  if (!result.allowed) {
    response.headers.set(
      "Retry-After",
      String(Math.ceil(result.retryAfterMs / 1000))
    )
  }
  return response
}

/**
 * Convenience: check rate limit and return a 429 response if exceeded.
 *
 * Returns null when the request is allowed — callers proceed normally.
 * Returns a `NextResponse`-compatible 429 when the limit is hit.
 */
export function enforceRateLimit(
  request: Request,
  routeKey: string,
  config?: RateLimitConfig
): Response | null {
  const ip = getClientIp(request)
  const key = `${routeKey}:${ip}`
  const result = checkRateLimit(key, config)

  if (result.allowed) {
    return null
  }

  const body = JSON.stringify({
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    },
  })

  const response = new Response(body, {
    status: 429,
    headers: { "Content-Type": "application/json" },
  })

  return withRateLimitHeaders(response, result)
}
