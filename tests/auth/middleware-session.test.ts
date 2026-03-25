import { describe, expect, it, vi } from "vitest"

vi.mock("better-auth/cookies", () => ({
  getSessionCookie: vi.fn(),
}))

import { NextRequest } from "next/server"
import { getSessionCookie } from "better-auth/cookies"

import { middleware } from "@/middleware"

describe("middleware session redirects", () => {
  it("redirects signed-out dashboard requests to login with callbackUrl=%2Fdashboard", () => {
    vi.mocked(getSessionCookie).mockReturnValue(null)
    const request = new NextRequest("http://localhost:3000/dashboard")

    const response = middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?callbackUrl=%2Fdashboard"
    )
  })

  it("allows signed-in dashboard requests to continue", () => {
    vi.mocked(getSessionCookie).mockReturnValue("session-token")
    const request = new NextRequest("http://localhost:3000/dashboard")

    const response = middleware(request)

    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-next")).toBe("1")
  })

  it("redirects signed-in login requests to callback destination", () => {
    vi.mocked(getSessionCookie).mockReturnValue("session-token")
    const request = new NextRequest(
      "http://localhost:3000/login?callbackUrl=%2Fdashboard%2Ffinancial"
    )

    const response = middleware(request)

    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/dashboard/financial"
    )
  })
})
