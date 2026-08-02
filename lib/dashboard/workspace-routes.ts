export const financeTabs = ["orders", "payments", "donations", "reconciliation"] as const
export const accommodationTabs = ["hotels", "allocation"] as const

export type FinanceTab = (typeof financeTabs)[number]
export type AccommodationTab = (typeof accommodationTabs)[number]

export const defaultFinanceTab: FinanceTab = "orders"
export const defaultAccommodationTab: AccommodationTab = "hotels"

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

function workspaceHref(slug: string, workspace: "finance" | "accommodation", tab: string, intent?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ tab })
  for (const [key, value] of Object.entries(intent ?? {})) if (value !== undefined) params.set(key, value)
  return `/dashboard/events/${encodeURIComponent(slug)}/${workspace}?${params.toString()}`
}

export const financeHref = (slug: string, tab: FinanceTab = defaultFinanceTab, intent?: { orderId?: string }) =>
  workspaceHref(slug, "finance", tab, intent)

export const accommodationHref = (slug: string, tab: AccommodationTab = defaultAccommodationTab, intent?: { roomId?: string }) =>
  workspaceHref(slug, "accommodation", tab, intent)

export const legacyFinanceHref = (slug: string, tab: FinanceTab) => financeHref(slug, tab)
export const legacyAccommodationHref = (slug: string, tab: AccommodationTab, intent?: { roomId?: string }) => accommodationHref(slug, tab, intent)

export function readWorkspaceIntent(input?: string | URLSearchParams | Record<string, string | undefined>) {
  const params = readParams(input)
  return { orderId: params.get("orderId") ?? undefined, roomId: params.get("roomId") ?? undefined }
}
