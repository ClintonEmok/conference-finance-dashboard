"use client"

import { useState } from "react"
import {
  Building2,
  Plus,
  Check,
  ChevronRight,
  ChevronLeft,
  BedDouble,
  AlertCircle,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type { Doc, Id } from "@/convex/_generated/dataModel"

type Step = "hotel" | "roomTypes" | "rooms" | "review"

interface RoomTypeConfig {
  id: string
  label: string
  capacity: number
  roomCount: number
}

interface AddHotelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: Id<"events">
  existingHotels: Doc<"accommodationHotels">[] | undefined
  existingRoomTypes: Doc<"accommodationRoomTypes">[] | undefined
  onSubmit: (data: {
    hotelId?: Id<"accommodationHotels">
    newHotel?: { name: string; city?: string; address?: string }
    roomTypes: RoomTypeConfig[]
  }) => Promise<void>
  isSubmitting: boolean
}

export function AddHotelDialog({
  open,
  onOpenChange,
  eventId,
  existingHotels,
  existingRoomTypes,
  onSubmit,
  isSubmitting,
}: AddHotelDialogProps) {
  const [currentStep, setCurrentStep] = useState<Step>("hotel")
  const [mode, setMode] = useState<"select" | "create">("select")

  // Hotel selection state
  const [selectedHotelId, setSelectedHotelId] = useState<string>("")
  const [newHotelName, setNewHotelName] = useState("")
  const [newHotelCity, setNewHotelCity] = useState("")
  const [newHotelAddress, setNewHotelAddress] = useState("")

  // Room type state
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<RoomTypeConfig[]>(
    []
  )
  const [newRoomTypeLabel, setNewRoomTypeLabel] = useState("")
  const [newRoomTypeCapacity, setNewRoomTypeCapacity] = useState("2")

  // Filter out already linked hotels
  const availableHotels =
    existingHotels?.filter(
      (hotel) => !existingHotels.some((eh) => eh._id === hotel._id)
    ) || []

  const handleNext = () => {
    switch (currentStep) {
      case "hotel":
        if (mode === "select" && selectedHotelId) {
          setCurrentStep("roomTypes")
        } else if (mode === "create" && newHotelName.trim()) {
          setCurrentStep("roomTypes")
        }
        break
      case "roomTypes":
        if (selectedRoomTypes.length > 0) {
          setCurrentStep("rooms")
        }
        break
      case "rooms":
        setCurrentStep("review")
        break
      case "review":
        break
    }
  }

  const handleBack = () => {
    switch (currentStep) {
      case "roomTypes":
        setCurrentStep("hotel")
        break
      case "rooms":
        setCurrentStep("roomTypes")
        break
      case "review":
        setCurrentStep("rooms")
        break
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset state after close animation
    setTimeout(() => {
      setCurrentStep("hotel")
      setMode("select")
      setSelectedHotelId("")
      setNewHotelName("")
      setNewHotelCity("")
      setNewHotelAddress("")
      setSelectedRoomTypes([])
      setNewRoomTypeLabel("")
      setNewRoomTypeCapacity("2")
    }, 200)
  }

  const handleSubmit = async () => {
    const data: any = {
      roomTypes: selectedRoomTypes.map((rt) => ({
        id: rt.id,
        label: rt.label,
        capacity: rt.capacity,
        roomCount: rt.roomCount,
      })),
    }

    if (mode === "select" && selectedHotelId) {
      data.hotelId = selectedHotelId as Id<"accommodationHotels">
    } else if (mode === "create") {
      data.newHotel = {
        name: newHotelName.trim(),
        city: newHotelCity.trim() || undefined,
        address: newHotelAddress.trim() || undefined,
      }
    }

    await onSubmit(data)
    handleClose()
  }

  const addExistingRoomType = (roomTypeId: string) => {
    const roomType = existingRoomTypes?.find((rt) => rt._id === roomTypeId)
    if (!roomType) return

    if (!selectedRoomTypes.find((rt) => rt.id === roomTypeId)) {
      setSelectedRoomTypes((prev) => [
        ...prev,
        {
          id: roomTypeId,
          label: roomType.label,
          capacity: (roomType as any).defaultCapacity || 1,
          roomCount: 0,
        },
      ])
    }
  }

  const addNewRoomType = () => {
    if (!newRoomTypeLabel.trim()) return

    const tempId = `new-${Date.now()}`
    setSelectedRoomTypes((prev) => [
      ...prev,
      {
        id: tempId,
        label: newRoomTypeLabel.trim(),
        capacity: parseInt(newRoomTypeCapacity) || 1,
        roomCount: 0,
      },
    ])
    setNewRoomTypeLabel("")
    setNewRoomTypeCapacity("2")
  }

  const removeRoomType = (id: string) => {
    setSelectedRoomTypes((prev) => prev.filter((rt) => rt.id !== id))
  }

  const updateRoomCount = (id: string, count: number) => {
    setSelectedRoomTypes((prev) =>
      prev.map((rt) =>
        rt.id === id ? { ...rt, roomCount: Math.max(0, count) } : rt
      )
    )
  }

  const canProceed = () => {
    switch (currentStep) {
      case "hotel":
        return mode === "select"
          ? !!selectedHotelId
          : newHotelName.trim().length > 0
      case "roomTypes":
        return selectedRoomTypes.length > 0
      case "rooms":
        return selectedRoomTypes.every((rt) => rt.roomCount > 0)
      case "review":
        return true
      default:
        return false
    }
  }

  const stepProgress = {
    hotel: 1,
    roomTypes: 2,
    rooms: 3,
    review: 4,
  }

  const totalSteps = 4

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Add Hotel to Event
          </DialogTitle>
          <DialogDescription>
            Step {stepProgress[currentStep]} of {totalSteps}:{" "}
            {currentStep === "hotel" && "Select or create a hotel"}
            {currentStep === "roomTypes" && "Choose room types"}
            {currentStep === "rooms" && "Specify room counts"}
            {currentStep === "review" && "Review and confirm"}
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="mt-2 flex gap-1">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i < stepProgress[currentStep] ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Step Content */}
        <div className="mt-4 min-h-[300px]">
          {/* Step 1: Hotel Selection */}
          {currentStep === "hotel" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setMode("select")}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    mode === "select"
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <div className="font-medium">Select Existing</div>
                  <div className="text-sm text-muted-foreground">
                    Link a hotel from your inventory
                  </div>
                </button>
                <button
                  onClick={() => setMode("create")}
                  className={`flex-1 rounded-lg border p-4 text-left transition-colors ${
                    mode === "create"
                      ? "border-primary bg-primary/5"
                      : "border-border/50 hover:border-border"
                  }`}
                >
                  <div className="font-medium">Create New</div>
                  <div className="text-sm text-muted-foreground">
                    Add a new hotel to the system
                  </div>
                </button>
              </div>

              {mode === "select" ? (
                <div className="space-y-2">
                  <Label>Select Hotel</Label>
                  {availableHotels.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border/50 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
                      No available hotels found. Create a new hotel instead.
                    </div>
                  ) : (
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {availableHotels.map((hotel) => (
                        <button
                          key={hotel._id}
                          onClick={() => setSelectedHotelId(hotel._id)}
                          className={`w-full rounded-lg border p-3 text-left transition-colors ${
                            selectedHotelId === hotel._id
                              ? "border-primary bg-primary/5"
                              : "border-border/50 hover:border-border"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-medium">{hotel.name}</div>
                            {selectedHotelId === hotel._id && (
                              <Check className="size-4 text-primary" />
                            )}
                          </div>
                          {hotel.city && (
                            <div className="text-sm text-muted-foreground">
                              {hotel.city}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="hotel-name">Hotel Name *</Label>
                    <Input
                      id="hotel-name"
                      value={newHotelName}
                      onChange={(e) => setNewHotelName(e.target.value)}
                      placeholder="e.g., Grand Plaza Hotel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hotel-city">City</Label>
                    <Input
                      id="hotel-city"
                      value={newHotelCity}
                      onChange={(e) => setNewHotelCity(e.target.value)}
                      placeholder="e.g., London"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="hotel-address">Address</Label>
                    <Input
                      id="hotel-address"
                      value={newHotelAddress}
                      onChange={(e) => setNewHotelAddress(e.target.value)}
                      placeholder="e.g., 123 Main Street"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Room Types */}
          {currentStep === "roomTypes" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Use Existing Room Types</Label>
                {existingRoomTypes && existingRoomTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {existingRoomTypes.map((rt) => {
                      const isSelected = !!selectedRoomTypes.find(
                        (srt) => srt.id === rt._id
                      )
                      return (
                        <button
                          key={rt._id}
                          onClick={() => addExistingRoomType(rt._id)}
                          disabled={isSelected}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm transition-colors ${
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                        >
                          <BedDouble className="size-3" />
                          {rt.label}
                          {isSelected && <Check className="ml-1 size-3" />}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No existing room types found.
                  </p>
                )}
              </div>

              <div className="border-t border-border/50 pt-4">
                <Label>Create New Room Type</Label>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={newRoomTypeLabel}
                    onChange={(e) => setNewRoomTypeLabel(e.target.value)}
                    placeholder="e.g., Deluxe Suite"
                    className="flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addNewRoomType()
                      }
                    }}
                  />
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={newRoomTypeCapacity}
                    onChange={(e) => setNewRoomTypeCapacity(e.target.value)}
                    className="w-20"
                    placeholder="Capacity"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={addNewRoomType}
                    disabled={!newRoomTypeLabel.trim()}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Capacity = number of beds per room
                </p>
              </div>

              {selectedRoomTypes.length > 0 && (
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <Label className="mb-2 block">Selected Room Types</Label>
                  <div className="space-y-2">
                    {selectedRoomTypes.map((rt) => (
                      <div
                        key={rt.id}
                        className="flex items-center justify-between rounded bg-background p-2"
                      >
                        <div className="flex items-center gap-2">
                          <BedDouble className="size-4 text-muted-foreground" />
                          <span className="font-medium">{rt.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {rt.capacity} beds
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRoomType(rt.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Room Counts */}
          {currentStep === "rooms" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Specify how many rooms of each type are available at this hotel.
              </p>

              <div className="space-y-3">
                {selectedRoomTypes.map((rt) => (
                  <div
                    key={rt.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 p-3"
                  >
                    <div className="flex items-center gap-2">
                      <BedDouble className="size-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{rt.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {rt.capacity} beds per room
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateRoomCount(rt.id, rt.roomCount - 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 hover:bg-muted"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-medium">
                        {rt.roomCount}
                      </span>
                      <button
                        onClick={() => updateRoomCount(rt.id, rt.roomCount + 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 hover:bg-muted"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {selectedRoomTypes.some((rt) => rt.roomCount === 0) && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-600">
                  <AlertCircle className="size-4" />
                  All room types must have at least 1 room
                </div>
              )}

              <div className="rounded-lg bg-muted/50 p-3">
                <div className="text-sm">
                  <span className="font-medium">Total: </span>
                  {selectedRoomTypes.reduce(
                    (sum, rt) => sum + rt.roomCount,
                    0
                  )}{" "}
                  rooms
                  {" · "}
                  {selectedRoomTypes.reduce(
                    (sum, rt) => sum + rt.roomCount * rt.capacity,
                    0
                  )}{" "}
                  beds
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === "review" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/50 p-4">
                <h4 className="mb-3 font-medium">Hotel</h4>
                {mode === "select" ? (
                  <div className="flex items-center gap-2">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span>
                      {
                        existingHotels?.find((h) => h._id === selectedHotelId)
                          ?.name
                      }
                    </span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="font-medium">{newHotelName}</div>
                    {newHotelCity && (
                      <div className="text-sm text-muted-foreground">
                        {newHotelCity}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/50 p-4">
                <h4 className="mb-3 font-medium">Room Configuration</h4>
                <div className="space-y-2">
                  {selectedRoomTypes.map((rt) => (
                    <div
                      key={rt.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <BedDouble className="size-4 text-muted-foreground" />
                        <span>{rt.label}</span>
                        <Badge variant="outline" className="text-xs">
                          {rt.capacity} beds
                        </Badge>
                      </div>
                      <span className="font-medium">
                        {rt.roomCount} {rt.roomCount === 1 ? "room" : "rooms"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-border/50 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Rooms</span>
                    <span className="font-medium">
                      {selectedRoomTypes.reduce(
                        (sum, rt) => sum + rt.roomCount,
                        0
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Total Capacity
                    </span>
                    <span className="font-medium">
                      {selectedRoomTypes.reduce(
                        (sum, rt) => sum + rt.roomCount * rt.capacity,
                        0
                      )}{" "}
                      beds
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                <Check className="size-4 text-primary" />
                This will automatically create accommodation slots for your
                event
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={currentStep === "hotel" ? handleClose : handleBack}
            disabled={isSubmitting}
          >
            {currentStep === "hotel" ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="mr-1 size-4" />
                Back
              </>
            )}
          </Button>

          {currentStep !== "review" ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <span className="mr-2 size-4 animate-spin">...</span>
                  Creating...
                </>
              ) : (
                <>
                  <Check className="mr-2 size-4" />
                  Add Hotel
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
