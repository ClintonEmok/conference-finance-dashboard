export const financeTabs = ["payments", "donations", "reconciliation"] as const
export const accommodationTabs = ["hotels", "allocation", "upgrades-options"] as const
export const ordersTabs = ["orders"] as const

export type FinanceTab = (typeof financeTabs)[number]
export type AccommodationTab = (typeof accommodationTabs)[number]
export type OrdersTab = (typeof ordersTabs)[number]

export const defaultFinanceTab: FinanceTab = "payments"
export const defaultAccommodationTab: AccommodationTab = "hotels"
export const defaultOrdersTab: OrdersTab = "orders"

function readParams(input?: string | URLSearchParams | Record<string, string | undefined>) {
  if (!input) return new URLSearchParams()
  if (input instanceof URLSearchParams) return input
  if (typeof input === "string") return new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) if (value !== undefined) params.set(key, value)
  return params
}

export function parseFinanceTab(input?: string | URLSearchParams | Record<string, string | undefined>): FinanceTab {
  const value = readParams(input).get("tab")
  return financeTabs.includes(value as FinanceTab) ? (value as FinanceTab) : defaultFinanceTab
}

export function parseAccommodationTab(input?: string | URLSearchParams | Record<string, string | undefined>): AccommodationTab {
  const value = readParams(input).get("tab")
  return accommodationTabs.includes(value as AccommodationTab) ? (value as AccommodationTab) : defaultAccommodationTab
}

export function parseOrdersTab(input?: string | URLSearchParams | Record<string, string | undefined>): OrdersTab {
  const value = readParams(input).get("tab")
  return ordersTabs.includes(value as OrdersTab) ? (value as OrdersTab) : defaultOrdersTab
}

function workspaceHref(slug: string, workspace: "finance" | "accommodation", tab: string, intent?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ tab })
  for (const [key, value] of Object.entries(intent ?? {})) if (value !== undefined) params.set(key, value)
  return `/dashboard/events/${encodeURIComponent(slug)}/${workspace}?${params.toString()}`
}

export const financeHref = (slug: string, tab: FinanceTab = defaultFinanceTab, intent?: { orderId?: string }) =>
  workspaceHref(slug, "finance", tab, intent)

export const accommodationHref = (slug: string, tab: AccommodationTab = defaultAccommodationTab, intent?: { roomId?: string }) =>
  workspaceHref(slug, "accommodation", tab, intent)

/**
 * The canonical event-scoped Orders workspace URL. Orders is a first-class
 * workspace, not a Finance tab: the URL carries no `tab` parameter and an
 * optional `orderId` selects the detail surface through the query intent.
 */
export const ordersHref = (slug: string, intent?: { orderId?: string }) => {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(intent ?? {})) if (value !== undefined) params.set(key, value)
  const query = params.toString()
  return `/dashboard/events/${encodeURIComponent(slug)}/orders${query ? `?${query}` : ""}`
}

export const legacyFinanceHref = (slug: string, tab: FinanceTab) => financeHref(slug, tab)
export const legacyAccommodationHref = (slug: string, tab: AccommodationTab, intent?: { roomId?: string }) => accommodationHref(slug, tab, intent)

export function readWorkspaceIntent(input?: string | URLSearchParams | Record<string, string | undefined>) {
  const params = readParams(input)
  return { orderId: params.get("orderId") ?? undefined, roomId: params.get("roomId") ?? undefined }
}

export function parseOrdersIntent(input?: string | URLSearchParams | Record<string, string | undefined>) {
  return { orderId: readParams(input).get("orderId") ?? undefined }
}
