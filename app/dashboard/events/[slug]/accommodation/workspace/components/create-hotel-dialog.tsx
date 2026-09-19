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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      const timer = setTimeout(() => {
        setName("")
        setCity("")
        setError(null)
      }, 200)
      return () => clearTimeout(timer)
    }
  }, [open])

  const handleClose = () => onOpenChange(false)

  const handleSubmit = async () => {
    if (!name.trim()) return
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        city: city.trim() || undefined,
      })
      handleClose()
    } catch (err) {
      // The page handler rethrows, so without this the dialog simply stayed
      // open with no message and the failure was invisible to the operator.
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Could not add the hotel. Please try again."
      )
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && isSubmitting) return
        handleClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="size-5" />
            Add Hotel
          </DialogTitle>
          <DialogDescription>
            Add a hotel for this event, then configure its rooms for attendee
            assignments.
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

          {error ? (
            <p
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm font-medium text-destructive"
            >
              {error}
            </p>
          ) : null}
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
