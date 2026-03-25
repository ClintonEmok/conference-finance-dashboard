const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me"
const emailAndPassword = {
  enabled: true,
  requireEmailVerification: false,
} as const

const session = {
  expiresIn: 60 * 60 * 24 * 7,
  updateAge: 60 * 60 * 24,
} as const

if (!process.env.BETTER_AUTH_URL) {
  console.warn(
    "[auth] BETTER_AUTH_URL not set, defaulting to http://localhost:3000 for local development."
  )
}

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn(
    "[auth] BETTER_AUTH_SECRET not set, using development fallback secret. Set a secure value in production."
  )
}

void baseURL
void secret
void emailAndPassword
void session

type AppSession = {
  session: {
    id: string
    userId: string
    expiresAt: string | number | Date
    token: string
    [key: string]: unknown
  }
  user: {
    id: string
    email: string
    [key: string]: unknown
  }
}

function hasSessionShape(value: unknown): value is AppSession {
  if (!value || typeof value !== "object") return false
  const maybe = value as Record<string, unknown>
  const sessionObj = maybe.session as Record<string, unknown> | undefined
  const userObj = maybe.user as Record<string, unknown> | undefined

  return (
    !!sessionObj &&
    typeof sessionObj.id === "string" &&
    typeof sessionObj.userId === "string" &&
    typeof sessionObj.token === "string" &&
    !!userObj &&
    typeof userObj.id === "string" &&
    typeof userObj.email === "string"
  )
}

function resolveAuthBaseUrl(requestHeaders: Headers) {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http"

  if (host) {
    return `${proto}://${host}`
  }

  return "http://localhost:3000"
}

export const auth = {
  api: {
    async getSession({ headers }: { headers: Headers }) {
      const authBaseUrl = resolveAuthBaseUrl(headers)
      const cookie = headers.get("cookie")

      const response = await fetch(`${authBaseUrl}/api/auth/get-session`, {
        method: "GET",
        headers: cookie ? { cookie } : undefined,
        cache: "no-store",
      })

      if (!response.ok) {
        return null
      }

      const payload: unknown = await response.json()
      return hasSessionShape(payload) ? payload : null
    },
  },
}
