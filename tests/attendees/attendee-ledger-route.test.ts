import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextResponse } from "next/server"

vi.mock("@/lib/auth/server", () => ({ requireApiUser: vi.fn() }))
vi.mock("@/lib/domain/finance/attendees", () => ({ getAttendeeLedger: vi.fn() }))

import { GET } from "@/app/api/dashboard/attendees/route"
import { requireApiUser } from "@/lib/auth/server"
import { getAttendeeLedger } from "@/lib/domain/finance/attendees"

describe("/api/dashboard/attendees route", () => {
  beforeEach(() => vi.clearAllMocks())

  it("authenticates before forwarding a request", async () => {
    vi.mocked(requireApiUser).mockResolvedValue(NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 }))
    expect((await GET(new Request("http://localhost/api/dashboard/attendees?search=alice"))).status).toBe(401)
    expect(getAttendeeLedger).not.toHaveBeenCalled()
  })

  it("preserves event-scoped no-date all-time intent and cursor", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "admin" })
    vi.mocked(getAttendeeLedger).mockResolvedValue({ filters: {}, page: {}, rows: [], availableEvents: [], generatedAt: "now" } as never)
    const response = await GET(new Request("http://localhost/api/dashboard/attendees?eventId=event-1&search=%20%20Family%20&searchCursor=al%3Acursor"))
    expect(response.status).toBe(200)
    expect(getAttendeeLedger).toHaveBeenCalledWith(expect.objectContaining({ eventId: "event-1", search: "Family", searchCursor: "al:cursor", from: null, to: null }))
  })

  it("rejects malformed pagination and oversized searches", async () => {
    vi.mocked(requireApiUser).mockResolvedValue({ userId: "admin" })
    expect((await GET(new Request("http://localhost/api/dashboard/attendees?page=0"))).status).toBe(400)
    expect((await GET(new Request(`http://localhost/api/dashboard/attendees?search=${"x".repeat(513)}`))).status).toBe(400)
    expect(getAttendeeLedger).not.toHaveBeenCalled()
  })
})
