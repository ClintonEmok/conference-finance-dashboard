import type { AllocationFilterState } from "@/app/dashboard/accommodation/filter-state"
import type { AccommodationTab } from "@/lib/dashboard/workspace-routes"

export type AccommodationReadMode =
  | "disabled"
  | "hotels"
  | "upgrades-options"
  | "allocation-default"
  | "allocation-filtered"

export type AccommodationReadPlan = {
  mode: AccommodationReadMode
  readAttentionBoard: boolean
  readDetailBoard: boolean
  reuseParentBoard: boolean
}

export function createAccommodationReadPlan({
  enabled,
  activeTab,
  filters,
  roomId,
}: {
  enabled: boolean
  activeTab: AccommodationTab
  filters?: AllocationFilterState
  roomId?: string | null
}): AccommodationReadPlan {
  if (!enabled) {
    return {
      mode: "disabled",
      readAttentionBoard: false,
      readDetailBoard: false,
      reuseParentBoard: false,
    }
  }

  if (activeTab === "hotels") {
    return {
      mode: "hotels",
      readAttentionBoard: true,
      readDetailBoard: false,
      reuseParentBoard: false,
    }
  }

  // The Upgrades & Options tab edits configuration; it must not mount the
  // room-allocation board query or the Hotels/Allocation attention surface.
  if (activeTab === "upgrades-options") {
    return {
      mode: "upgrades-options",
      readAttentionBoard: false,
      readDetailBoard: false,
      reuseParentBoard: false,
    }
  }

  const hasAllocationIntent = Boolean(
      filters?.hotelId ||
      filters?.roomTypeId ||
      filters?.genderType ||
      filters?.familyGroupId ||
      filters?.location ||
      filters?.allocationPriority ||
      filters?.hasPriority !== null && filters?.hasPriority !== undefined
  )

  return hasAllocationIntent
    ? {
        mode: "allocation-filtered",
        readAttentionBoard: true,
        readDetailBoard: true,
        reuseParentBoard: false,
      }
    : {
        mode: "allocation-default",
        readAttentionBoard: true,
        readDetailBoard: false,
        reuseParentBoard: true,
      }
}
