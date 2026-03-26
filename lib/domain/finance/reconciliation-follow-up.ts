type ReconciliationFollowUpHrefInput = {
  attendeeId?: string | null
  providerOrderId: string
  providerEventId?: string | null
}

export function buildReconciliationFollowUpHref({
  attendeeId,
  providerOrderId,
  providerEventId,
}: ReconciliationFollowUpHrefInput) {
  const trimmedAttendeeId = attendeeId?.trim() ?? ""
  const trimmedOrderId = providerOrderId.trim()
  const trimmedEventId = providerEventId?.trim() ?? ""

  if (trimmedAttendeeId) {
    const params = new URLSearchParams()
    params.set("source", "reconciliation")

    if (trimmedOrderId) {
      params.set("orderId", trimmedOrderId)
    }

    if (trimmedEventId) {
      params.set("eventId", trimmedEventId)
    }

    if (trimmedOrderId) {
      params.set("search", trimmedOrderId)
    }

    const query = params.toString()
    const detailPath = `/dashboard/attendees/${encodeURIComponent(trimmedAttendeeId)}`

    return query ? `${detailPath}?${query}` : detailPath
  }

  const params = new URLSearchParams()

  if (trimmedOrderId) {
    params.set("search", trimmedOrderId)
  }

  if (trimmedEventId) {
    params.set("eventId", trimmedEventId)
  }

  params.set("source", "reconciliation")

  if (trimmedOrderId) {
    params.set("orderId", trimmedOrderId)
  }

  return `/dashboard/attendees?${params.toString()}`
}
