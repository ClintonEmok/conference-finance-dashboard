import { auth as convexAuth } from "@/convex/functions/generated/auth"

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

export const auth = convexAuth
