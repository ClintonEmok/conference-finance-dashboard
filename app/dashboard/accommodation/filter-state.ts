export type AccommodationSignalFilters = {
  genderType: "MALE" | "FEMALE" | "MIXED" | "UNKNOWN" | null
  allocationPriority: "CRITICAL" | "HIGH" | "NORMAL" | "LOW" | null
  hasPriority: boolean | null
  location: string | null
  familyGroupId: string | null
}

export type AllocationFilterState = AccommodationSignalFilters & {
  hotelId: string | null
  roomTypeId: string | null
}

type SearchParamsLike = {
  get(name: string): string | null
}

export function normalizeOptionalString(
  value: string | null | undefined
): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function normalizeGenderType(
  value: string | null | undefined
): AccommodationSignalFilters["genderType"] {
  if (
    value === "MALE" ||
    value === "FEMALE" ||
    value === "MIXED" ||
    value === "UNKNOWN"
  ) {
    return value
  }

  return null
}

function normalizePriority(
  value: string | null | undefined
): AccommodationSignalFilters["allocationPriority"] {
  if (
    value === "CRITICAL" ||
    value === "HIGH" ||
    value === "NORMAL" ||
    value === "LOW"
  ) {
    return value
  }

  return null
}

function normalizeBoolean(
  value: boolean | null | undefined
): AccommodationSignalFilters["hasPriority"] {
  if (value === true || value === false) {
    return value
  }

  return null
}

function parseBoolean(value: string | null): boolean | null {
  if (value === "true") return true
  if (value === "false") return false
  return null
}

type SignalFilterInput = {
  genderType?: string | null
  allocationPriority?: string | null
  hasPriority?: boolean | null
  location?: string | null
  familyGroupId?: string | null
}

type AllocationFilterInput = SignalFilterInput & {
  hotelId?: string | null
  roomTypeId?: string | null
}

export function normalizeSignalFilters(
  input: SignalFilterInput
): AccommodationSignalFilters {
  return {
    genderType: normalizeGenderType(input.genderType),
    allocationPriority: normalizePriority(input.allocationPriority),
    hasPriority: normalizeBoolean(input.hasPriority),
    location: normalizeOptionalString(input.location),
    familyGroupId: normalizeOptionalString(input.familyGroupId),
  }
}

export function normalizeAllocationFilters(
  input: AllocationFilterInput
): AllocationFilterState {
  return {
    hotelId: normalizeOptionalString(input.hotelId),
    roomTypeId: normalizeOptionalString(input.roomTypeId),
    ...normalizeSignalFilters(input),
  }
}

export function readAllocationFiltersFromSearchParams(
  params: SearchParamsLike
): AllocationFilterState {
  return normalizeAllocationFilters({
    hotelId: params.get("hotelId"),
    roomTypeId: params.get("roomTypeId"),
    genderType: params.get("genderType"),
    allocationPriority: params.get("allocationPriority"),
    hasPriority: parseBoolean(params.get("hasPriority")),
    location: params.get("location"),
    familyGroupId: params.get("familyGroupId"),
  })
}

export function readSignalFiltersFromSearchParams(
  params: SearchParamsLike
): AccommodationSignalFilters {
  return normalizeSignalFilters({
    genderType: params.get("genderType"),
    allocationPriority: params.get("allocationPriority"),
    hasPriority: parseBoolean(params.get("hasPriority")),
    location: params.get("location"),
    familyGroupId: params.get("familyGroupId"),
  })
}

export function syncSignalFiltersToSearchParams(
  params: URLSearchParams,
  filters: AccommodationSignalFilters
) {
  if (filters.genderType) {
    params.set("genderType", filters.genderType)
  } else {
    params.delete("genderType")
  }

  if (filters.allocationPriority) {
    params.set("allocationPriority", filters.allocationPriority)
  } else {
    params.delete("allocationPriority")
  }

  if (filters.hasPriority === true) {
    params.set("hasPriority", "true")
  } else if (filters.hasPriority === false) {
    params.set("hasPriority", "false")
  } else {
    params.delete("hasPriority")
  }

  if (filters.location) {
    params.set("location", filters.location)
  } else {
    params.delete("location")
  }

  if (filters.familyGroupId) {
    params.set("familyGroupId", filters.familyGroupId)
  } else {
    params.delete("familyGroupId")
  }
}

export function syncAllocationFiltersToSearchParams(
  params: URLSearchParams,
  filters: AllocationFilterState
) {
  for (const [key, value] of [
    ["hotelId", filters.hotelId],
    ["roomTypeId", filters.roomTypeId],
  ] as const) {
    if (value) params.set(key, value)
    else params.delete(key)
  }

  syncSignalFiltersToSearchParams(params, filters)
}

export function getRoomPageForRoomId(
  roomIds: readonly string[],
  roomId: string | null | undefined,
  pageSize: number
): number | null {
  const normalizedRoomId = normalizeOptionalString(roomId)
  if (!normalizedRoomId || pageSize <= 0) return null

  const roomIndex = roomIds.indexOf(normalizedRoomId)
  return roomIndex < 0 ? null : Math.floor(roomIndex / pageSize) + 1
}

export function appendSignalFiltersToQuery(
  query: URLSearchParams,
  filters: AccommodationSignalFilters
) {
  syncSignalFiltersToSearchParams(query, filters)
}

export function shouldRenderFamilyBadge(attendee: { hasFamily: boolean }) {
  return attendee.hasFamily
}
