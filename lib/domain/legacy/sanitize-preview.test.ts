import { describe, expect, it } from "vitest"
import {
  sanitizeLegacyPreviewSnapshot,
  serializePreviewSnapshotToJsonl,
  scanPreviewSnapshotForPii,
} from "@/lib/domain/legacy/sanitize-preview"

const productionShapedSnapshot = {
  events: [
    {
      _id: "evt_real",
      slug: "divine-redesign",
      title: "Divine Conference",
      startsAt: 1750000000000,
    },
  ],
  orders: [
    {
      _id: "order_real_1",
      eventId: "evt_real",
      bookingRef: "BK-REAL-12345",
      bookerName: "Jan de Vries",
      bookerEmail: "jan.devries@example.com",
      bookerPhone: "+31612345678",
    },
  ],
  orderAttendees: [
    {
      _id: "attendee_real_1",
      orderId: "order_real_1",
      attendeeKey: "attendee-1",
      name: "Maria Jansen",
      email: "maria.jansen@example.com",
      phone: "+31698765432",
      location: "Rotterdam",
      dietaryRestrictions: "Gluten free",
      roommatePreference: "Anna",
      roommateAvoid: "snoring",
    },
  ],
}

describe("legacy preview sanitization (LEG-03)", () => {
  it("rewrites every PII content field to deterministic preview-safe values and preserves relational IDs", () => {
    const sanitized = sanitizeLegacyPreviewSnapshot(productionShapedSnapshot)

    const order = sanitized.orders[0]
    expect(order.bookingRef).toBe("BK-REAL-12345") // not PII, preserved
    expect(order.eventId).toBe("evt_real") // internal ID, preserved
    expect(order.bookerName).toBe("Preview Attendee 1")
    expect(order.bookerEmail).toBe("preview1@example.org")
    expect(order.bookerPhone).toBe("+3100000000")

    const attendee = sanitized.orderAttendees[0]
    expect(attendee.orderId).toBe("order_real_1") // relational ref preserved
    expect(attendee.name).toBe("Preview Attendee 1")
    expect(attendee.email).toBe("preview1@example.org")
    expect(attendee.phone).toBe("+3100000000")
    expect(attendee.location).toBe("Preview City 1")
    expect(attendee.dietaryRestrictions).toBe("none")
    expect(attendee.roommatePreference).toBe("Preview Roommate 1")
    expect(attendee.roommateAvoid).toBe("Preview Avoid 1")

    // No residual real PII remains.
    const scan = scanPreviewSnapshotForPii(sanitized)
    expect(scan.clean).toBe(true)
    expect(scan.violations).toEqual([])
  })

  it("is deterministic and idempotent across runs", () => {
    const first = sanitizeLegacyPreviewSnapshot(productionShapedSnapshot)
    const second = sanitizeLegacyPreviewSnapshot(productionShapedSnapshot)
    expect(first).toEqual(second)
  })

  it("serializes to per-table JSONL for npx convex import", () => {
    const sanitized = sanitizeLegacyPreviewSnapshot(productionShapedSnapshot)
    const jsonl = serializePreviewSnapshotToJsonl(sanitized)
    expect(jsonl.orders.split("\n")).toHaveLength(1)
    expect(jsonl.orderAttendees.split("\n")).toHaveLength(1)
    expect(JSON.parse(jsonl.orderAttendees).name).toBe("Preview Attendee 1")
  })
})
