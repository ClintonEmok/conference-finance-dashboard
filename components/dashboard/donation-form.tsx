"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"

type Event = {
  eventId: string
  title: string | null
}

type DonationFormProps = {
  events: Event[]
  selectedEventId: string | null
  onSelectEvent: (eventId: string | null) => void
  onSuccess: () => void
}

export function DonationForm({
  events,
  selectedEventId,
  onSelectEvent,
  onSuccess,
}: DonationFormProps) {
  const [payerName, setPayerName] = useState("")
  const [amount, setAmount] = useState("")
  const [source, setSource] = useState<"cash" | "bank_transfer">("cash")
  const [notes, setNotes] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!selectedEventId) {
      setError("Please select an event")
      return
    }

    if (!payerName.trim()) {
      setError("Payer name is required")
      return
    }

    const amountMinor = Math.round(parseFloat(amount) * 100)
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      setError("Amount must be a positive number")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch("/api/dashboard/donations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEventId,
          payerName: payerName.trim(),
          amountMinor,
          paidAt: Date.now(),
          source,
          notes: notes.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error?.message || "Failed to create donation")
      }

      // Reset form
      setPayerName("")
      setAmount("")
      setNotes("")
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create donation")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border/50 bg-background/50 p-6">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Event
          </label>
          <select
            value={selectedEventId ?? ""}
            onChange={(e) => onSelectEvent(e.target.value || null)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            required
          >
            <option value="">Select an event</option>
            {events.map((event) => (
              <option key={event.eventId} value={event.eventId}>
                {event.title || "Unnamed Event"}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Payer Name
          </label>
          <Input
            value={payerName}
            onChange={(e) => setPayerName(e.target.value)}
            placeholder="Who made the donation?"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Amount (EUR)
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase text-muted-foreground">
            Source
          </label>
          <select
            value={source}
            onChange={(e) =>
              setSource(e.target.value as "cash" | "bank_transfer")
            }
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase text-muted-foreground">
          Notes (optional)
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any additional notes..."
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="rounded-xl">
          {isSubmitting ? "Creating..." : "Create Donation"}
        </Button>
      </div>
    </form>
  )
}
