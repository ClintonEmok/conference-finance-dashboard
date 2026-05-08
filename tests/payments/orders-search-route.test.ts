import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexQuery: vi.fn(),
}))

import { GET } from "@/app/api/orders/search/route"
import { api } from "@/lib/convex/api"
import { requireApiUser } from "@/lib/auth/server"
import { convexQuery } from "@/lib/convex/server"

describe("/api/orders/search route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns shared unauthorized payload for unauthenticated requests", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(
      NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required",
          },
        },
        { status: 401 }
      )
    )

    const response = await GET(
      new Request("http://localhost/api/orders/search?search=ada")
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    })
    expect(convexQuery).not.toHaveBeenCalled()
  })

  it("passes the search query variant through to Convex", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexQuery).mockResolvedValue([])

    const response = await GET(
      new Request("http://localhost/api/orders/search?search=  Ada  &limit=25")
    )

    expect(response.status).toBe(200)
    expect(convexQuery).toHaveBeenCalledWith(api.orders.searchOrders, {
      search: "Ada",
      limit: 25,
    })
  })

  it("accepts q query variant and maps it to Convex search", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "user_1" })
    vi.mocked(convexQuery).mockResolvedValue([])

    const response = await GET(
      new Request("http://localhost/api/orders/search?q=  order-123  ")
    )

    expect(response.status).toBe(200)
    expect(convexQuery).toHaveBeenCalledWith(api.orders.searchOrders, {
      search: "order-123",
      limit: 20,
    })
  })
})
