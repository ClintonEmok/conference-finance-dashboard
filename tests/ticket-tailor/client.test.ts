import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchTicketTailorAttendeesForOrder,
  fetchTicketTailorEventsPaginated,
  fetchTicketTailorOrdersByEventPaginated,
  ticketTailorFetch,
} from "@/lib/integrations/ticket-tailor/client"

type MockResponseOptions = {
  ok: boolean
  status?: number
  json?: unknown
  text?: string
}

function mockResponse(options: MockResponseOptions): Response {
  return {
    ok: options.ok,
    status: options.status ?? (options.ok ? 200 : 500),
    json: async () => options.json,
    text: async () => options.text ?? "",
  } as Response
}

describe("Ticket Tailor client integration", () => {
  beforeEach(() => {
    process.env.TICKET_TAILOR_API_KEY = "sk_test_1234567890123456"
    process.env.TICKET_TAILOR_BASE_URL = "https://api.tickettailor.com/v1"
    vi.restoreAllMocks()
  })

  afterEach(() => {
    delete process.env.TICKET_TAILOR_API_KEY
    delete process.env.TICKET_TAILOR_BASE_URL
    vi.restoreAllMocks()
  })

  it("builds Basic auth and returns JSON payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        ok: true,
        json: { data: [{ id: "ev_1" }] },
      })
    )

    const payload = await ticketTailorFetch<{ data: Array<{ id: string }> }>(
      "/events"
    )

    expect(payload.data).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [requestUrl, init] = fetchMock.mock.calls[0]
    expect(String(requestUrl)).toBe("https://api.tickettailor.com/v1/events")

    const authHeader = (init?.headers as Record<string, string>).Authorization
    expect(authHeader).toBe("Basic c2tfdGVzdF8xMjM0NTY3ODkwMTIzNDU2")
    expect((init?.headers as Record<string, string>)["User-Agent"]).toBe(
      "conference-finance-dashboard/1.0"
    )
  })

  it("falls back to /orders when nested event orders endpoint is unavailable", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockResponse({
          ok: false,
          status: 404,
          text: "PAGE_NOT_FOUND",
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: {
            data: [
              { id: "ord_1", event_summary: { id: "ev_target" } },
              { id: "ord_2", event_summary: { id: "ev_other" } },
            ],
          },
        })
      )

    const result = await fetchTicketTailorOrdersByEventPaginated("ev_target")

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/events/ev_target/orders"
    )
    expect(String(fetchMock.mock.calls[1][0])).toContain("/orders")
    expect(result.items).toEqual([
      { id: "ord_1", event_summary: { id: "ev_target" } },
    ])
  })

  it("collects paginated events across pages", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: {
            data: [{ id: "ev_2" }],
            pagination: { current_page: 1, total_pages: 2 },
          },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: {
            data: [{ id: "ev_1" }],
            pagination: { current_page: 2, total_pages: 2 },
          },
        })
      )

    const result = await fetchTicketTailorEventsPaginated()

    expect(result.pagesFetched).toBe(2)
    expect(result.items.map((item) => item.id)).toEqual(["ev_1", "ev_2"])
  })

  it("follows Ticket Tailor cursor pagination links", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: {
            data: [{ id: "ev_2" }],
            links: {
              next: "/events?starting_after=ev_2&limit=100",
            },
          },
        })
      )
      .mockResolvedValueOnce(
        mockResponse({
          ok: true,
          json: {
            data: [{ id: "ev_1" }],
            links: {
              next: null,
            },
          },
        })
      )

    const result = await fetchTicketTailorEventsPaginated()

    expect(result.pagesFetched).toBe(2)
    expect(result.items.map((item) => item.id)).toEqual(["ev_1", "ev_2"])
    expect(String(fetchMock.mock.calls[1][0])).toContain("starting_after=ev_2")
    expect(String(fetchMock.mock.calls[1][0])).toContain("limit=100")
  })

  it("returns embedded issued tickets without fetching canonical order payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")

    const result = await fetchTicketTailorAttendeesForOrder({
      id: "or_1",
      issued_tickets: [{ id: "it_1", full_name: "Ada Lovelace" }],
    })

    expect(result).toEqual({
      items: [{ id: "it_1", full_name: "Ada Lovelace" }],
      source: "embedded",
      usedFallback: false,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("falls back to canonical order payload when attendee records are not embedded", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        ok: true,
        json: {
          data: {
            id: "or_1",
            issued_tickets: [{ id: "it_2", full_name: "Grace Hopper" }],
          },
        },
      })
    )

    const result = await fetchTicketTailorAttendeesForOrder({ id: "or_1" })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain("/orders/or_1")
    expect(result).toEqual({
      items: [{ id: "it_2", full_name: "Grace Hopper" }],
      source: "canonical-order",
      usedFallback: true,
    })
  })
})
