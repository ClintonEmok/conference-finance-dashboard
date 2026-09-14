export type AttendeeKeyRecord = {
  id: string
  attendeeKey: string
}

/**
 * Preserve existing keys where possible and return only the rows that need a
 * collision-free key within the containing order.
 */
export function planUniqueAttendeeKeys(
  attendees: readonly AttendeeKeyRecord[]
): Map<string, string> {
  const usedKeys = new Set<string>()
  const updates = new Map<string, string>()

  for (const attendee of attendees) {
    const preferredKey = attendee.attendeeKey.trim()
    let nextKey = preferredKey
    if (!nextKey || usedKeys.has(nextKey)) {
      const baseKey = `attendee-${attendee.id}`
      nextKey = baseKey
      let suffix = 1
      while (usedKeys.has(nextKey)) {
        nextKey = `${baseKey}-${suffix}`
        suffix += 1
      }
    }
    usedKeys.add(nextKey)
    if (nextKey !== attendee.attendeeKey) {
      updates.set(attendee.id, nextKey)
    }
  }

  return updates
}
