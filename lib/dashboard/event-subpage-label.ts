/**
 * Human labels for the event workspace's known path segments. The sidebar's
 * sub-label resolves through this register ONLY: a raw identifier (order,
 * attendee, donation or room id) or any unknown segment is suppressed rather
 * than rendered, because navigation labels are for humans (D-08).
 */
const EVENT_SUBPAGE_LABELS: Record<string, string> = {
  accommodation: "Accommodation",
  allocation: "Allocation",
  attendees: "Attendees",
  communications: "Communications",
  donation: "Donation",
  donations: "Donations",
  finance: "Finance",
  hotels: "Hotels & Rooms",
  orders: "Orders",
  overview: "Overview",
  payments: "Payments",
  reconciliation: "Reconciliation",
  rooms: "Rooms",
  settings: "Settings",
  share: "Share",
  sources: "Sources",
  tickets: "Tickets",
  "upgrades-options": "Upgrades & Options",
  workspace: "Workspace",
}

/**
 * The sub-label for one sidebar item, or `null` when there is nothing human
 * to say. A segment is only considered when the current path is genuinely
 * below the item's own destination, and it must be a registered segment — the
 * raw segment is never returned as a fallback.
 */
export function resolveEventSubpageLabel(
  pathname: string,
  href: string
): string | null {
  if (!pathname.startsWith(`${href}/`)) return null
  const segment = pathname.slice(href.length + 1).split("/")[0]
  return EVENT_SUBPAGE_LABELS[segment] ?? null
}
