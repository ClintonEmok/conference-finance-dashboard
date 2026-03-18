import { prismaAdapter } from "better-auth/adapters/prisma"
import { betterAuth } from "better-auth"
import { magicLink } from "better-auth/plugins"

import { prisma } from "@/lib/prisma"

const baseURL = process.env.BETTER_AUTH_URL

if (!baseURL) {
  throw new Error("BETTER_AUTH_URL is required")
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required")
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL,
  database: prismaAdapter(prisma, {
    provider: "sqlite",
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
