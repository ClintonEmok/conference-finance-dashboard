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
  allocationRemovalRefusalCopy,
  buildAllocationRemovalConfirmation,
  nextAllocationRemovalKey,
} from "@/lib/dashboard/donation-allocation-removal-copy"

/**
 * D-06's per-allocation removal dialog (Phase 61, plan 61-07).
 *
 * This is the LIGHT confirmation — deliberately separate from DDEL-01's
 * donation-deletion dialog and never importing or reusing its contract. It is
 * lighter because the donation SURVIVES the action and the action is trivially
 * repeatable: the operator confirms one allocation's removal, not a whole
 * donation's worth.
 *
 * The component IS the confirmation gate: the mutation is only reachable
 * through the destructive submit button rendered inside this dialog (the record
 * panel merely ARMS the target). It submits through the EXISTING
 * `api.donations.removeDonationAllocation` — a hard delete plus one audit row —
 * and NEVER through a set-replace via `allocateDonation`, which is a different
 * ledger operation with different audit rows.
 *
 * One key per donation, minted when the dialog opens. Every retry below — a
 * refusal, a transient error, a double-click — submits this same key, because
 * the server resolves a replay BEFORE its guards: a regenerated key would
 * surface `DONATION_ALLOCATION_NOT_FOUND` for work that already succeeded.
 * Regeneration happens only after a successful removal.
 *
 * The hosting surface remounts this component per removal target via
 * `key={`removal-${removalTarget.attendeeId}`}` (the 61-01 element-namespaced
 * mount-key rule), so a different allocation gets a fresh key from the state
 * initializer without an effect.
 */
export type DonationAllocationRemovalResult = {
  allocatedTotalMinor: number
  remainingMinor: number
}

export type DonationAllocationRemovalDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Flows verbatim into `removeDonationAllocation`; the mutation's arg is `Id<"payments">`. */
  donationId: Id<"payments">
  eventId: Id<"events">
  attendeeId: Id<"orderAttendees">
  // The allocation row's RECORDED amount (never its applied figure): removal
  // frees what was recorded. `formatMoney` runs in the copy builder.
  amountMinor: number
  attendeeName: string
  onRemoved: (result: DonationAllocationRemovalResult) => void
}

export function DonationAllocationRemovalDialog({
  open,
  onOpenChange,
  donationId,
  eventId,
  attendeeId,
  amountMinor,
  attendeeName,
  onRemoved,
}: DonationAllocationRemovalDialogProps) {
  const removeAllocation = useMutation(api.donations.removeDonationAllocation)

  const [keyState, setKeyState] = useState(() =>
    nextAllocationRemovalKey(null, donationId)
  )
  const [isRemoving, setIsRemoving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleRemove() {
    setErrorMessage(null)
    setIsRemoving(true)
    try {
      const result = await removeAllocation({
        donationId,
        eventId,
        attendeeId,
        idempotencyKey: keyState.key,
      })
      // The key is regenerated ONLY on this success path. The catch below must
      // never touch `keyState` — a retry has to replay the same submission.
      setKeyState((prev) =>
        nextAllocationRemovalKey(prev, donationId, { succeeded: true })
      )
      onRemoved(result)
      onOpenChange(false)
    } catch (error) {
      setErrorMessage(
        allocationRemovalRefusalCopy(
          error instanceof Error ? error.message : ""
        )
      )
    } finally {
      setIsRemoving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        // Overlay/Escape cannot close the dialog while the removal is in
        // flight; the close affordance is hidden too.
        if (!nextOpen && isRemoving) return
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!isRemoving}>
        <DialogHeader>
          <DialogTitle>Remove allocation</DialogTitle>
          <DialogDescription>
            {buildAllocationRemovalConfirmation({ amountMinor, attendeeName })}
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
        <DialogFooter aria-busy={isRemoving}>
          <Button
            type="button"
            variant="ghost"
            disabled={isRemoving}
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
          >
            Keep allocation
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isRemoving}
            onClick={() => void handleRemove()}
            className="h-9 rounded-lg px-4 text-xs font-bold tracking-wider uppercase"
          >
            {isRemoving ? "Removing…" : "Remove allocation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
