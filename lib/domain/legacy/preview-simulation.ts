/**
 * Preview production simulation (Phase 49 / RUN-01).
 *
 * Pure, dependency-free shared pieces for seeding the sanitized audited
 * `divine-redesign` shape into a PREVIEW deployment:
 * - re-exports the audited sanitized fixture builder (test-facing source of
 *   truth stays in `tests/fixtures/legacy-preview.snapshot.ts`);
 * - the dependency-ordered table list used by both the seed mutation and the
 *   tests, with the logical-ID reference fields per table;
 * - a pure reference-remap helper.
 *
 * The seed mutation itself lives in `convex/seedPreviewSimulation.ts`; this
 * module never touches Convex or a deployment.
 */

export {
  buildLegacyPreviewSnapshot,
  LEGACY_AUDIT_COUNTS,
  LEGACY_BASE_CHECK_IN_AT,
  LEGACY_DAY_MS,
  LEGACY_EVENT_SLUG,
} from "../../../tests/fixtures/legacy-preview.snapshot"
export type { PreviewSnapshot } from "../../../tests/fixtures/legacy-preview.snapshot"

/**
 * Dependency-ordered tables with the logical-ID reference fields that must be
 * remapped to generated Convex IDs during seeding. Parents are inserted before
 * children so every reference resolves.
 */
export const SEED_ORDER: Array<{ table: string; refs: string[] }> = [
  { table: "events", refs: [] },
  { table: "accommodationCategories", refs: [] },
  { table: "accommodationOptions", refs: [] },
  { table: "accommodationRoomTypes", refs: ["categoryId"] },
  { table: "accommodationHotels", refs: [] },
  { table: "accommodationEventHotels", refs: ["eventId", "hotelId"] },
  { table: "accommodationRooms", refs: ["hotelId", "roomTypeId"] },
  { table: "accommodationSlots", refs: ["eventId", "hotelId", "roomId"] },
  {
    table: "eventAccommodationConfig",
    refs: ["eventId", "defaultCategoryId"],
  },
  { table: "eventAccommodationRates", refs: ["eventId", "categoryId"] },
  {
    table: "eventAccommodationOptions",
    refs: ["eventId", "optionId"],
  },
  {
    table: "eventAccommodationResources",
    refs: ["eventId", "roomTypeId"],
  },
  { table: "ticketTypes", refs: ["eventId", "roomTypeId"] },
  { table: "orders", refs: ["eventId"] },
  { table: "orderAttendees", refs: ["orderId"] },
  {
    table: "orderTicketSelections",
    refs: ["orderId", "attendeeId", "ticketTypeId"],
  },
  {
    table: "orderAssignments",
    refs: ["orderId", "attendeeId", "slotId"],
  },
  {
    table: "orderAccommodationSelections",
    refs: ["orderId", "attendeeId", "categoryId"],
  },
]

/** Pure remap of a row's logical-ID reference fields to generated IDs. Never copies `_id`. */
export function remapLogicalReferences(
  row: Record<string, unknown>,
  refs: string[],
  idMap: Map<string, string>
): Record<string, unknown> {
  const remapped: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === "_id") {
      continue
    }
    if (refs.includes(key) && typeof value === "string" && idMap.has(value)) {
      remapped[key] = idMap.get(value)
    } else {
      remapped[key] = value
    }
  }
  return remapped
}

/**
 * A deterministic stable key used to detect an already-seeded row so a tracer
 * seed can expand to full and a full re-run is a no-op. Returns null when the
 * table has no stable key (should not happen for the seeded tables).
 */
export function stableKeyFor(table: string, row: Record<string, unknown>): string | null {
  switch (table) {
    case "events":
      return typeof row.slug === "string" ? `slug:${row.slug}` : null
    case "accommodationCategories":
      return typeof row.code === "string" ? `code:${row.code}` : null
    case "accommodationOptions":
      return typeof row.code === "string" ? `code:${row.code}` : null
    case "accommodationRoomTypes":
      return typeof row.label === "string" ? `label:${row.label}` : null
    case "accommodationHotels":
      return typeof row.name === "string" ? `name:${row.name}` : null
    case "accommodationEventHotels":
      return typeof row.eventId === "string" && typeof row.hotelId === "string"
        ? `event:${row.eventId}:hotel:${row.hotelId}`
        : null
    case "accommodationRooms":
      return typeof row.label === "string" ? `label:${row.label}` : null
    case "accommodationSlots":
      return typeof row.slotLabel === "string"
        ? `slot:${row.slotLabel}`
        : null
    case "eventAccommodationConfig":
      return typeof row.eventId === "string" ? `event:${row.eventId}` : null
    case "eventAccommodationRates":
      return typeof row.eventId === "string" &&
        typeof row.categoryId === "string" &&
        typeof row.occupancy === "string"
        ? `event:${row.eventId}:cat:${row.categoryId}:occ:${row.occupancy}`
        : null
    case "eventAccommodationOptions":
      return typeof row.eventId === "string" && typeof row.optionId === "string"
        ? `event:${row.eventId}:opt:${row.optionId}`
        : null
    case "eventAccommodationResources":
      return typeof row.eventId === "string" &&
        typeof row.roomTypeId === "string"
        ? `event:${row.eventId}:roomType:${row.roomTypeId}`
        : null
    case "ticketTypes":
      return typeof row.label === "string" ? `label:${row.label}` : null
    case "orders":
      return typeof row.bookingRef === "string"
        ? `bookingRef:${row.bookingRef}`
        : null
    case "orderAttendees":
      return typeof row.attendeeKey === "string"
        ? `attendeeKey:${row.attendeeKey}`
        : null
    case "orderTicketSelections":
      return typeof row.attendeeId === "string" &&
        typeof row.ticketTypeId === "string"
        ? `attendee:${row.attendeeId}:ticket:${row.ticketTypeId}`
        : null
    case "orderAssignments":
      return typeof row.attendeeId === "string" && typeof row.slotId === "string"
        ? `attendee:${row.attendeeId}:slot:${row.slotId}`
        : null
    case "orderAccommodationSelections":
      return typeof row.attendeeId === "string"
        ? `attendee:${row.attendeeId}`
        : null
    default:
      return null
  }
}
