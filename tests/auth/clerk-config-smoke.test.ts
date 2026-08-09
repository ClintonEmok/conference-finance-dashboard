import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { NextResponse } from "next/server"

/**
 * Credential-free smoke coverage for the Clerk -> Convex auth wiring.
 *
 * Three layers are guarded without any Clerk credentials:
 *  1. `convex/auth.config.ts` — the issuer must be present (fail closed) and
 *     the provider contract must be exactly one Clerk provider with
 *     `domain = CLERK_JWT_ISSUER_DOMAIN` and `applicationID = "convex"`.
 *  2. `lib/convex/client.tsx` — a source-level wiring assertion that the
 *     client imports `useAuth` from `@clerk/nextjs`, renders
 *     `ConvexProviderWithClerk`, passes the Convex client, and passes
 *     `useAuth` through (the token transport contract for Convex auth).
 *  3. `lib/auth/server.ts` — the API and page guards reject unauthenticated
 *     callers (401 JSON contract / sign-in redirect) and forward the Clerk
 *     identity when present.
 *
 * No production file is modified; these tests only read/import existing code.
 */

const root = resolve(import.meta.dirname, "..", "..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8")
}

const AUTH_CONFIG_PATH = "@/convex/auth.config"
const STUB_ISSUER = "https://stub.clerk.accounts.dev"

type ClerkProviderContract = {
  providers: Array<{ domain: string; applicationID: string }>
}

describe("convex/auth.config.ts provider contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it("rejects when CLERK_JWT_ISSUER_DOMAIN is missing", async () => {
    // Deleting the variable via the stubbing API forces the module to
    // re-evaluate `process.env.CLERK_JWT_ISSUER_DOMAIN` on a fresh import
    // (vi.resetModules clears the module registry between cases).
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", undefined)
    vi.resetModules()

    await expect(import(AUTH_CONFIG_PATH)).rejects.toThrow(
      /CLERK_JWT_ISSUER_DOMAIN environment variable is required/
    )
  })

  it("exports exactly one Clerk provider with the stubbed domain and convex applicationID", async () => {
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", STUB_ISSUER)
    vi.resetModules()

    const mod = (await import(AUTH_CONFIG_PATH)) as { default: ClerkProviderContract }
    const providers = mod.default.providers

    expect(providers).toHaveLength(1)
    expect(providers[0].domain).toBe(STUB_ISSUER)
    expect(providers[0].applicationID).toBe("convex")
  })
})

describe("lib/convex/client.tsx Clerk auth wiring (source audit)", () => {
  const CLIENT_SOURCE = readSource("lib/convex/client.tsx")

  it("imports useAuth from @clerk/nextjs", () => {
    expect(CLIENT_SOURCE).toMatch(
      /import\s*\{\s*useAuth\s*\}\s*from\s*["']@clerk\/nextjs["']/
    )
  })

  it("imports and renders ConvexProviderWithClerk with the Convex client and useAuth", () => {
    expect(CLIENT_SOURCE).toMatch(
      /import\s*\{\s*ConvexProviderWithClerk\s*\}\s*from\s*["']convex\/react-clerk["']/
    )
    expect(CLIENT_SOURCE).toMatch(
      /import\s*\{\s*ConvexReactClient\s*\}\s*from\s*["']convex\/react["']/
    )
    expect(CLIENT_SOURCE).toMatch(/new ConvexReactClient\(/)
    expect(CLIENT_SOURCE).toMatch(
      /<ConvexProviderWithClerk\s+client=\{convex\}\s+useAuth=\{useAuth\}>/
    )
  })
})

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: mocks.auth,
  currentUser: mocks.currentUser,
}))

import { requireApiUser, requirePageUser } from "@/lib/auth/server"

describe("lib/auth/server.ts guards", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("requireApiUser returns the existing 401 JSON contract without a user", async () => {
    mocks.auth.mockResolvedValue({ userId: null })

    const result = await requireApiUser()

    expect(result).toBeInstanceOf(Response)
    // The union return type collapses at runtime to the 401 response in the
    // unauthenticated branch (asserted above); read it as a Response.
    const response = result as unknown as NextResponse
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
  })

  it("requireApiUser returns the Clerk userId with a user", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2i3cTest" })

    await expect(requireApiUser()).resolves.toEqual({ userId: "user_2i3cTest" })
  })

  it("requirePageUser invokes redirectToSignIn and returns its redirect response without a user", async () => {
    const redirectResponse = NextResponse.redirect(
      "https://clerk.example/sign-in"
    )
    const redirectToSignIn = vi.fn().mockReturnValue(redirectResponse)
    mocks.auth.mockResolvedValue({ userId: null, redirectToSignIn })
    const returnBackUrl = "https://app.example/track-payment/BK-1"

    const result = await requirePageUser(returnBackUrl)

    expect(redirectToSignIn).toHaveBeenCalledWith({ returnBackUrl })
    expect(result).toBe(redirectResponse)
  })

  it("requirePageUser returns the Clerk user id and primary email with a user", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2i3cTest", redirectToSignIn: vi.fn() })
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "booker@example.com" },
      emailAddresses: [{ emailAddress: "fallback@example.com" }],
    })

    await expect(
      requirePageUser("https://app.example/track-payment/BK-1")
    ).resolves.toEqual({
      userId: "user_2i3cTest",
      email: "booker@example.com",
    })
  })

  it("requirePageUser falls back to the first email address when no primary exists", async () => {
    mocks.auth.mockResolvedValue({ userId: "user_2i3cTest", redirectToSignIn: vi.fn() })
    mocks.currentUser.mockResolvedValue({
      primaryEmailAddress: null,
      emailAddresses: [{ emailAddress: "fallback@example.com" }],
    })

    await expect(
      requirePageUser("https://app.example/track-payment/BK-1")
    ).resolves.toEqual({
      userId: "user_2i3cTest",
      email: "fallback@example.com",
    })
  })
})
