type WallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/

function getTimeZone(timeZone: string): string | null {
  if (typeof timeZone !== "string" || timeZone.length === 0) {
    return null
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date(0))
    return timeZone
  } catch {
    return null
  }
}

function wallClockParts(epoch: number, timeZone: string): WallClockParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
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
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

function naiveUtcEpoch(parts: WallClockParts): number {
  const date = new Date(0)
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  date.setUTCHours(parts.hour, parts.minute, parts.second, 0)
  return date.getTime()
}

function timeZoneOffsetMs(epoch: number, timeZone: string): number {
  return naiveUtcEpoch(wallClockParts(epoch, timeZone)) - epoch
}

function parseDateTimeLocal(value: string): WallClockParts | null {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value)
  if (!match) {
    return null
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match
  const parts: WallClockParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
    second: Number(secondText ?? "0"),
  }

  if (
    parts.year < 1 ||
    parts.year > 9999 ||
    parts.month < 1 ||
    parts.month > 12 ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59
  ) {
    return null
  }

  const normalized = wallClockParts(naiveUtcEpoch(parts), "UTC")
  return normalized.year === parts.year &&
    normalized.month === parts.month &&
    normalized.day === parts.day &&
    normalized.hour === parts.hour &&
    normalized.minute === parts.minute &&
    normalized.second === parts.second
    ? parts
    : null
}

/**
 * Convert an event-timezone wall-clock datetime-local value to an epoch
 * instant. Returns null for malformed dates, invalid zones, or DST gaps.
 */
export function eventLocalDateTimeToEpoch(
  value: string,
  timeZone: string
): number | null {
  const parts = parseDateTimeLocal(value)
  const zone = getTimeZone(timeZone)
  if (!parts || !zone) {
    return null
  }

  const naiveUtc = naiveUtcEpoch(parts)
  const firstPass = naiveUtc - timeZoneOffsetMs(naiveUtc, zone)
  const epoch = naiveUtc - timeZoneOffsetMs(firstPass, zone)
  const resolved = wallClockParts(epoch, zone)

  if (
    resolved.year !== parts.year ||
    resolved.month !== parts.month ||
    resolved.day !== parts.day ||
    resolved.hour !== parts.hour ||
    resolved.minute !== parts.minute ||
    resolved.second !== parts.second
  ) {
    return null
  }

  return epoch
}

/** Format an epoch instant as a datetime-local value in the event timezone. */
export function epochToEventLocalDateTime(
  epoch: number,
  timeZone: string
): string | null {
  const zone = getTimeZone(timeZone)
  if (!Number.isFinite(epoch) || !zone) {
    return null
  }

  const parts = wallClockParts(epoch, zone)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`
}

/** Format an epoch instant as a human-readable date and time in the event timezone. */
export function formatEventDateTime(
  epoch: number,
  timeZone: string
): string | null {
  const zone = getTimeZone(timeZone)
  if (!Number.isFinite(epoch) || !zone) {
    return null
  }

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epoch))
}
