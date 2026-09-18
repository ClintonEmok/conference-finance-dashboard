"use client"

import { useQuery } from "convex/react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DashboardQueryState } from "@/components/dashboard/dashboard-query-state"
import { api } from "@/lib/convex/api"
import { formatMoney } from "@/lib/format"
import type { Id } from "@/convex/_generated/dataModel"

/**
 * The order detail's allocation entry chooser (Phase 61, plan 61-04, D-02).
 *
 * THIS IS AN ENTRY POINT, NOT AN EDITOR. It lists the event's standalone
 * donations that still have an unallocated remainder and reports the
 * operator's choice to its host. It has NO mutation, NO preview and NO money
 * arithmetic: every figure is a named server field rendered verbatim through
 * `formatMoney`, and every write still flows through the single
 * `DonationAllocationDialog` code path.
 *
 * The `unallocatedRemainderMinor > 0` comparison is a DISPLAY filter over a
 * server-provided field (which row is choosable); it produces no figure.
 */

export type AllocateDonationChoice = {
  donationId: Id<"payments">
  payerName: string
  amountMinor: number
}

type AllocateDonationToOrderProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  eventId: Id<"events">
  onSelect: (donation: AllocateDonationChoice) => void
}

export function AllocateDonationToOrder({
  open,
  onOpenChange,
  eventId,
  onSelect,
}: AllocateDonationToOrderProps) {
  const income = useQuery(api.donations.getEventDonationIncome, { eventId })

  const choosable = (income?.donations ?? []).filter(
    (donation) => donation.unallocatedRemainderMinor > 0
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Allocate a donation to this order</DialogTitle>
          <DialogDescription>
            Choose a donation with an unallocated remainder. The allocation
            editor opens next, pre-scoped to this order&apos;s attendees.
          </DialogDescription>
        </DialogHeader>

        {income === undefined ? (
          <DashboardQueryState state="loading" className="py-6" />
        ) : choosable.length === 0 ? (
          <DashboardQueryState
            state="empty"
            title="Nothing to allocate"
            message="No donations with an unallocated remainder."
            className="py-6"
          />
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {choosable.map((donation) => (
              <div
                key={donation.donationId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <p
                    className="truncate text-sm font-medium"
                    title={donation.payerName}
                  >
                    {donation.payerName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {`Donation ${formatMoney(donation.donationAmountMinor)} · Unallocated remainder ${formatMoney(donation.unallocatedRemainderMinor)}`}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg"
                  onClick={() =>
                    onSelect({
                      donationId: donation.donationId,
                      payerName: donation.payerName,
                      amountMinor: donation.donationAmountMinor,
                    })
                  }
                >
                  Choose
                </Button>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
