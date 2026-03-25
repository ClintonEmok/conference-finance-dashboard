import { convexBetterAuth } from "better-convex/auth/nextjs"
import { api } from "@/convex/functions/_generated/api"

const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ??
  process.env.NEXT_PUBLIC_CONVEX_URL?.replace(".convex.cloud", ".convex.site")

if (!convexSiteUrl) {
  throw new Error("NEXT_PUBLIC_CONVEX_SITE_URL is not set")
}

const { handler } = convexBetterAuth({
  api,
  convexSiteUrl,
})

export const { GET, POST } = handler
