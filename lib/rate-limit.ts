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
 * or a similar shared counter — the public surface stays the same.
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

/**
 * Derive a rate-limit key from the incoming request.
 *
 * Uses the first non-loopback IP from x-forwarded-for (standard on Vercel)
 * with a fallback to "unknown" so requests without proxy headers still get
 * counted rather than silently bypassed.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
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
