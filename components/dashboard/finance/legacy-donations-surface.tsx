"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
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
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import type { EventDashboardEvent } from "@/components/dashboard/event-dashboard-context"

type Donation = {
  id: string
  source: "cash" | "bank_transfer"
  payerName: string
  amountMinor: number
  paidAt: string
  notes: string | null
}

export default function EventDonationPage({
  slug,
  event,
}: {
  slug: string
  event: EventDashboardEvent
}) {
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

  return (
    <section className="min-w-0 space-y-6">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Event-scoped donation ledger</p>
          <p className="text-xs text-muted-foreground">{event.title} · standalone cash and bank transfer records</p>
        </div>
        <Button onClick={() => setShowForm((current) => !current)} className="h-9 rounded-lg">
          <Plus className="mr-2 size-4" />
          {showForm ? "Cancel" : "Record donation"}
        </Button>
      </div>

      {errorMessage && (
        <DashboardQueryState state="error" message={errorMessage} onRetry={() => void load()} className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4" />
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
        <span className="font-semibold">Recorded total: {isLoading || errorMessage ? "Unavailable" : formatMoney(totalDonationMinor)}</span>
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
            <DashboardQueryState state="loading" className="py-8" />
          ) : errorMessage ? (
            <DashboardQueryState state="error" message={errorMessage} onRetry={() => void load()} className="py-8" />
          ) : donations.length === 0 ? (
            <DashboardQueryState state="empty" message="No donations have been recorded for this event." className="rounded-2xl border border-dashed border-border/50 bg-background/50 p-6" />
          ) : (
            <div className="min-w-0 rounded-2xl border border-border/50 bg-background/50">
              <Table>
                <TableCaption>Standalone event-scoped donation ledger</TableCaption>
                <TableHeader className="bg-muted/30 text-[10px] font-black tracking-[0.2em] text-muted-foreground uppercase">
                  <TableRow>
                    <TableHead>Payer</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/40">
                  {donations.map((donation) => (
                    <TableRow key={donation.id} className="transition-colors hover:bg-black/5 dark:hover:bg-white/5">
                      <TableCell className="font-medium text-foreground">{donation.payerName}</TableCell>
                      <TableCell className="font-mono text-sm font-semibold tabular-nums text-primary">
                        {formatMoney(donation.amountMinor)}
                      </TableCell>
                      <TableCell className="capitalize text-muted-foreground">
                        {donation.source.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(donation.paidAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{donation.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
