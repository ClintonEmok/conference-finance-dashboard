import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

describe("attendee detail edit surface", () => {
  it("mounts the shared AttendeeOrderEditor inline on the global page", () => {
    const page = readSource("app/dashboard/attendees/[attendeeId]/page.tsx")
    expect(page).toContain('"use client"')
    expect(page).toContain("AttendeeOrderEditor")
    expect(page).toContain("<Dialog")
  })

  it("passes the attendee's event, order, booking ref, and current values", () => {
    const page = readSource("app/dashboard/attendees/[attendeeId]/page.tsx")
    expect(page).toContain("ticketTypeId: payload.attendee.ticketTypeId")
    expect(page).toContain("genderType: payload.signals.genderType")
    expect(page).toContain("location: payload.signals.location")
    expect(page).toContain("orderId: payload.order.id")
    expect(page).toContain("bookingRef: payload.order.bookingRef")
    expect(page).toContain("eventId: payload.event.id")
  })

  it("keeps the hero, ledger, room status, signals, and accommodation links", () => {
    const page = readSource("app/dashboard/attendees/[attendeeId]/page.tsx")
    expect(page).toContain("Order Ledger")
    expect(page).toContain("Activity Ledger")
    expect(page).toContain("Accommodation Status")
    expect(page).toContain("Profile Signals")
    expect(page).toContain("Room Placement")
    expect(page).toContain("/dashboard/accommodation?attendeeId=")
    expect(page).toContain("Order Detail")
  })

  it("replaces the standalone gender save control with the editor affordance", () => {
    const page = readSource("app/dashboard/attendees/[attendeeId]/page.tsx")
    expect(page).not.toContain("handleSaveGender")
    expect(page).not.toContain("isSavingGender")
    expect(page).toContain("Edit attendee")
  })

  it("refreshes the detail payload after the editor saves", () => {
    const page = readSource("app/dashboard/attendees/[attendeeId]/page.tsx")
    expect(page).toContain("loadAttendeeDetail(attendeeId, true)")
  })

  it("exposes the order booking reference on the attendee detail DTO", () => {
    const dto = readSource("lib/domain/finance/attendee-detail.ts")
    expect(dto).toMatch(/bookingRef: string \| null/)
    expect(dto).toContain("bookingRef: order.bookingRef ?? null")
  })

  it("keeps both event-scoped and global attendee routes on the same page", () => {
    const eventPage = readSource(
      "app/dashboard/events/[slug]/attendees/[attendeeId]/page.tsx"
    )
    expect(eventPage).toContain(
      'from "@/app/dashboard/attendees/[attendeeId]/page"'
    )
  })
})
