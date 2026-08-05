import type { AllocationFilterState } from "@/app/dashboard/accommodation/filter-state"

export type AccommodationReadMode =
  | "disabled"
  | "hotels"
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
  activeTab: "hotels" | "allocation"
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
