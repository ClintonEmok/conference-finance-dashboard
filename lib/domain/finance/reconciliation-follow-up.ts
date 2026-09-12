type ReconciliationFollowUpHrefInput = {
  eventSlug: string
  attendeeId?: string | null
  orderId?: string | null
  providerOrderId?: string | null
  providerEventId?: string | null
}

export function buildReconciliationFollowUpHref({
  attendeeId,
  eventSlug,
  orderId,
  providerOrderId,
  providerEventId,
}: ReconciliationFollowUpHrefInput) {
  const trimmedAttendeeId = attendeeId?.trim() ?? ""
  const trimmedOrderId = orderId?.trim() ?? ""
  const trimmedProviderOrderId = providerOrderId?.trim() ?? ""
  const trimmedEventId = providerEventId?.trim() ?? ""
  const trimmedEventSlug = eventSlug.trim()
  const searchId = trimmedOrderId || trimmedProviderOrderId
  const attendeeListPath = `/dashboard/events/${encodeURIComponent(trimmedEventSlug)}/attendees`

  if (trimmedAttendeeId) {
    const params = new URLSearchParams()
    params.set("source", "reconciliation")

    if (searchId) {
      params.set("orderId", searchId)
    }

    if (trimmedEventId) {
      params.set("eventId", trimmedEventId)
    }

    if (searchId) {
      params.set("search", searchId)
    }

    const query = params.toString()
    const detailPath = `${attendeeListPath}/${encodeURIComponent(trimmedAttendeeId)}`

    return query ? `${detailPath}?${query}` : detailPath
  }

  const params = new URLSearchParams()

  if (searchId) {
    params.set("search", searchId)
  }

  if (trimmedEventId) {
    params.set("eventId", trimmedEventId)
  }

  params.set("source", "reconciliation")

  if (searchId) {
    params.set("orderId", searchId)
  }

  return `${attendeeListPath}?${params.toString()}`
}
