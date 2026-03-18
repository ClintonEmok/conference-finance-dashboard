import { getTicketTailorConfig } from "@/lib/integrations/ticket-tailor/config"
import type { Prisma } from "@prisma/client"

type JsonRecord = Prisma.InputJsonObject

type TicketTailorFetchOptions = {
  method?: "GET" | "POST"
  query?: Record<string, string | number | undefined>
}

export type TicketTailorEventPayload = JsonRecord
export type TicketTailorOrderPayload = JsonRecord

type PaginationOptions = {
  pageSize?: number
  maxPages?: number
}

type PaginatedCollectionResult<T extends JsonRecord> = {
  items: T[]
  pagesFetched: number
}

function buildUrl(path: string, query?: TicketTailorFetchOptions["query"]) {
  const config = getTicketTailorConfig()
  const cleanPath = path.startsWith("/") ? path : `/${path}`
  const url = new URL(`${config.values.baseUrl}${cleanPath}`)

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value))
      }
    }
  }

  return { url, config }
}

export async function ticketTailorFetch<T>(
  path: string,
  options: TicketTailorFetchOptions = {},
): Promise<T> {
  const { url, config } = buildUrl(path, options.query)

  if (!config.values.apiKey) {
    throw new Error("Ticket Tailor is not configured: missing API key")
  }

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.values.apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Ticket Tailor request failed (${response.status}): ${text}`)
  }

  return (await response.json()) as T
}

function asRecord(value: unknown): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {}
  }

  return value as JsonRecord
}

function asArrayOfRecords(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => item as JsonRecord)
}

function extractItems(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return asArrayOfRecords(payload)
  }

  const record = asRecord(payload)
  const candidates = [record.data, record.results, record.items, record.orders, record.events]

  for (const candidate of candidates) {
    const extracted = asArrayOfRecords(candidate)
    if (extracted.length > 0) {
      return extracted
    }
  }

  return []
}

function inferHasNextPage(payload: unknown, page: number, pageSize: number, itemCount: number) {
  const root = asRecord(payload)
  const pagination = asRecord(root.pagination)
  const meta = asRecord(root.meta)
  const metaPagination = asRecord(meta.pagination)

  const currentPageCandidate =
    (typeof pagination.current_page === "number" ? pagination.current_page : undefined) ??
    (typeof metaPagination.current_page === "number" ? metaPagination.current_page : undefined)

  const totalPagesCandidate =
    (typeof pagination.total_pages === "number" ? pagination.total_pages : undefined) ??
    (typeof metaPagination.total_pages === "number" ? metaPagination.total_pages : undefined)

  const nextPageCandidate =
    (typeof pagination.next_page === "number" ? pagination.next_page : undefined) ??
    (typeof metaPagination.next_page === "number" ? metaPagination.next_page : undefined)

  if (typeof nextPageCandidate === "number") {
    return nextPageCandidate >= 1
  }

  const resolvedCurrent = currentPageCandidate ?? page

  if (typeof totalPagesCandidate === "number") {
    return resolvedCurrent < totalPagesCandidate
  }

  return itemCount >= pageSize
}

async function fetchPaginatedCollection<T extends JsonRecord>(
  path: string,
  options: PaginationOptions = {},
): Promise<PaginatedCollectionResult<T>> {
  const pageSize = Math.min(Math.max(options.pageSize ?? 100, 1), 200)
  const maxPages = Math.min(Math.max(options.maxPages ?? 100, 1), 500)

  const allItems: T[] = []
  let page = 1
  let pagesFetched = 0

  while (page <= maxPages) {
    const payload = await ticketTailorFetch<unknown>(path, {
      query: {
        page,
        per_page: pageSize,
      },
    })

    pagesFetched += 1
    const items = extractItems(payload) as T[]

    if (items.length === 0) {
      break
    }

    allItems.push(...items)

    const hasNext = inferHasNextPage(payload, page, pageSize, items.length)

    if (!hasNext) {
      break
    }

    page += 1
  }

  return {
    items: allItems,
    pagesFetched,
  }
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

function eventSortKey(event: JsonRecord) {
  return (
    pickString(event.id) ?? pickString(event.event_id) ?? pickString(event.slug) ?? JSON.stringify(event)
  )
}

function orderSortKey(order: JsonRecord) {
  return (
    pickString(order.id) ??
    pickString(order.order_id) ??
    pickString(order.reference) ??
    JSON.stringify(order)
  )
}

export async function fetchTicketTailorEventsPaginated(
  options: PaginationOptions = {},
): Promise<PaginatedCollectionResult<TicketTailorEventPayload>> {
  const result = await fetchPaginatedCollection<TicketTailorEventPayload>("/events", options)

  result.items.sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))

  return result
}

export async function fetchTicketTailorOrdersByEventPaginated(
  providerEventId: string,
  options: PaginationOptions = {},
): Promise<PaginatedCollectionResult<TicketTailorOrderPayload>> {
  const cleanEventId = providerEventId.trim()

  if (!cleanEventId) {
    return { items: [], pagesFetched: 0 }
  }

  const result = await fetchPaginatedCollection<TicketTailorOrderPayload>(
    `/events/${encodeURIComponent(cleanEventId)}/orders`,
    options,
  )

  result.items.sort((a, b) => orderSortKey(a).localeCompare(orderSortKey(b)))

  return result
}

export async function fetchTicketTailorCanonicalPayload(payload: JsonRecord) {
  const orderId =
    payload.order_id ??
    payload.orderId ??
    (typeof payload.data === "object" && payload.data !== null
      ? (payload.data as JsonRecord).order_id
      : undefined)

  if (typeof orderId === "string" && orderId.length > 0) {
    return ticketTailorFetch<JsonRecord>(`/orders/${orderId}`)
  }

  const eventId =
    payload.event_id ??
    payload.eventId ??
    (typeof payload.data === "object" && payload.data !== null
      ? (payload.data as JsonRecord).event_id
      : undefined)

  if (typeof eventId === "string" && eventId.length > 0) {
    return ticketTailorFetch<JsonRecord>(`/events/${eventId}`)
  }

  return payload
}
