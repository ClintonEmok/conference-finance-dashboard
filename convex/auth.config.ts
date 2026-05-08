import { AuthConfig } from "convex/server"

const clerkJwtIssuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN

if (!clerkJwtIssuerDomain) {
  throw new Error(
    "CLERK_JWT_ISSUER_DOMAIN environment variable is required. " +
      "Set it to your Clerk Frontend API URL in the Convex Dashboard. " +
      "See https://docs.convex.dev/auth/clerk#configuring-dev-and-prod-instances"
  )
}

export default {
  providers: [
    {
      domain: clerkJwtIssuerDomain,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig
