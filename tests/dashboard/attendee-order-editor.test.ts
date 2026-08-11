import { describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("convex/react", () => ({
  useQuery: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/events/demo/orders",
}))

import {
  buildAttendeeAccommodationPatchBody,
  buildAttendeeGeneralPatchBody,
  buildAttendeeMoveBody,
  buildEditorSaveRequests,
  collectDirtyAccommodationFields,
  collectDirtyGeneralFields,
  matchEditorSelection,
  type AttendeeOrderEditorOptionSelection,
  type EditorAccommodationDraft,
  type EditorEditContextSelection,
} from "@/components/dashboard/attendee-order-editor"

const ROOT = resolve(import.meta.dirname, "../..")

function readSource(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8")
}

const CLIENT_AUTHORITY_FIELDS = [
  "amountMinor",
  "totalAmountMinor",
  "amountDueMinor",
  "priceMinor",
  "price",
  "total",
  "checkInAt",
  "checkOutAt",
  "nightCount",
  "roomId",
  "roomTypeId",
  "slotId",
  "assignedRoomId",
  "snapshot",
  "priceSnapshot",
  "configVersion",
  "confirmedAt",
  "categoryId",
]

function expectNoClientAuthorityFields(body: Record<string, unknown>) {
  for (const key of CLIENT_AUTHORITY_FIELDS) {
    expect(Object.keys(body), `forbidden field ${key}`).not.toContain(key)
  }
}

const options: AttendeeOrderEditorOptionSelection[] = [
  { optionKey: "cot", quantity: 1, nights: 2 },
]

describe("buildAttendeeGeneralPatchBody", () => {
  it("includes only genderType, ticketTypeId, and location", () => {
    const body = buildAttendeeGeneralPatchBody({
      genderType: "FEMALE",
      ticketTypeId: "ticket_2",
      location: "Amsterdam",
    })
    expect(body).toEqual({
      genderType: "FEMALE",
      ticketTypeId: "ticket_2",
      location: "Amsterdam",
    })
    expectNoClientAuthorityFields(body as Record<string, unknown>)
  })

  it("omits unchanged (non-dirty) fields and clears nullable values with null", () => {
    const body = buildAttendeeGeneralPatchBody({
      genderType: null,
      location: "  ",
    })
    expect(body).toEqual({ genderType: null, location: null })
    expect(Object.keys(body)).not.toContain("ticketTypeId")
  })

  it("trims and nullifies empty location while keeping empty gender as null", () => {
    const body = buildAttendeeGeneralPatchBody({
      genderType: "",
      location: "  ",
    })
    expect(body).toEqual({ genderType: null, location: null })
  })
})

describe("buildAttendeeAccommodationPatchBody", () => {
  it("sends only eventId plus the simplified contract choices", () => {
    const body = buildAttendeeAccommodationPatchBody({
      eventId: "event_1",
      occupancy: "shared",
      optionSelections: options,
      nightBeforeLevel: "standard",
      nightBeforeOccupancy: "single",
    })
    expect(body).toEqual({
      eventId: "event_1",
      occupancy: "shared",
      optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
      nightBeforeLevel: "standard",
      nightBeforeOccupancy: "single",
    })
    expectNoClientAuthorityFields(body)
  })

  it("omits optional fields that were not changed", () => {
    const body = buildAttendeeAccommodationPatchBody({
      eventId: "event_1",
      occupancy: "single",
    })
    expect(Object.keys(body).sort()).toEqual(["eventId", "occupancy"])
    expectNoClientAuthorityFields(body)
  })
})

describe("buildAttendeeMoveBody", () => {
  it("contains exactly targetOrderId", () => {
    const body = buildAttendeeMoveBody("order_2")
    expect(body).toEqual({ targetOrderId: "order_2" })
    expect(Object.keys(body)).toEqual(["targetOrderId"])
  })
})

describe("dirty field collection", () => {
  it("returns null when nothing changed and only dirty fields when changed", () => {
    const initial = {
      genderType: "MALE" as const,
      ticketTypeId: "ticket_1",
      location: "Amsterdam",
    }
    expect(
      collectDirtyGeneralFields({
        initial,
        draft: { genderType: "MALE", ticketTypeId: "ticket_1", location: "Amsterdam" },
      })
    ).toBeNull()

    const changes = collectDirtyGeneralFields({
      initial,
      draft: { genderType: "FEMALE", ticketTypeId: "ticket_1", location: "Amsterdam" },
    })
    expect(changes).toEqual({ genderType: "FEMALE" })
  })

  it("never sends an empty ticketTypeId (the route rejects clearing)", () => {
    const changes = collectDirtyGeneralFields({
      initial: { genderType: "MALE", ticketTypeId: "ticket_1", location: "Leiden" },
      draft: { genderType: "", ticketTypeId: "", location: "" },
    })
    expect(changes).toEqual({ genderType: null, location: null })
    expect(changes).not.toHaveProperty("ticketTypeId")
  })

  it("collects accommodation changes with normalized option order", () => {
    const initial: EditorAccommodationDraft = {
      occupancy: "shared",
      optionSelections: [
        { optionKey: "cot", quantity: 1, nights: 2 },
      ],
      nightBeforeLevel: undefined,
      nightBeforeOccupancy: undefined,
    }
    expect(
      collectDirtyAccommodationFields({
        initial,
        draft: {
          occupancy: "shared",
          optionSelections: [
            { optionKey: "cot", quantity: 1, nights: 2 },
          ],
          nightBeforeLevel: undefined,
          nightBeforeOccupancy: undefined,
        },
      })
    ).toBeNull()

    const changes = collectDirtyAccommodationFields({
      initial,
      draft: {
        occupancy: "single",
        optionSelections: [],
        nightBeforeLevel: "superior",
        nightBeforeOccupancy: "shared",
      },
    })
    expect(changes).toEqual({
      occupancy: "single",
      optionSelections: [],
      nightBeforeLevel: "superior",
      nightBeforeOccupancy: "shared",
    })
  })
})

describe("buildEditorSaveRequests (Promise.all route set)", () => {
  it("builds both PATCH routes when general and accommodation are dirty", () => {
    const requests = buildEditorSaveRequests({
      attendeeId: "attendee_1",
      eventId: "event_1",
      generalChanges: { genderType: "FEMALE" },
      accommodationChanges: { occupancy: "single" },
    })
    expect(requests).toHaveLength(2)
    expect(requests[0]).toEqual({
      method: "PATCH",
      url: "/api/dashboard/attendees/attendee_1",
      body: { genderType: "FEMALE" },
    })
    expect(requests[1]).toEqual({
      method: "PATCH",
      url: "/api/dashboard/attendees/attendee_1/accommodation",
      body: { eventId: "event_1", occupancy: "single" },
    })
  })

  it("builds only the general route when accommodation is clean", () => {
    const requests = buildEditorSaveRequests({
      attendeeId: "attendee_1",
      eventId: "event_1",
      generalChanges: { location: "Rotterdam" },
      accommodationChanges: null,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe("/api/dashboard/attendees/attendee_1")
    expect(requests[0].body).toEqual({ location: "Rotterdam" })
  })

  it("builds only the accommodation route when general is clean", () => {
    const requests = buildEditorSaveRequests({
      attendeeId: "attendee_1",
      eventId: "event_1",
      generalChanges: null,
      accommodationChanges: { optionSelections: options },
    })
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(
      "/api/dashboard/attendees/attendee_1/accommodation"
    )
    expect(requests[0].body).toEqual({
      eventId: "event_1",
      optionSelections: [{ optionKey: "cot", quantity: 1, nights: 2 }],
    })
  })

  it("returns an empty set when nothing is dirty", () => {
    expect(
      buildEditorSaveRequests({
        attendeeId: "attendee_1",
        eventId: "event_1",
        generalChanges: null,
        accommodationChanges: null,
      })
    ).toEqual([])
  })

  it("never includes client money, category, room, or snapshot fields", () => {
    const requests = buildEditorSaveRequests({
      attendeeId: "attendee_1",
      eventId: "event_1",
      generalChanges: { genderType: "MIXED", ticketTypeId: "ticket_2" },
      accommodationChanges: { occupancy: "shared", optionSelections: options },
    })
    for (const request of requests) {
      expectNoClientAuthorityFields(request.body)
    }
  })
})

describe("matchEditorSelection", () => {
  const selections: EditorEditContextSelection[] = [
    {
      attendeeKey: "attendee-1",
      attendeeName: "Ada Lovelace",
      ticketLabel: "Weekend",
      occupancy: "shared",
      optionSelections: [],
      confirmed: false,
    },
    {
      attendeeKey: "attendee-2",
      attendeeName: "Grace Hopper",
      ticketLabel: "Full",
      occupancy: "single",
      optionSelections: [],
      confirmed: false,
    },
  ]

  it("matches by attendee key first", () => {
    const match = matchEditorSelection(selections, {
      id: "attendee-1",
      name: "Ada Lovelace",
    })
    expect(match?.attendeeKey).toBe("attendee-1")
  })

  it("falls back to the single selection for single-attendee orders", () => {
    const match = matchEditorSelection([selections[0]], {
      id: "internal-id",
      name: "Ada Lovelace",
    })
    expect(match?.attendeeKey).toBe("attendee-1")
  })

  it("falls back to a name match in multi-attendee orders", () => {
    const match = matchEditorSelection(selections, {
      id: "unrelated-id",
      name: "Grace Hopper",
    })
    expect(match?.attendeeKey).toBe("attendee-2")
  })

  it("returns null when nothing matches", () => {
    expect(
      matchEditorSelection(selections, { id: "zzz", name: "Nobody" })
    ).toBeNull()
  })
})

describe("AttendeeOrderEditor source contract", () => {
  it("uses only the three server-authoritative endpoints with PATCH/PATCH/POST", () => {
    const source = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(source).toMatch(/\/api\/dashboard\/attendees\//)
    expect(source).toContain("/accommodation")
    expect(source).toContain("/move")
    expect(source).toMatch(/method: "PATCH"/)
    expect(source).toMatch(/method: "POST"/)
  })

  it("runs dirty saves concurrently with Promise.all", () => {
    const source = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(source).toContain("Promise.all(")
  })

  it("confirms ticket changes, option clearing, and moves with Dialogs, never window.confirm", () => {
    const source = readSource("components/dashboard/attendee-order-editor.tsx")
    expect(source).toContain("Change ticket type")
    expect(source).toContain("Remove ")
    expect(source).toContain("Move attendee")
    expect(source).not.toContain("window.confirm")
  })

  it("never sends client-derived amounts, categories, rooms, or snapshots", () => {
    const source = readSource("components/dashboard/attendee-order-editor.tsx")
    for (const field of CLIENT_AUTHORITY_FIELDS) {
      expect(source, `field ${field}`).not.toMatch(
        new RegExp(`body\\.${field}|body\\[['"]${field}`)
      )
    }
  })
})
