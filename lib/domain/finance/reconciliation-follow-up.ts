type ReconciliationFollowUpHrefInput = {
  attendeeId?: string | null
  orderId?: string | null
  providerOrderId?: string | null
  providerEventId?: string | null
}

export function buildReconciliationFollowUpHref({
  attendeeId,
  orderId,
  providerOrderId,
  providerEventId,
}: ReconciliationFollowUpHrefInput) {
  const trimmedAttendeeId = attendeeId?.trim() ?? ""
  const trimmedOrderId = orderId?.trim() ?? ""
  const trimmedProviderOrderId = providerOrderId?.trim() ?? ""
  const trimmedEventId = providerEventId?.trim() ?? ""
  const searchId = trimmedOrderId || trimmedProviderOrderId

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
    const detailPath = `/dashboard/attendees/${encodeURIComponent(trimmedAttendeeId)}`

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

  return `/dashboard/attendees?${params.toString()}`
}
