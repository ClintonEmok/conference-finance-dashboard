import { prismaAdapter } from "better-auth/adapters/prisma"
import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"

import { prisma } from "@/lib/prisma"

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
const secret = process.env.BETTER_AUTH_SECRET ?? "dev-only-change-me"
const authDbProvider =
  process.env.AUTH_DB_PROVIDER === "postgresql" ? "postgresql" : "sqlite"

if (!process.env.BETTER_AUTH_URL) {
  console.warn(
    "[auth] BETTER_AUTH_URL not set, defaulting to http://localhost:3000 for local development.",
  )
}

if (!process.env.BETTER_AUTH_SECRET) {
  console.warn(
    "[auth] BETTER_AUTH_SECRET not set, using development fallback secret. Set a secure value in production.",
  )
}

export const auth = betterAuth({
  secret,
  baseURL,
  database: prismaAdapter(prisma, {
    provider: authDbProvider,
  }),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        const sender = process.env.MAGIC_LINK_FROM_EMAIL

        if (!sender) {
          console.warn(
            `[auth] Magic link requested for ${email} but MAGIC_LINK_FROM_EMAIL is not configured. Link: ${url}`,
          )
          return
        }

        console.info(
          `[auth] Magic link sender ${sender} should deliver link to ${email}. Link: ${url}`,
        )
      },
    }),
  ],
})
