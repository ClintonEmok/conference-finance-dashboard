import { describe, expect, it, vi, beforeEach } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import LegacyAccommodationWorkspacePage from "@/app/dashboard/events/[slug]/accommodation/workspace/page"
import LegacyAllocationPage from "@/app/dashboard/events/[slug]/accommodation/allocation/page"
import LegacyRoomDetailPage from "@/app/dashboard/events/[slug]/accommodation/rooms/[roomId]/page"

const mocks = vi.hoisted(() => ({ redirect: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }))
const ROOT = resolve(import.meta.dirname, "../..")
const source = (path: string) => readFileSync(resolve(ROOT, path), "utf8")

describe("accommodation route compatibility", () => {
  beforeEach(() => mocks.redirect.mockReset())

  it("preserves workspace tab and room intent", async () => {
    await LegacyAccommodationWorkspacePage({ params: Promise.resolve({ slug: "spring retreat" }), searchParams: Promise.resolve({ tab: "upgrades-options" }) })
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard/events/spring%20retreat/accommodation?tab=upgrades-options")
    mocks.redirect.mockReset()
    await LegacyAccommodationWorkspacePage({ params: Promise.resolve({ slug: "spring retreat" }), searchParams: Promise.resolve({ tab: "hotels", roomId: "room/7" }) })
     expect(mocks.redirect).toHaveBeenCalledWith("/dashboard/events/spring%20retreat/accommodation/allocation?roomId=room%2F7")
  })

  it("renders allocation as a dedicated page and preserves room redirects", async () => {
    await LegacyAllocationPage({ params: Promise.resolve({ slug: "event/one" }) })
    expect(mocks.redirect).not.toHaveBeenCalled()
    mocks.redirect.mockReset()
    await LegacyRoomDetailPage({ params: Promise.resolve({ slug: "event/one", roomId: "room/7" }) })
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard/events/event%2Fone/accommodation/allocation?roomId=room%2F7")
  })

  it("preserves the canonical workspace and disables root-level event surfaces", () => {
    const workspace = source("components/dashboard/accommodation/accommodation-workspace.tsx")
    expect(workspace).toContain('label: "Hotels & Rooms"')
    expect(workspace).not.toContain('label: "Allocation"')
    expect(workspace).toContain('label: "Upgrades & Options"')
    expect(workspace).toContain("<WorkspaceFrame")
    expect(workspace).toContain("<WorkspaceTabs")
    expect(workspace).toContain("activeTab")
    const allocationPage = source("components/dashboard/accommodation/allocation-page.tsx")
    expect(allocationPage).toContain("AccommodationAllocationPage")
    expect(allocationPage).not.toContain("WorkspaceTabs")
    expect(source("components/dashboard/workspace-tabs.tsx")).toMatch(/role="tablist"|role: "tablist"/)
    expect(source("components/dashboard/workspace-tabs.tsx")).toContain("aria-current")
    expect(source("components/dashboard/workspace-tabs.tsx")).toContain("overflow-x-auto")
    expect(source("components/dashboard/attendee-detail-surface.tsx")).toContain("Room Placement")
    expect(source("app/dashboard/accommodation/page.tsx")).toContain("notFound()")
    expect(source("app/dashboard/accommodation/rooms/[roomId]/page.tsx")).toContain("notFound()")
    expect(source("app/dashboard/accommodation/[event-slug]/page.tsx")).toContain("notFound()")
  })
})
