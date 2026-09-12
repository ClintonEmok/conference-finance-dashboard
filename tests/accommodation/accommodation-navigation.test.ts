import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  getAllocationNavigationAccessibleLabel,
  getAllocationNavigationCount,
  isAccommodationSetupNavigationActive,
  isAllocationNavigationActive,
} from "@/lib/dashboard/accommodation-navigation"

const ROOT = resolve(import.meta.dirname, "../..")
const source = () => readFileSync(resolve(ROOT, "app/dashboard/events/[slug]/layout.tsx"), "utf8")

describe("accommodation navigation contract", () => {
  it("only exposes successful server summary counts, including zero", () => {
    expect(getAllocationNavigationCount({ status: "pending" })).toBeUndefined()
    expect(getAllocationNavigationCount({ status: "error", message: "failed" })).toBeUndefined()
    expect(getAllocationNavigationCount({ status: "success", data: { unassignedAttendeesCount: 0 } })).toBe(0)
    expect(getAllocationNavigationCount({ status: "success", data: { unassignedAttendeesCount: 4 } })).toBe(4)
    expect(getAllocationNavigationCount({ status: "success", data: {} })).toBeUndefined()
  })

  it("describes every count state accessibly", () => {
    expect(getAllocationNavigationAccessibleLabel(undefined, "pending")).toContain("count loading")
    expect(getAllocationNavigationAccessibleLabel(undefined, "error")).toContain("count unavailable")
    expect(getAllocationNavigationAccessibleLabel(1, "ready")).toContain("1 attendee needs placement")
    expect(getAllocationNavigationAccessibleLabel(2, "ready")).toContain("2 attendees need placement")
    expect(getAllocationNavigationAccessibleLabel(0, "ready")).toContain("0 attendees need placement")
  })

  it("assigns canonical and deep links to mutually exclusive sections", () => {
    const root = "/dashboard/events/spring%20retreat/accommodation"
    expect(isAllocationNavigationActive(root, "tab=allocation")).toBe(true)
    expect(isAllocationNavigationActive(`${root}/allocation`, "")).toBe(true)
    expect(isAllocationNavigationActive(`${root}/rooms/room%2F7`, "")).toBe(true)
    expect(isAccommodationSetupNavigationActive(root, "tab=allocation")).toBe(false)
    expect(isAccommodationSetupNavigationActive(root, "tab=upgrades-options")).toBe(true)
    expect(isAccommodationSetupNavigationActive(root, "tab=invalid")).toBe(true)
    expect(isAccommodationSetupNavigationActive(root, "")).toBe(true)
  })

  it("protects the sidebar hierarchy and native accessibility behavior", () => {
    const layout = source()
    expect(layout).toContain('label: "Allocation"')
    expect(layout).toContain('Accommodation Setup')
    expect(layout).toContain('Hotels & Rooms')
    expect(layout).toContain('Upgrades & Options')
    expect(layout).toContain("useEventAllocationSummaryForOverview")
    expect(layout).toContain('accommodationHref(slug, "allocation")')
    expect(layout).toContain('accommodationHref(slug, "hotels")')
    expect(layout).toContain('accommodationHref(slug, "upgrades-options")')
    expect(layout).toContain('aria-current={active ? "page" : undefined}')
    expect(layout).toContain("focus-visible:ring-2")
    expect(layout).toContain("setOpenMobile(false)")
    expect(layout).not.toContain('label: "Accommodation"')
  })
})
