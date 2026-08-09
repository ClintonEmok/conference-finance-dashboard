/**
 * PII sanitizer for a production-shaped Convex export (Phase 47 / LEG-03).
 *
 * Pure and dependency-free: no network, no Convex, no deployment URL. It
 * takes a table-keyed snapshot (`{ [tableName]: rows[] }`, the same shape a
 * Convex export produces) and returns a preview-loadable snapshot with every
 * direct PII content field rewritten to deterministic, preview-safe values.
 *
 * Relational integrity is preserved because internal Convex document IDs are
 * NOT PII and are left untouched — eventId, orderId, attendeeId, categoryId,
 * ticketTypeId, roomTypeId, slotId, roomId, hotelId, assignmentId, and
 * selectionId all remain as-is, so cross-table references and counts survive.
 *
 * Only human content fields are rewritten. Values are deterministic and
 * sequential so the same export always produces the same preview snapshot.
 */

export type PreviewSnapshot = Record<string, Array<Record<string, unknown>>>

export const PII_FIELDS = [
  "name",
  "bookerName",
  "email",
  "bookerEmail",
  "phone",
  "bookerPhone",
  "location",
  "dietaryRestrictions",
  "roommatePreference",
  "roommateAvoid",
  "address",
  "notes",
] as const

type PiiField = (typeof PII_FIELDS)[number]

const PII_FIELD_RANK: Record<PiiField, number> = {
  name: 0,
  bookerName: 0,
  email: 1,
  bookerEmail: 1,
  phone: 2,
  bookerPhone: 2,
  location: 3,
  dietaryRestrictions: 4,
  roommatePreference: 5,
  roommateAvoid: 6,
  address: 3,
  notes: 7,
}

function previewValue(field: PiiField, ordinal: number): string {
  switch (field) {
    case "name":
    case "bookerName":
      return `Preview Attendee ${ordinal}`
    case "email":
    case "bookerEmail":
      return `preview${ordinal}@example.org`
    case "phone":
    case "bookerPhone":
      return "+3100000000"
    case "location":
    case "address":
      return `Preview City ${ordinal}`
    case "dietaryRestrictions":
      return "none"
    case "roommatePreference":
      return `Preview Roommate ${ordinal}`
    case "roommateAvoid":
      return `Preview Avoid ${ordinal}`
    case "notes":
      return ""
  }
}

/**
 * Deterministically rewrite every PII content field to a preview-safe value.
 * Field counts are tracked independently so identical ordinal prefixes cannot
 * collide across fields; relational IDs are preserved untouched.
 */
export function sanitizeLegacyPreviewSnapshot(
  input: PreviewSnapshot
): PreviewSnapshot {
  const counts = new Map<PiiField, number>()
  const nextOrdinal = (field: PiiField): number => {
    const current = counts.get(field) ?? 0
    counts.set(field, current + 1)
    return current + 1
  }

  const output: PreviewSnapshot = {}
  for (const [tableName, rows] of Object.entries(input)) {
    output[tableName] = rows.map((row) => {
      const sanitized: Record<string, unknown> = { ...row }
      for (const field of PII_FIELDS) {
        if (typeof sanitized[field] !== "string") {
          continue
        }
        const raw = (sanitized[field] as string).trim()
        if (raw === "") {
          continue
        }
        sanitized[field] = previewValue(field, nextOrdinal(field))
      }
      return sanitized
    })
  }
  return output
}

/**
 * Serialize a sanitized snapshot to per-table JSONL strings compatible with
 * `npx convex import`. Each table maps to a JSONL body where every line is a
 * JSON object of that table's rows. Internal Convex IDs are preserved so the
 * imported preview keeps all relationships.
 */
export function serializePreviewSnapshotToJsonl(
  snapshot: PreviewSnapshot
): Record<string, string> {
  const byTable: Record<string, string> = {}
  for (const [tableName, rows] of Object.entries(snapshot)) {
    byTable[tableName] = rows
      .map((row) => JSON.stringify(row))
      .filter(Boolean)
      .join("\n")
  }
  return byTable
}

/**
 * Report which tables/rows carry PII content and confirm the snapshot has no
 * residual real-looking PII after sanitization. Used by tests and by the
 * operator note's verification step.
 */
export function scanPreviewSnapshotForPii(
  snapshot: PreviewSnapshot
): {
  clean: boolean
  violations: Array<{ table: string; rowIndex: number; field: string }>
} {
  const violations: Array<{
    table: string
    rowIndex: number
    field: string
  }> = []
  for (const [tableName, rows] of Object.entries(snapshot)) {
    rows.forEach((row, rowIndex) => {
      for (const field of PII_FIELDS) {
        const value = row[field]
        if (typeof value !== "string" || value === "") {
          continue
        }
        // Preview-safe placeholders produced by this sanitizer are exempt.
        if (
          /^Preview (Attendee|Book|City|Roommate|Avoid) \d+$/.test(value) ||
          /^preview\d+@example\.org$/.test(value) ||
          value === "+3100000000" ||
          value === "none"
        ) {
          continue
        }
        if (
          /@[a-z0-9.-]+\.[a-z]{2,}/i.test(value) ||
          /\+?\d[\d\s-]{7,}/.test(value) ||
          /[A-Za-z]{2,}\s[A-Za-z]{2,}/.test(value)
        ) {
          violations.push({ table: tableName, rowIndex, field })
        }
      }
    })
  }
  return { clean: violations.length === 0, violations }
}
