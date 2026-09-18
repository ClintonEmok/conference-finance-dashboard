export const financeTabs = ["payments", "donations", "reconciliation"] as const
export const accommodationTabs = [
  "hotels",
  "allocation",
  "upgrades-options",
] as const
export const ordersTabs = ["orders"] as const
export const communicationsViews = [
  "send",
  "templates",
  "audience",
  "reminders",
  "history",
] as const

export type FinanceTab = (typeof financeTabs)[number]
export type AccommodationTab = (typeof accommodationTabs)[number]
export type OrdersTab = (typeof ordersTabs)[number]
export type CommunicationsView = (typeof communicationsViews)[number]

export const defaultFinanceTab: FinanceTab = "payments"
export const defaultAccommodationTab: AccommodationTab = "hotels"
export const defaultOrdersTab: OrdersTab = "orders"
export const defaultCommunicationsView: CommunicationsView = "send"

function readParams(
  input?: string | URLSearchParams | Record<string, string | undefined>
) {
  if (!input) return new URLSearchParams()
  if (input instanceof URLSearchParams) return input
  if (typeof input === "string")
    return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input))
    if (value !== undefined) params.set(key, value)
  return params
}

export function parseFinanceTab(
  input?: string | URLSearchParams | Record<string, string | undefined>
): FinanceTab {
  const value = readParams(input).get("tab")
  return financeTabs.includes(value as FinanceTab)
    ? (value as FinanceTab)
    : defaultFinanceTab
}

export function parseAccommodationTab(
  input?: string | URLSearchParams | Record<string, string | undefined>
): AccommodationTab {
  const value = readParams(input).get("tab")
  return accommodationTabs.includes(value as AccommodationTab)
    ? (value as AccommodationTab)
    : defaultAccommodationTab
}

export function parseOrdersTab(
  input?: string | URLSearchParams | Record<string, string | undefined>
): OrdersTab {
  const value = readParams(input).get("tab")
  return ordersTabs.includes(value as OrdersTab)
    ? (value as OrdersTab)
    : defaultOrdersTab
}

export function parseCommunicationsView(
  input?: string | URLSearchParams | Record<string, string | undefined>
): CommunicationsView {
  const value = readParams(input).get("view")
  return communicationsViews.includes(value as CommunicationsView)
    ? (value as CommunicationsView)
    : defaultCommunicationsView
}

function workspaceHref(
  slug: string,
  workspace: "finance" | "accommodation",
  tab: string,
  intent?: Record<string, string | undefined>
) {
  const params = new URLSearchParams({ tab })
  for (const [key, value] of Object.entries(intent ?? {}))
    if (value !== undefined) params.set(key, value)
  return `/dashboard/events/${encodeURIComponent(slug)}/${workspace}?${params.toString()}`
}

/**
 * LEGACY ONLY — `/finance?tab=…` is a redirect shell since Phase 58; in-app
 * producers must use `paymentsHref` / `donationsHref` / `reconciliationHref`.
 */
export const financeHref = (
  slug: string,
  tab: FinanceTab = defaultFinanceTab,
  intent?: { orderId?: string }
) => workspaceHref(slug, "finance", tab, intent)

export const accommodationHref = (
  slug: string,
  tab: AccommodationTab = defaultAccommodationTab,
  intent?: { roomId?: string }
) => {
  if (tab === "allocation") {
    const params = new URLSearchParams()
    if (intent?.roomId !== undefined) params.set("roomId", intent.roomId)
    const query = params.toString()
    return `/dashboard/events/${encodeURIComponent(slug)}/accommodation/allocation${query ? `?${query}` : ""}`
  }

  return workspaceHref(slug, "accommodation", tab, intent)
}

/**
 * The canonical event-scoped Orders workspace URL. Orders is a first-class
 * workspace, not a Finance tab: the URL carries no `tab` parameter and an
 * optional `orderId` selects the detail surface through the query intent.
 */
export const ordersHref = (slug: string, intent?: { orderId?: string }) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(intent ?? {}))
    if (value !== undefined) params.set(key, value)
  const query = params.toString()
  return `/dashboard/events/${encodeURIComponent(slug)}/orders${query ? `?${query}` : ""}`
}

export const communicationsHref = (
  slug: string,
  view: CommunicationsView = defaultCommunicationsView
) => {
  const base = `/dashboard/events/${encodeURIComponent(slug)}/communications`
  return view === defaultCommunicationsView ? base : `${base}?view=${view}`
}

/**
 * The optional deep-link intent the dedicated money surfaces accept. Every key
 * is forwarded to the target verbatim; a `tab` param is never part of it.
 */
export type WorkspaceRouteIntent = {
  orderId?: string
  donationId?: string
  attendeeId?: string
}

/**
 * The legacy `finance?tab=*` → dedicated-path table. This is the ONLY place
 * that mapping is written; the builders below read their path segments from it
 * so the table and the destinations cannot disagree.
 */
export const financeTabPaths = {
  payments: "payments",
  donations: "donations",
  reconciliation: "reconciliation",
} as const

function dedicatedHref(
  slug: string,
  path: string,
  intent?: WorkspaceRouteIntent
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(intent ?? {}))
    if (value !== undefined) params.set(key, value)
  const query = params.toString()
  return `/dashboard/events/${encodeURIComponent(slug)}/${path}${query ? `?${query}` : ""}`
}

/**
 * The canonical event-scoped Payments URL — the ONLY in-app producer of this
 * destination. The href never carries a `tab` parameter.
 */
export const paymentsHref = (slug: string, intent?: WorkspaceRouteIntent) =>
  dedicatedHref(slug, financeTabPaths.payments, intent)

/**
 * The canonical event-scoped Donations URL — the ONLY in-app producer of this
 * destination. The href never carries a `tab` parameter.
 */
export const donationsHref = (slug: string, intent?: WorkspaceRouteIntent) =>
  dedicatedHref(slug, financeTabPaths.donations, intent)

/**
 * The canonical event-scoped donation DETAIL URL. The list's `?donationId=`
 * intent resolves here; no in-app producer may emit the query form again.
 */
export const donationDetailHref = (slug: string, donationId: string) =>
  `/dashboard/events/${encodeURIComponent(slug)}/donations/${encodeURIComponent(donationId)}`

/**
 * The canonical event-scoped Reconciliation URL — the ONLY in-app producer of
 * this destination. The href never carries a `tab` parameter.
 */
export const reconciliationHref = (
  slug: string,
  intent?: WorkspaceRouteIntent
) => dedicatedHref(slug, financeTabPaths.reconciliation, intent)

/**
 * The single owner of the legacy `finance?tab=*` → dedicated-page mapping.
 * The `/finance` redirect shell (58-10) is its only caller; it intentionally
 * drops intent because the shell forwards the incoming query params itself.
 */
export const financeTabHref = (slug: string, tab: FinanceTab) => {
  if (tab === "donations") return donationsHref(slug)
  if (tab === "reconciliation") return reconciliationHref(slug)
  return paymentsHref(slug)
}

/**
 * LEGACY ONLY — `/finance?tab=…` is a redirect shell since Phase 58; in-app
 * producers must use `paymentsHref` / `donationsHref` / `reconciliationHref`.
 */
export const legacyFinanceHref = (slug: string, tab: FinanceTab) =>
  financeHref(slug, tab)
export const legacyAccommodationHref = (
  slug: string,
  tab: AccommodationTab,
  intent?: { roomId?: string }
) => accommodationHref(slug, tab, intent)

export function readWorkspaceIntent(
  input?: string | URLSearchParams | Record<string, string | undefined>
) {
  const params = readParams(input)
  return {
    orderId: params.get("orderId") ?? undefined,
    roomId: params.get("roomId") ?? undefined,
  }
}

export function parseOrdersIntent(
  input?: string | URLSearchParams | Record<string, string | undefined>
) {
  return { orderId: readParams(input).get("orderId") ?? undefined }
}
