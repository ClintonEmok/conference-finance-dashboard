"use client"

import { useEffect, useState } from "react"
import { Building2, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface CreateHotelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: { name: string; city?: string }) => Promise<void>
  isSubmitting: boolean
}

export function CreateHotelDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: CreateHotelDialogProps) {
  const [name, setName] = useState("")
  const [city, setCity] = useState("")

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setName("")
        setCity("")
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleClose = () => onOpenChange(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    await onSubmit({
      name: name.trim(),
      city: city.trim() || undefined,
    })
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Add Hotel
          </DialogTitle>
          <DialogDescription>
            Create a new hotel in global inventory, link it to this event, then
            add room inventory.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="hotel-name">Hotel name</Label>
            <Input
              id="hotel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Grace Hotel"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hotel-city">City</Label>
            <Input
              id="hotel-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="e.g. Nairobi"
            />
          </div>
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
            disabled={!name.trim() || isSubmitting}
          >
            Add hotel
            <ChevronRight className="ml-2 size-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
