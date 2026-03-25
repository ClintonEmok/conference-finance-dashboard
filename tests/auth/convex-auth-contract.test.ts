import { beforeEach, describe, expect, it, vi } from "vitest"

const convexBetterAuthMock = vi.fn(() => ({
  createCaller: vi.fn(),
  createContext: vi.fn(),
  handler: {
    GET: vi.fn(),
    POST: vi.fn(),
  },
}))
const createAuthClientMock = vi.fn(() => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
  signOut: vi.fn(),
}))

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}))

vi.mock("better-convex/auth/nextjs", () => ({
  convexBetterAuth: convexBetterAuthMock,
}))

vi.mock("better-auth/react", () => ({
  createAuthClient: createAuthClientMock,
}))

import { headers } from "next/headers"

import { auth } from "@/lib/auth"

import { GET as protectedPingGet } from "@/app/api/protected/ping/route"

describe("Convex auth route/session contract", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(headers).mockResolvedValue(new Headers())
  })

  it("returns 401 for unauthenticated protected requests", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null)

    const response = await protectedPingGet()
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
  })

  it("returns success for authenticated protected requests", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      session: {
        id: "session_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: "user_1",
        expiresAt: new Date(Date.now() + 60_000),
        token: "token_1",
      },
      user: {
        id: "user_1",
        createdAt: new Date(),
        updatedAt: new Date(),
        email: "test@example.com",
        emailVerified: true,
        name: "Test User",
      },
    })

    const response = await protectedPingGet()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      ok: true,
      userId: "user_1",
    })
  })

  it("keeps /api/auth/[...all] route contract via Convex auth handler", async () => {
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL = "https://example.convex.site"
    const routeModule = await import("@/app/api/auth/[...all]/route")

    expect(convexBetterAuthMock).toHaveBeenCalledOnce()
    expect(routeModule.GET).toEqual(expect.any(Function))
    expect(routeModule.POST).toEqual(expect.any(Function))
  })

  it("keeps Better Auth client contract for sign in/sign up/sign out", async () => {
    const authClientModule = await import("@/lib/auth-client")

    expect(createAuthClientMock).toHaveBeenCalledOnce()
    expect(createAuthClientMock).toHaveBeenCalledWith()
    expect(authClientModule.authClient).toMatchObject({
      signIn: { email: expect.any(Function) },
      signUp: { email: expect.any(Function) },
      signOut: expect.any(Function),
    })
  })
})
