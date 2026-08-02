"use client"

import { use, useCallback, useEffect, useMemo, useState } from "react"
import { Plus } from "lucide-react"

import { DonationForm } from "@/components/dashboard/donation-form"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useEventBySlug } from "@/lib/convex/hooks/events"
import { formatMoney } from "@/lib/format"

type Donation = {
  id: string
  source: "cash" | "bank_transfer"
  payerName: string
  amountMinor: number
  paidAt: string
  notes: string | null
}

export default function EventDonationPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const event = useEventBySlug(slug)
  const [donations, setDonations] = useState<Donation[]>([])
  const [showForm, setShowForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!event?._id) return

      setIsLoading(true)
      setErrorMessage(null)

      try {
        const response = await fetch(
          `/api/dashboard/donations?eventId=${encodeURIComponent(event._id)}`,
          { signal }
        )

        if (!response.ok) {
          throw new Error("Failed to load donations")
        }

        const data = await response.json()
        setDonations(data.donations ?? [])
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return
        setErrorMessage("Unable to load donations for this event.")
      } finally {
        setIsLoading(false)
      }
    },
    [event?._id]
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const totalDonationMinor = useMemo(
    () => donations.reduce((sum, donation) => sum + donation.amountMinor, 0),
    [donations]
  )

  if (event === undefined) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    )
  }

  if (event === null) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/40 p-10 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <p className="mt-2 text-muted-foreground">
          The event with slug &ldquo;{slug}&rdquo; does not exist.
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Event-scoped donation ledger</p>
          <p className="text-xs text-muted-foreground">{event.title} · standalone cash and bank transfer records</p>
        </div>
        <Button onClick={() => setShowForm((current) => !current)} className="h-9 rounded-lg">
          <Plus className="mr-2 size-4" />
          {showForm ? "Cancel" : "Record donation"}
        </Button>
      </div>

      {errorMessage && (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm font-medium text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
        <span className="font-semibold">Recorded total: {isLoading ? "Checking…" : formatMoney(totalDonationMinor)}</span>
        <span className="text-muted-foreground">{isLoading ? "Checking donation records…" : `${donations.length} event-scoped record${donations.length === 1 ? "" : "s"}`}</span>
      </div>

      <Card className="border-border/60 bg-card shadow-none">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle>Donation ledger</CardTitle>
            <CardDescription>Every standalone donation recorded for {event.title}.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showForm && (
            <DonationForm
              eventId={String(event._id)}
              eventTitle={event.title}
              onSuccess={() => {
                setShowForm(false)
                void load()
              }}
            />
          )}

          {isLoading ? (
            <Skeleton className="h-48 w-full rounded-2xl" />
          ) : donations.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border/50 bg-background/50 p-6 text-sm text-muted-foreground">
              No donations have been recorded for this event.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-border/50 bg-background/50">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border/40 bg-muted/30 text-left text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                  <tr>
                    <th className="px-4 py-3">Payer</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {donations.map((donation) => (
                    <tr key={donation.id} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-foreground">{donation.payerName}</td>
                      <td className="px-4 py-3 font-mono text-sm font-semibold tabular-nums text-primary">
                        {formatMoney(donation.amountMinor)}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {donation.source.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(donation.paidAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{donation.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
