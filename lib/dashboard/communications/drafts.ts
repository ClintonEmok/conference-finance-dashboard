/**
 * Event-keyed compose-draft persistence for the Communications Center.
 *
 * Drafts are stored in `localStorage` under an event-scoped key so each
 * event keeps its own in-progress announcement. All helpers are safe to call
 * during SSR (no `window` access) and degrade to no-ops when storage is
 * unavailable or full.
 */

export type ComposeDraft = {
  title: string
  message: string
  eventName: string
  eventDate: string
  eventLocation: string
  paymentUrl: string
  nightBeforeNote: string
  updatedAt: number
}

const STORAGE_PREFIX = "communications:draft:"

export function draftStorageKey(eventId: string) {
  return `${STORAGE_PREFIX}${eventId}`
}

export function readComposeDraft(eventId: string): ComposeDraft | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(draftStorageKey(eventId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ComposeDraft>
    if (
      typeof parsed.title !== "string" ||
      typeof parsed.message !== "string" ||
      typeof parsed.eventName !== "string" ||
      typeof parsed.eventDate !== "string" ||
      typeof parsed.eventLocation !== "string"
    ) {
      return null
    }
    return {
      title: parsed.title,
      message: parsed.message,
      eventName: parsed.eventName,
      eventDate: parsed.eventDate,
      eventLocation: parsed.eventLocation,
      paymentUrl: typeof parsed.paymentUrl === "string" ? parsed.paymentUrl : "",
      nightBeforeNote:
        typeof parsed.nightBeforeNote === "string"
          ? parsed.nightBeforeNote
          : "",
      updatedAt:
        typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function writeComposeDraft(eventId: string, draft: ComposeDraft) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(draftStorageKey(eventId), JSON.stringify(draft))
  } catch {
    // Storage unavailable or full — the draft simply won't persist.
  }
}

export function removeComposeDraft(eventId: string) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(draftStorageKey(eventId))
  } catch {
    // Storage unavailable — nothing to clear.
  }
}
