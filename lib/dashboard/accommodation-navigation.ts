import type { AccommodationTab } from "./workspace-routes"

type AllocationSummary = { unassignedAttendeesCount?: number }
type AllocationQuery =
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "success"; data?: AllocationSummary }
  | undefined

export function getAllocationNavigationCount(result: AllocationQuery): number | undefined {
  if (result?.status !== "success") return undefined
  const count = result.data?.unassignedAttendeesCount
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : undefined
}

export function getAllocationNavigationAccessibleLabel(count: number | undefined, status: "pending" | "error" | "unavailable" | "ready"): string {
  if (status === "pending") return "Allocation — Place attendees; unresolved attendee count loading"
  if (status === "error" || status === "unavailable" || count === undefined) return "Allocation — Place attendees; unresolved attendee count unavailable"
  if (count === 0) return "Allocation — Place attendees; 0 attendees need placement; all attendees placed"
  const noun = count === 1 ? "attendee needs placement" : "attendees need placement"
  return `Allocation — Place attendees; ${count} ${noun}`
}

function params(input?: string | URLSearchParams) {
  if (input instanceof URLSearchParams) return input
  return new URLSearchParams(input?.startsWith("?") ? input.slice(1) : input)
}

export function isAllocationNavigationActive(pathname: string, searchParams?: string | URLSearchParams): boolean {
  const accommodationPath = "/accommodation"
  if (pathname.includes(`${accommodationPath}/allocation`) || pathname.includes(`${accommodationPath}/rooms/`)) return true
  return params(searchParams).get("tab") === "allocation" && pathname.endsWith(accommodationPath)
}

export function isAccommodationSetupNavigationActive(pathname: string, searchParams?: string | URLSearchParams): boolean {
  if (isAllocationNavigationActive(pathname, searchParams)) return false
  if (!pathname.includes("/accommodation")) return false
  const tab = params(searchParams).get("tab") as AccommodationTab | null
  return tab !== "allocation"
}
