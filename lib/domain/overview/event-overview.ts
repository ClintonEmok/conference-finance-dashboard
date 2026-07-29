export type OverviewDomainState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unavailable"; message: string }
  | { status: "empty" }
  | { status: "ready" }
  | { status: "disabled" }
  | { status: "unconfigured" }

export type OverviewScope = {
  eventId: string
  eventSlug: string
  from: string
  to: string
  label: string
}

export type OverviewDomain<T> = OverviewDomainState & { data?: T }

export type OverviewInputs = {
  event: {
    id: string
    slug: string
    title: string
    startsAt: number | null
    accommodationEnabled: boolean
  }
  scope: OverviewScope | null
  revenue: OverviewDomain<RevenuePayload>
  orders: OverviewDomain<OrdersPayload>
  attendees: OverviewDomain<AttendeesPayload>
  reconciliation: OverviewDomain<ReconciliationPayload>
  accommodation: OverviewDomain<AccommodationPayload>
}

export type RevenuePayload = {
  totals: {
    orderValueMinor: number
    paidMinor: number
    refundedMinor: number
    netMinor: number
    standaloneDonationMinor: number
  }
  statusCounts: {
    paid: number
    refunded: number
    cancelled: number
    pending: number
  }
}

export type OrdersPayload = {
  page: { totalRows: number }
  totals?: {
    amountDueMinor: number
    matchedAmountMinor: number
    outstandingAmountMinor: number
  }
}

export type AttendeesPayload = { page: { totalRows: number } }

export type ReconciliationPayload = {
  totals: { rows: number; outstandingMinor: number }
}

export type AccommodationPayload = {
  summary: {
    hotelsLinked: number
    totalSlots: number
    assignableSlots: number
    submissionsCount: number
    unassignedAttendeesCount: number
  }
}

export type OverviewMetric = {
  key: "attendance" | "orders" | "money" | "accommodation"
  label: string
  scope: string
  state: OverviewDomainState
  values: Record<string, number | string> | null
  href: string
}

export type OverviewException = {
  key: "reconciliation" | "pending-orders" | "unassigned-attendees" | "accommodation-setup" | "accommodation-disabled"
  title: string
  reason: string
  href: string
}

export type EventOverviewProjection = {
  event: OverviewInputs["event"]
  scope: OverviewScope | null
  metrics: OverviewMetric[]
  exceptions: OverviewException[]
}

const stateOnly = (domain: OverviewDomain<unknown>): OverviewDomainState => ({
  status: domain.status,
  ...(domain.status === "error" || domain.status === "unavailable"
    ? { message: domain.message }
    : {}),
}) as OverviewDomainState

function eventHref(slug: string, path: string) {
  return `/dashboard/events/${encodeURIComponent(slug)}/${path}`
}

export function createEventOverviewScope(event: OverviewInputs["event"], now = new Date()): OverviewScope | null {
  if (!event.startsAt || !Number.isFinite(event.startsAt)) return null
  const from = new Date(event.startsAt)
  if (Number.isNaN(from.getTime()) || from.getTime() > now.getTime()) return null
  return {
    eventId: event.id,
    eventSlug: event.slug,
    from: from.toISOString(),
    to: now.toISOString(),
    label: `Event lifetime · ${from.toLocaleDateString()} to now`,
  }
}

export function projectEventOverview(input: OverviewInputs): EventOverviewProjection {
  const { event, scope } = input
  const scopeLabel = scope?.label ?? "Event lifetime unavailable"
  const metrics: OverviewMetric[] = [
    {
      key: "attendance",
      label: "Attendees",
      scope: scopeLabel,
      state: stateOnly(input.attendees),
      values: input.attendees.data ? { total: input.attendees.data.page.totalRows } : null,
      href: eventHref(event.slug, "attendees"),
    },
    {
      key: "orders",
      label: "Orders / tickets",
      scope: scopeLabel,
      state: stateOnly(input.orders),
      values: input.orders.data
        ? { total: input.orders.data.page.totalRows, pending: input.revenue.data?.statusCounts.pending ?? 0 }
        : null,
      href: eventHref(event.slug, "orders"),
    },
    {
      key: "money",
      label: "Money status",
      scope: scopeLabel,
      state: stateOnly(input.revenue),
      values: input.revenue.data
        ? {
            orderValueMinor: input.revenue.data.totals.orderValueMinor,
            paidMinor: input.revenue.data.totals.paidMinor,
            outstandingMinor: input.reconciliation.data?.totals.outstandingMinor ?? 0,
          }
        : null,
      href: eventHref(event.slug, "reconciliation"),
    },
    {
      key: "accommodation",
      label: "Accommodation",
      scope: event.accommodationEnabled ? "Selected event · current setup" : "Selected event · module disabled",
      state: event.accommodationEnabled ? stateOnly(input.accommodation) : { status: "disabled" },
      values:
        event.accommodationEnabled && input.accommodation.data
          ? {
              hotelsLinked: input.accommodation.data.summary.hotelsLinked,
              assignableSlots: input.accommodation.data.summary.assignableSlots,
              submissions: input.accommodation.data.summary.submissionsCount,
            }
          : null,
      href: eventHref(event.slug, event.accommodationEnabled ? "accommodation" : "settings"),
    },
  ]

  const exceptions: OverviewException[] = []
  if (input.reconciliation.status === "ready" && input.reconciliation.data && input.reconciliation.data.totals.rows > 0) {
    exceptions.push({ key: "reconciliation", title: "Reconciliation follow-up", reason: `${input.reconciliation.data.totals.rows} row(s) need review`, href: eventHref(event.slug, "reconciliation") })
  }
  if (input.revenue.status === "ready" && input.revenue.data && input.revenue.data.statusCounts.pending > 0) {
    exceptions.push({ key: "pending-orders", title: "Pending order activity", reason: `${input.revenue.data.statusCounts.pending} pending order(s)`, href: eventHref(event.slug, "orders") })
  }
  if (!event.accommodationEnabled) {
    exceptions.push({ key: "accommodation-disabled", title: "Accommodation is disabled", reason: "Enable it in event Settings when this event needs rooms", href: eventHref(event.slug, "settings") })
  } else if (input.accommodation.status === "ready" && input.accommodation.data) {
    const summary = input.accommodation.data.summary
    if (summary.hotelsLinked === 0 || summary.assignableSlots === 0) {
      exceptions.push({ key: "accommodation-setup", title: "Accommodation setup needed", reason: summary.hotelsLinked === 0 ? "No hotels are linked to this event" : "No usable room slots are available", href: eventHref(event.slug, "accommodation") })
    } else if (summary.unassignedAttendeesCount > 0) {
      exceptions.push({ key: "unassigned-attendees", title: "Unassigned attendees", reason: `${summary.unassignedAttendeesCount} attendee(s) need allocation`, href: eventHref(event.slug, "accommodation/allocation") })
    }
  }

  return { event, scope, metrics, exceptions }
}
