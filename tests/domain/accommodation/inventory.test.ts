import { beforeEach, describe, expect, it, vi } from "vitest"

const convexMock = vi.hoisted(() => ({
  convexMutation: vi.fn(),
  convexQuery: vi.fn(),
}))

vi.mock("@/lib/convex/server", () => ({
  convexMutation: convexMock.convexMutation,
  convexQuery: convexMock.convexQuery,
}))

import {
  attachHotelToEvent,
  createHotel,
  createRoom,
  createRoomType,
  deleteHotel,
  deleteRoom,
  deleteRoomType,
  detachHotelFromEvent,
  updateHotel,
  updateRoomLabel,
  updateRoomType,
} from "@/lib/domain/accommodation/inventory"

describe("createHotel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue({ id: "hotel_1" })
  })

  it("calls convexMutation with trimmed name", async () => {
    await createHotel({ name: "  Hilton  " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createHotel",
      expect.objectContaining({ name: "Hilton" })
    )
  })

  it("throws when name is empty", async () => {
    await expect(createHotel({ name: "   " })).rejects.toThrow(
      "Invalid 'name'. Value is required."
    )
  })

  it("passes city and notes as null when not provided", async () => {
    await createHotel({ name: "Hotel Alpha" })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createHotel",
      expect.objectContaining({ city: null, notes: null })
    )
  })

  it("trims optional city and notes", async () => {
    await createHotel({ name: "Hotel Alpha", city: "  Amsterdam  ", notes: "  Nice place  " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createHotel",
      expect.objectContaining({ city: "Amsterdam", notes: "Nice place" })
    )
  })

  it("converts blank city and notes to null", async () => {
    await createHotel({ name: "Hotel Alpha", city: "   ", notes: "" })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createHotel",
      expect.objectContaining({ city: null, notes: null })
    )
  })
})

describe("createRoomType", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue({ id: "rt_1" })
  })

  it("calls convexMutation with trimmed label and valid capacity", async () => {
    await createRoomType({ label: "  Double  ", defaultCapacity: 2 })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createRoomType",
      expect.objectContaining({ label: "Double", defaultCapacity: 2 })
    )
  })

  it("throws when label is empty", async () => {
    await expect(createRoomType({ label: "   ", defaultCapacity: 2 })).rejects.toThrow(
      "Invalid 'label'. Value is required."
    )
  })

  it("throws when defaultCapacity is zero", async () => {
    await expect(createRoomType({ label: "Suite", defaultCapacity: 0 })).rejects.toThrow(
      "Invalid 'defaultCapacity'. Expected a positive integer."
    )
  })

  it("throws when defaultCapacity is negative", async () => {
    await expect(createRoomType({ label: "Suite", defaultCapacity: -1 })).rejects.toThrow(
      "Invalid 'defaultCapacity'. Expected a positive integer."
    )
  })

  it("throws when defaultCapacity is not an integer", async () => {
    await expect(createRoomType({ label: "Suite", defaultCapacity: 1.5 })).rejects.toThrow(
      "Invalid 'defaultCapacity'. Expected a positive integer."
    )
  })

  it("throws when defaultCapacity exceeds 20", async () => {
    await expect(createRoomType({ label: "Suite", defaultCapacity: 21 })).rejects.toThrow(
      "Invalid 'defaultCapacity'. Maximum supported value is 20."
    )
  })

  it("allows defaultCapacity of exactly 20", async () => {
    await createRoomType({ label: "Suite", defaultCapacity: 20 })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createRoomType",
      expect.objectContaining({ defaultCapacity: 20 })
    )
  })
})

describe("createRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(["room_1"])
  })

  it("calls convexMutation with required fields and quantity", async () => {
    await createRoom({ hotelId: "hotel_1", roomTypeId: "rt_1", quantity: 3 })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createRooms",
      expect.objectContaining({ hotelId: "hotel_1", roomTypeId: "rt_1", quantity: 3 })
    )
  })

  it("throws when hotelId is empty", async () => {
    await expect(
      createRoom({ hotelId: "   ", roomTypeId: "rt_1", quantity: 1 })
    ).rejects.toThrow("Invalid 'hotelId'. Value is required.")
  })

  it("throws when roomTypeId is empty", async () => {
    await expect(
      createRoom({ hotelId: "hotel_1", roomTypeId: "   ", quantity: 1 })
    ).rejects.toThrow("Invalid 'roomTypeId'. Value is required.")
  })

  it("throws when quantity exceeds 20", async () => {
    await expect(
      createRoom({ hotelId: "hotel_1", roomTypeId: "rt_1", quantity: 21 })
    ).rejects.toThrow("Invalid 'quantity'. Maximum supported value is 20.")
  })

  it("throws when quantity is zero", async () => {
    await expect(
      createRoom({ hotelId: "hotel_1", roomTypeId: "rt_1", quantity: 0 })
    ).rejects.toThrow("Invalid 'quantity'. Expected a positive integer.")
  })

  it("uses label count as quantity when manual labels are provided", async () => {
    await createRoom({
      hotelId: "hotel_1",
      roomTypeId: "rt_1",
      quantity: 99, // ignored when labels are provided
      labels: ["101", "102", "103"],
    })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createRooms",
      expect.objectContaining({ quantity: 3, labels: ["101", "102", "103"] })
    )
  })

  it("throws when manual labels contain duplicates", async () => {
    await expect(
      createRoom({
        hotelId: "hotel_1",
        roomTypeId: "rt_1",
        quantity: 3,
        labels: ["101", "101", "102"],
      })
    ).rejects.toThrow("Manual room labels must be unique.")
  })

  it("ignores empty label strings after trimming", async () => {
    await createRoom({
      hotelId: "hotel_1",
      roomTypeId: "rt_1",
      quantity: 99,
      labels: ["  101  ", "  102  "],
    })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:createRooms",
      expect.objectContaining({ labels: ["101", "102"], quantity: 2 })
    )
  })
})

describe("updateRoomLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(undefined)
  })

  it("calls convexMutation with trimmed roomId and label", async () => {
    await updateRoomLabel({ roomId: " room_1 ", label: " Suite A " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:updateRoomLabel",
      { roomId: "room_1", label: "Suite A" }
    )
  })

  it("throws when roomId is empty", async () => {
    await expect(updateRoomLabel({ roomId: "  ", label: "Suite A" })).rejects.toThrow(
      "Invalid 'roomId'. Value is required."
    )
  })

  it("throws when label is empty", async () => {
    await expect(updateRoomLabel({ roomId: "room_1", label: "   " })).rejects.toThrow(
      "Invalid 'label'. Value is required."
    )
  })
})

describe("attachHotelToEvent / detachHotelFromEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(undefined)
  })

  it("attachHotelToEvent calls mutation with trimmed ids", async () => {
    await attachHotelToEvent({ eventId: " evt_1 ", hotelId: " hotel_1 " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:attachHotelToEventByProviderId",
      { eventProviderEventId: "evt_1", hotelId: "hotel_1" }
    )
  })

  it("attachHotelToEvent throws when eventId is empty", async () => {
    await expect(attachHotelToEvent({ eventId: "  ", hotelId: "hotel_1" })).rejects.toThrow(
      "Invalid 'eventId'. Value is required."
    )
  })

  it("detachHotelFromEvent calls mutation with trimmed ids", async () => {
    await detachHotelFromEvent({ eventId: " evt_1 ", hotelId: " hotel_1 " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:detachHotelFromEventByProviderId",
      { eventProviderEventId: "evt_1", hotelId: "hotel_1" }
    )
  })
})

describe("deleteHotel / deleteRoomType / deleteRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(undefined)
  })

  it("deleteHotel throws when hotelId is empty", async () => {
    await expect(deleteHotel({ hotelId: "   " })).rejects.toThrow(
      "Invalid 'hotelId'. Value is required."
    )
  })

  it("deleteRoomType throws when roomTypeId is empty", async () => {
    await expect(deleteRoomType({ roomTypeId: "   " })).rejects.toThrow(
      "Invalid 'roomTypeId'. Value is required."
    )
  })

  it("deleteRoom throws when roomId is empty", async () => {
    await expect(deleteRoom({ roomId: "   " })).rejects.toThrow(
      "Invalid 'roomId'. Value is required."
    )
  })
})

describe("updateHotel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(undefined)
  })

  it("calls convexMutation and passes optional fields through", async () => {
    await updateHotel({ hotelId: "hotel_1", name: "Updated", city: "Berlin", notes: "VIP" })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:updateHotel",
      expect.objectContaining({ hotelId: "hotel_1", name: "Updated", city: "Berlin", notes: "VIP" })
    )
  })

  it("normalises city to null when it is blank", async () => {
    await updateHotel({ hotelId: "hotel_1", city: "   " })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:updateHotel",
      expect.objectContaining({ city: null })
    )
  })
})

describe("updateRoomType", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    convexMock.convexMutation.mockResolvedValue(undefined)
  })

  it("calls convexMutation with provided fields", async () => {
    await updateRoomType({ roomTypeId: "rt_1", label: "Single", defaultCapacity: 1 })

    expect(convexMock.convexMutation).toHaveBeenCalledWith(
      "accommodation:updateRoomType",
      expect.objectContaining({ roomTypeId: "rt_1", label: "Single", defaultCapacity: 1 })
    )
  })

  it("throws when roomTypeId is empty", async () => {
    await expect(updateRoomType({ roomTypeId: "  " })).rejects.toThrow(
      "Invalid 'roomTypeId'. Value is required."
    )
  })
})
