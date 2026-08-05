/**
 * Timezone-aware date-input conversion for the event configuration editor.
 *
 * The event carries an explicit IANA timezone (`events.timezone`), and the
 * stay-window timestamps stored in `eventAccommodationConfig` are absolute
 * instants whose server-derived `nightCount` depends on the calendar dates
 * they fall on. Converting through the BROWSER's local timezone shifts the
 * visible date by a day (and saves different timestamps) for any admin
 * outside the event timezone — especially around UTC midnight and DST
 * transitions. These helpers format and rebuild dates exclusively in the
 * event timezone so the editor is deterministic for every admin.
 *
 * `fromDateInputValue` preserves the wall-clock time of the fallback instant
 * (the previous check-in/check-out) in the event timezone while replacing
 * the calendar date, matching how the original local-time helper behaved —
 * but in the event timezone instead of the browser's.
 */

const FALLBACK_TIME_ZONE = "UTC"

type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Returns the wall-clock components of `epoch` in `timeZone`. Invalid or
 * missing timezones fall back to UTC so a bad stored value never crashes the
 * editor or silently reintroduces browser-local conversion.
 */
export function wallClockParts(epoch: number, timeZone: string): WallClockParts {
  const zone = safeTimeZone(timeZone)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(epoch))
      .map((part) => [part.type, part.value])
  )
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Some engines report midnight as hour "24" with hour12:false.
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/**
 * Formats an epoch as a `YYYY-MM-DD` date-input value in the event timezone.
 */
export function toDateInputValue(epoch: number, timeZone: string): string {
  const parts = wallClockParts(epoch, timeZone)
  const month = String(parts.month).padStart(2, "0")
  const day = String(parts.day).padStart(2, "0")
  return `${parts.year}-${month}-${day}`
}

/**
 * Rebuilds an epoch from a `YYYY-MM-DD` date-input value so the calendar date
 * in the event timezone equals the input. The wall-clock time (hour/minute/
 * second) of `fallbackEpoch` in the event timezone is preserved. Returns
 * `null` for a malformed value.
 */
export function fromDateInputValue(
  value: string,
  fallbackEpoch: number,
  timeZone: string
): number | null {
  const parts = value.split("-").map((part) => Number(part))
  if (
    parts.length !== 3 ||
    parts.some((part) => !Number.isInteger(part))
  ) {
    return null
  }
  const [year, month, day] = parts
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  const zone = safeTimeZone(timeZone)
  const fallbackWall = wallClockParts(fallbackEpoch, zone)
  // Interpret the requested date + fallback wall-clock as a naive UTC
  // instant, then shift by the event-timezone offset evaluated at that
  // instant (and refine once) so the wall clock in the event timezone
  // matches the input. The refinement pass keeps the conversion correct
  // across DST transition days.
  const naiveUtc = Date.UTC(
    year,
    month - 1,
    day,
    fallbackWall.hour,
    fallbackWall.minute,
    fallbackWall.second
  )
  // Evaluate the event-timezone offset at the naive UTC instant, then re-check
  // at the shifted instant so the conversion stays correct across DST
  // transitions. The final epoch is always `naiveUtc - offset`.
  const firstPass = naiveUtc - timeZoneOffsetMs(naiveUtc, zone)
  const epoch = naiveUtc - timeZoneOffsetMs(firstPass, zone)
  // Reject out-of-range calendar dates (e.g. Feb 30) that Date.UTC would
  // silently normalize into a different month — the saved instant must match
  // the visible date exactly.
  const check = wallClockParts(epoch, zone)
  if (check.year !== year || check.month !== month || check.day !== day) {
    return null
  }
  return epoch
}

/** Offset in ms to add to a UTC instant to get the timezone wall clock. */
function timeZoneOffsetMs(epoch: number, timeZone: string): number {
  const parts = wallClockParts(epoch, timeZone)
  const wallAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  )
  return wallAsUtc - epoch
}

function safeTimeZone(timeZone: string): string {
  if (typeof timeZone !== "string" || timeZone.length === 0) {
    return FALLBACK_TIME_ZONE
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0))
    return timeZone
  } catch {
    return FALLBACK_TIME_ZONE
  }
}
