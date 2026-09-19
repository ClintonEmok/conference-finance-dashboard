"use client"

import { useState } from "react"
import { useMutation } from "convex/react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  buildDonationDeletionConfirmation,
  donationDeletionRefusalCopy,
  nextDonationDeletionKey,
} from "@/lib/dashboard/donation-deletion-copy"

/**
 * The subset of the server's frozen deletion result this dialog forwards. The
 * mutation returns the full frozen snapshot (`remainingMinor`, `rows`, …); the
 * dialog only needs to hand the hosting page what its success band renders.
 * Nothing here is recomputed — every figure came from the mutation's stored
 * result or from a server-provided prop.
 */
export type DonationDeletionResult = {
  donationAmountMinor: number
  reversedAllocationMinor: number
  allocationCount: number
}

/**
 * DDEL-01's confirmation dialog. The component IS the confirmation gate: the
 * mutation is only reachable through the destructive submit button rendered
 * inside this dialog, and the amount and allocation count are already loaded
 * props — so the submit is disabled only while a deletion is in flight, never
 * pending a pre-confirmation fetch.
 *
 * The hosting page remounts this component per donation via
 * `key={`deletion-${deleteTarget.donationId}`}` (61-01 namespaced the 58-09
 * key so it can no longer collide with the record panel or the allocation
 * dialog, which are siblings in the same children list), so a different
 * donation gets a fresh key from the state initializer without an effect.
 */
export type DonationDeleteDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Flows verbatim into `deleteDonation`; the mutation's arg is `Id<"payments">`. */
  donationId: Id<"payments">
  eventId: Id<"events">
  // Server-provided donation amount; `formatMoney` runs in the copy builder.
  amountMinor: number
  payerName: string
  /**
   * From `getEventDonationIncome.donations[].allocationCount` (or a loaded
   * `getDonationAllocationSummary.rows.length`) — never counted from rows in
   * the UI. The hosting page owns the readiness gate; this prop is required.
   */
  allocationCount: number
  onDeleted: (result: DonationDeletionResult) => void
}

export function DonationDeleteDialog({
  open,
  onOpenChange,
  donationId,
  eventId,
  amountMinor,
  payerName,
  allocationCount,
  onDeleted,
}: DonationDeleteDialogProps) {
  const deleteDonation = useMutation(api.donationDeletion.deleteDonation)

  // ONE key per donation, minted when the dialog opens. Every retry below —
  // a refusal, a transient error, a double-click — submits this same key, so
  // the server's replay ledger returns the frozen result instead of refusing
  // with DONATION_DELETE_ALREADY_DELETED. Regeneration happens only after a
  // successful deletion.
  const [keyState, setKeyState] = useState(() =>
    nextDonationDeletionKey(null, donationId)
  )
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleDelete() {
    setErrorMessage(null)
    setIsDeleting(true)
    try {
      const result: DonationDeletionResult = await deleteDonation({
        donationId,
        eventId,
        idempotencyKey: keyState.key,
      })
      // The key is regenerated ONLY on this success path. The catch below must
      // never touch `keyState` — a retry has to replay the same submission.
      setKeyState((prev) =>
        nextDonationDeletionKey(prev, donationId, { succeeded: true })
      )
      onDeleted(result)
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(
        donationDeletionRefusalCopy(error instanceof Error ? error.message : "")
      )
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Overlay/Escape cannot close the dialog while the deletion is in
        // flight; the close affordance is hidden too.
        if (!nextOpen && isDeleting) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!isDeleting}>
        <DialogHeader>
          <DialogTitle>Delete donation</DialogTitle>
          <DialogDescription>
            {buildDonationDeletionConfirmation({
              amountMinor,
              payerName,
              allocationCount,
            })}
          </DialogDescription>
        </DialogHeader>
        {errorMessage ? (
          <div
            role="alert"
            aria-live="assertive"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm font-medium text-destructive"
          >
            {errorMessage}
          </div>
        ) : null}
        <DialogFooter aria-busy={isDeleting}>
          <Button
            type="button"
            variant="ghost"
            disabled={isDeleting}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
          >
            Keep donation
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDeleting}
            onClick={() => void handleDelete()}
            className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
          >
            {isDeleting ? "Deleting…" : "Delete donation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
