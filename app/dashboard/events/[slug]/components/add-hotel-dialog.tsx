"use client"

import { useEffect, useMemo, useState } from "react"
import { Building2, Check, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import type { Doc, Id } from "@/convex/_generated/dataModel"

interface AddHotelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  existingHotels: Doc<"accommodationHotels">[] | undefined
  linkedHotelIds: string[]
  onSubmit: (data: { hotelId: Id<"accommodationHotels"> }) => Promise<void>
  isSubmitting: boolean
}

export function AddHotelDialog({
  open,
  onOpenChange,
  existingHotels,
  linkedHotelIds,
  onSubmit,
  isSubmitting,
}: AddHotelDialogProps) {
  const [selectedHotelId, setSelectedHotelId] = useState("")

  const availableHotels = useMemo(
    () =>
      existingHotels?.filter((hotel) => !linkedHotelIds.includes(hotel._id)) ||
      [],
    [existingHotels, linkedHotelIds]
  )

  useEffect(() => {
    if (!selectedHotelId) return
    if (availableHotels.some((hotel) => hotel._id === selectedHotelId)) return
    setSelectedHotelId("")
  }, [availableHotels, selectedHotelId])

  const handleClose = () => {
    onOpenChange(false)
    setTimeout(() => setSelectedHotelId(""), 200)
  }

  const handleSubmit = async () => {
    if (!selectedHotelId) return
    await onSubmit({ hotelId: selectedHotelId as Id<"accommodationHotels"> })
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Import Inventory
          </DialogTitle>
          <DialogDescription>
            Link a hotel from global inventory to this event. Its existing rooms
            will be available for allocation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {availableHotels.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
              No unassigned hotels are available in global inventory.
            </div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {availableHotels.map((hotel) => {
                const isSelected = selectedHotelId === hotel._id

                return (
                  <button
                    key={hotel._id}
                    type="button"
                    onClick={() => setSelectedHotelId(hotel._id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border/50 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{hotel.name}</div>
                        {hotel.city && (
                          <div className="text-sm text-muted-foreground">
                            {hotel.city}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          Global inventory
                        </Badge>
                        {isSelected && (
                          <Check className="size-4 text-primary" />
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedHotelId || isSubmitting}
          >
            Import inventory
            <ChevronRight className="ml-2 size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
