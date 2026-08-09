import { afterAll, beforeAll, describe, expect, test } from "vitest"
import type { ClerkClient } from "@clerk/backend"

/**
 * Real Clerk JWT -> Convex auth contract integration suite.
 *
 * Runs only when `CLERK_SECRET_KEY` and `CLERK_JWT_ISSUER_DOMAIN` are both
 * present; otherwise the live suite is skipped with an explicit reason (never
 * a silent pass). With credentials, any setup or JWT-validation error is a
 * hard failure: the suite creates a uniquely named disposable Clerk user and
 * session, requests a real ~60s JWT from the existing `convex` template,
 * validates signature/issuer/audience/subject/TTL through the issuer's
 * discovered JWKS via `jose`, proves invalid variants reject, and optionally
 * (when `NEXT_PUBLIC_CONVEX_URL` is set) sends the real token to the existing
 * protected `api.events.getEventsForLedger` query.
 *
 * The Clerk SDK import stays inside the credential-gated path so the suite is
 * import-safe even in environments without credentials. No production code,
 * Convex endpoint, or schema is created or modified.
 */

const secretKey = process.env.CLERK_SECRET_KEY
const issuerDomain = process.env.CLERK_JWT_ISSUER_DOMAIN
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL

const hasCredentials = Boolean(secretKey && issuerDomain)

if (!hasCredentials) {
  console.log(
    "[clerk-jwt.integration] SKIPPING live Clerk JWT suite: CLERK_SECRET_KEY and/or " +
      "CLERK_JWT_ISSUER_DOMAIN are not set. Set both (Clerk Dashboard -> API Keys -> " +
      "Secret key; issuer = the Clerk frontend API domain configured in convex/auth.config.ts) " +
      "to run the real issuer -> JWKS -> aud:convex token verification."
  )
} else if (!convexUrl) {
  console.log(
    "[clerk-jwt.integration] Clerk credentials present but NEXT_PUBLIC_CONVEX_URL is not set; " +
      "only the jose/JWKS verification will run (no live Convex request)."
  )
}

describe.skipIf(!hasCredentials)(
  "real Clerk JWT -> Convex auth contract",
  () => {
    let clerk: ClerkClient
    let userId = ""
    let sessionId = ""
    let jwt = ""
    let jwksUri = ""

    async function destroyDisposableResources(): Promise<void> {
      // Best-effort, always attempted cleanup; cleanup problems are reported
      // loudly but never mask the primary test outcome.
      if (sessionId) {
        try {
          await clerk.sessions.revokeSession(sessionId)
        } catch (err) {
          console.error(
            "[clerk-jwt.integration] failed to revoke disposable session",
            err
          )
        }
        sessionId = ""
      }
      if (userId) {
        try {
          await clerk.users.deleteUser(userId)
        } catch (err) {
          console.error(
            "[clerk-jwt.integration] failed to delete disposable user",
            err
          )
        }
        userId = ""
      }
    }

    beforeAll(async () => {
      const { createClerkClient } = await import("@clerk/backend")
      clerk = createClerkClient({ secretKey: secretKey! })
      try {
        const suffix = `${Date.now().toString(36)}${Math.random()
          .toString(36)
          .slice(2, 8)}`
        const user = await clerk.users.createUser({
          externalId: `i3c-jwt-${suffix}`,
          emailAddress: [`i3c-jwt-${suffix}@example.com`],
          skipPasswordRequirement: true,
          skipLegalChecks: true,
        })
        userId = user.id
        const session = await clerk.sessions.createSession({ userId })
        sessionId = session.id
        // Request the JWT from the existing "convex" template with the
        // documented ~60s expiry argument.
        const tokenResult = await clerk.sessions.getToken(
          sessionId,
          "convex",
          60
        )
        jwt = typeof tokenResult === "string" ? tokenResult : tokenResult.jwt
      } catch (err) {
        await destroyDisposableResources()
        throw err
      }

      // Discover the issuer's OpenID configuration / JWKS endpoint.
      const openidConfig = (await (
        await fetch(`${issuerDomain}/.well-known/openid-configuration`)
      ).json()) as { jwks_uri?: unknown }
      if (typeof openidConfig.jwks_uri !== "string") {
        throw new Error(
          `[clerk-jwt.integration] OpenID discovery at ${issuerDomain} did not expose a jwks_uri`
        )
      }
      jwksUri = openidConfig.jwks_uri
    })

    afterAll(async () => {
      await destroyDisposableResources()
    })

    test("obtains a real 60s convex-template JWT that validates issuer, JWKS signature, aud, subject, and TTL", async () => {
      const { createRemoteJWKSet, jwtVerify } = await import("jose")
      const issuer = issuerDomain!

      // Real token from the Clerk Backend API (never mocked).
      expect(jwt.split(".")).toHaveLength(3)

      const jwks = createRemoteJWKSet(new URL(jwksUri))
      const { payload } = await jwtVerify(jwt, jwks, {
        issuer,
        audience: "convex",
      })

      expect(payload.aud).toBe("convex")
      expect(payload.iss).toBe(issuer)
      expect(payload.sub).toBe(userId)
      expect(payload.exp).toBeTypeOf("number")
      expect(payload.iat).toBeTypeOf("number")

      const ttl = payload.exp! - payload.iat!
      expect(ttl).toBeGreaterThan(0)
      // Expiry no more than roughly 60 seconds from issuance.
      expect(ttl).toBeLessThanOrEqual(60)

      // Still valid in the near future, and not far beyond the requested TTL.
      const secondsUntilExpiry = payload.exp! - Math.floor(Date.now() / 1000)
      expect(secondsUntilExpiry).toBeGreaterThan(0)
      expect(secondsUntilExpiry).toBeLessThanOrEqual(60)
    })

    test("rejects a tampered signature", async () => {
      const { createRemoteJWKSet, jwtVerify } = await import("jose")
      const [header, payloadPart, signature] = jwt.split(".")
      const tamperedSignature =
        (signature[0] === "A" ? "B" : "A") + signature.slice(1)

      const jwks = createRemoteJWKSet(new URL(jwksUri))
      await expect(
        jwtVerify(`${header}.${payloadPart}.${tamperedSignature}`, jwks, {
          issuer: issuerDomain!,
          audience: "convex",
        })
      ).rejects.toThrow()
    })

    test("rejects the same token checked against a wrong issuer", async () => {
      const { createRemoteJWKSet, jwtVerify } = await import("jose")

      const jwks = createRemoteJWKSet(new URL(jwksUri))
      await expect(
        jwtVerify(jwt, jwks, {
          issuer: "https://not-the-convex-issuer.example",
          audience: "convex",
        })
      ).rejects.toThrow()
    })

    test("rejects the same token checked against a wrong audience", async () => {
      const { createRemoteJWKSet, jwtVerify } = await import("jose")

      const jwks = createRemoteJWKSet(new URL(jwksUri))
      await expect(
        jwtVerify(jwt, jwks, {
          issuer: issuerDomain!,
          audience: "not-convex",
        })
      ).rejects.toThrow()
    })

    test.skipIf(!convexUrl)(
      "authenticated Convex request accepts the real token against the existing protected query",
      async () => {
        const { ConvexHttpClient } = await import("convex/browser")
        const { api } = await import("@/convex/_generated/api")

        const client = new ConvexHttpClient(convexUrl!)
        client.setAuth(jwt)

        // The existing protected query (requireIdentity gate) must accept the
        // real token; an empty result is valid, an auth error is not.
        const events = await client.query(api.events.getEventsForLedger, {})
        expect(Array.isArray(events)).toBe(true)
      }
    )
  }
)
